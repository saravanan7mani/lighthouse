const {getLND} = require('./lnd');
const {getNetworkGraph} = require('ln-service');
const {getDB} = require('./db');
const {subscribeToLNDGraph} = require('./lndService');
const config = require('./config.json');
const {DB_QUERIES} = require('./constants');

// It requires retry in case of exception before commit. WARNING notification duplicate configs.
async function loadGraphToDB() {
    const db = getDB();
    let session;
    let dbTx;
    try {
        const lnd = getLND();
        const lndGraphToDBHandler = subscribeToLNDGraph();
        const {channels, nodes} = await getNetworkGraph({lnd});
        console.log((nodes.length) + ' LN nodes and ' + (channels.length) + ' LN channels to be loaded');
        console.log((nodes.length + channels.length) + ' graph nodes and ' + (channels.length * 2) + ' graph edges to be loaded');

        session = db.session();
        dbTx = session.beginTransaction();

        await populateGraph(nodes, channels, dbTx);

        await dbTx.commit()
        await session.close()

        lndGraphToDBHandler.on('move', processLndGraphNotifications);
        lndGraphToDBHandler.moveToDB();

        console.log((nodes.length + channels.length) + ' nodes and ' + (channels.length * 2) + ' edges are loaded');
        return (nodes.length + channels.length) + ' nodes and ' + (channels.length * 2) + ' edges are loaded';
    }
    catch (e) {
        if (dbTx) {
            await dbTx.rollback()
        }
        console.log('rolled back. ' + e)
        throw e;
    }
    finally {
        if (session) {
            await session.close()
        }
    }
}

async function populateGraph(nodes, channels, dbTx) {
    const validNodes = new Set();
    const validChannels = new Set();
    await populateNodes(nodes, validNodes, dbTx);
    await populateChannels(channels, validChannels, dbTx);
    await deleteStaleChannels(validChannels, dbTx); // To remove stale channels & nodes from DB that are missed by above update query.
    await deleteStaleNodes(validNodes, dbTx);
}

async function populateNodes(nodes, validNodes, dbTx) {
    const txPromises = [];
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        validNodes.add(node.public_key);

        txPromises.push(dbTx.run(
            DB_QUERIES.POPULATE_NODES,
            {
                public_key: node.public_key,
                alias: node.alias,
                color: node.color,
                sockets: node.sockets,
                updated_at: node.updated_at
            }
        ));
    }
    return await Promise.all(txPromises);
}
// NOTE: There are nodes which has channels but no node info in describegraph.
async function populateChannels(channels, validChannels, dbTx) {
    const txPromises = [];
    for (let i = 0; i < channels.length; i++) {
        const channel = channels[i];
        validChannels.add(channel.id);

        txPromises.push(dbTx.run(
            DB_QUERIES.POPULATE_CHANNELS,
            {
                n0_public_key: channel.policies[0].public_key,
                n1_public_key: channel.policies[1].public_key,

                c_channel_id: channel.id,
                c_channel_point: channel.transaction_id + ':' + channel.transaction_vout,
                c_capacity: channel.capacity,
                c_updated_at: ((channel.updated_at) ? channel.updated_at : null),

                r0_base_fee_mtokens: channel.policies[0].base_fee_mtokens || null,
                r0_cltv_delta: channel.policies[0].cltv_delta || null,
                r0_fee_rate: channel.policies[0].fee_rate || null,
                r0_is_disabled: channel.policies[0].is_disabled || null,
                r0_max_htlc_mtokens: channel.policies[0].max_htlc_mtokens || null,
                r0_min_htlc_mtokens: channel.policies[0].min_htlc_mtokens || null,
                r0_updated_at: ((channel.policies[0].updated_at) ? channel.policies[0].updated_at : null),
                
                r1_base_fee_mtokens: channel.policies[1].base_fee_mtokens || null,
                r1_cltv_delta: channel.policies[1].cltv_delta || null,
                r1_fee_rate: channel.policies[1].fee_rate || null,
                r1_is_disabled: channel.policies[1].is_disabled || null,
                r1_max_htlc_mtokens: channel.policies[1].max_htlc_mtokens || null,
                r1_min_htlc_mtokens: channel.policies[1].min_htlc_mtokens || null,
                r1_updated_at: ((channel.policies[1].updated_at) ? channel.policies[1].updated_at : null)
            }
        ));
    }
    
    return Promise.all(txPromises);
}

async function deleteStaleChannels(validChannels, dbTx) {
    const existing_channel_ids = await dbTx.run(
        DB_QUERIES.ALL_CHANNEL_IDS
    );

    let channelGraphNodeCleanupPromises = [];

    for (let i = 0; i < existing_channel_ids.records.length; i++) {
        const existing_channel_id = existing_channel_ids.records[0].get('channel_id');

        if (!validChannels.has(existing_channel_id)) {
            channelGraphNodeCleanupPromises.push(dbTx.run(
                DB_QUERIES.DELETE_CHANNELS_BY_CHANNEL_IDS,
                {
                    channel_id : existing_channel_id
                }
            ));
        }
    }
    return Promise.all(channelGraphNodeCleanupPromises);
}

async function deleteStaleNodes(validNodes, dbTx) {
    const existing_public_keys = await dbTx.run(
        DB_QUERIES.ALL_NODE_PUBLIC_KEYS
    );

    let nodeGraphNodeCleanupPromises = [];

    for (let i = 0; i < existing_public_keys.records.length; i++) {
        const existing_public_key = existing_public_keys.records[0].get('public_key');

        if (!validNodes.has(existing_public_key)) {
            nodeGraphNodeCleanupPromises.push(dbTx.run(
                DB_QUERIES.DELETE_NODES_BY_NODE_PUBLIC_KEYS,
                {
                    public_key : existing_public_key
                }
            ));
        }
    }
    return Promise.all(nodeGraphNodeCleanupPromises);
}

function processLndGraphNotifications() {
    const notifications = [...this.notifications];
    this.notifications = [];
    console.time('NOTIFICATION_LIST_'+notifications.length)
    for (let i = 0; i < notifications.length; i++) {
        processLndGraphNotification(notifications[i], this);
    }
    console.timeEnd('NOTIFICATION_LIST_'+notifications.length)
}


async function processLndGraphNotification(notification, lndGraphToDBHandler) {
    console.time('NOTIFICATION'+notification.updated_at)
    let session;
    let dbTx;
    try {
        const db = getDB();
        session = db.session();
        dbTx = session.beginTransaction();

        if (notification.public_key) {
            console.log('\n\nnode update received: ' + JSON.stringify(notification));
            const node = notification;
            await dbTx.run(
                DB_QUERIES.UPDATE_NODE_NOTIFICATION,
                {
                    public_key: node.public_key,
                    alias: node.alias,
                    color: node.color,
                    sockets: node.sockets || null,
                    updated_at: node.updated_at
                });
        }
        else if (notification.close_height) {
            console.log('\n\nchannel closed update received: ' + JSON.stringify(notification));
            const channel = notification;
            await dbTx.run(
                DB_QUERIES.UPDATE_CHANNEL_CLOSE_NOTIFICATION,
                {
                    c_channel_id: channel.id,
                    c_close_height: channel.close_height,
                    c_capacity: channel.capacity,
                    c_channel_point: channel.channel_point,
                    c_updated_at: channel.updated_at
                });
        } else {
            console.log('\n\nchannel update received: ' + JSON.stringify(notification));
            const channel = notification; // MERGE (n0)-[r0:OPENED]->(c)<-[r1:OPENED]-(n1) -----> Since no partial connection is expected by any other query in app, it wont create duplicate link.
            await dbTx.run(
                DB_QUERIES.UPDATE_CHANNEL_NOTIFICATION,
                {
                    n0_public_key: channel.public_keys[0],
                    n1_public_key: channel.public_keys[1],

                    c_channel_id: channel.id,
                    c_channel_point: channel.transaction_id + ':' + channel.transaction_vout,
                    c_capacity: channel.capacity,
                    c_updated_at: channel.updated_at,

                    r0_base_fee_mtokens: channel.base_fee_mtokens,
                    r0_cltv_delta: channel.cltv_delta,
                    r0_fee_rate: channel.fee_rate,
                    r0_is_disabled: channel.is_disabled,
                    r0_max_htlc_mtokens: channel.max_htlc_mtokens || null,
                    r0_min_htlc_mtokens: channel.min_htlc_mtokens,
                    r0_updated_at: channel.updated_at
                });
        }

        await dbTx.commit();
    }
    catch(e) {
        console.log('\n\nerror while processing lightning graph notification.' + e);
        if (dbTx) {
            try {
                await dbTx.rollback();
            }
            catch(re) {
                console.log('\n\nerror while rollback. ' + re);
            }
        }
        if (notification.lh_max_retry && notification.lh_max_retry == config.lh_max_retry) {
            console.log('\n\nCRITICAL ERROR: Failed to process the notification.' + JSON.stringify(notification));
        }
        else {
            console.log('\n\nWARNING: Failed to process the notification. Will retry: ' + JSON.stringify(notification));
            notification.lh_max_retry = notification.lh_max_retry ? notification.lh_max_retry + 1 : 1;
            lndGraphToDBHandler.notifications.push(notification);
            console.log('\n\nNew retry count: ' + notification.lh_max_retry);
        }
    }
    finally {
        if (session) {
            try {
                await session.close();
            }
            catch(se) {
                session.log('\n\nerror while session close.' + se);
            }
        }
        console.timeEnd('NOTIFICATION'+notification.updated_at)
    }
}

module.exports = {
    loadGraphToDB
};