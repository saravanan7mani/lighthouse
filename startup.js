const {getLND} = require('./lnd');
const {getNetworkGraph} = require('ln-service');
const {getNode} = require('ln-service');
const {getDB} = require('./db');
const {subscribeToLNDGraph} = require('./lndService');
const config = require('./config.json');
const {DB_QUERIES} = require('./constants');
const logger = require('log4js').getLogger("startup");

async function loadGraphToDB() {
    const driver = getDB();
    let session;
    try {
        const lnd = getLND();
        const lndGraphToDBHandler = subscribeToLNDGraph();
        const {channels, nodes} = await getNetworkGraph({lnd});
        logger.info((nodes.length) + ' LN nodes and ' + (channels.length) + ' LN channels to be loaded');
        logger.info((nodes.length + channels.length) + ' graph nodes and ' + (channels.length * 2) + ' graph edges to be loaded');

        session = driver.session();
        await session.writeTransaction(async tx => {
            return await populateGraph(nodes, channels, tx);
        });

        await session.close();

        lndGraphToDBHandler.on('move', processLndGraphNotifications);
        lndGraphToDBHandler.moveToDB();

        logger.info((nodes.length + channels.length) + ' nodes and ' + (channels.length * 2) + ' edges are loaded');
    }
    catch (e) {
        logger.fatal('error while LND to DB data loading. ' + e);
        if (session) {
            await session.close()
        }
        throw e;
    }
}

async function populateGraph(nodes, channels, dbTx) {
    const validNodes = new Set();
    await populateNodes(nodes, validNodes, dbTx);
    const validChannels = new Set();
    await populateChannels(channels, validNodes, validChannels, dbTx);
    await deleteStaleChannels(validChannels, dbTx); // To remove stale channels & nodes from DB that are missed by above update query.
    await deleteStaleNodes(validNodes, dbTx);
    await updateNodeTotalCapacity(validNodes, dbTx);
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
async function populateChannels(channels, validNodes, validChannels, dbTx) {
    const txPromises = [];
    for (let i = 0; i < channels.length; i++) {
        const channel = channels[i];
        validChannels.add(channel.id);
        validNodes.add(channel.policies[0].public_key);
        validNodes.add(channel.policies[1].public_key);

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

async function updateNodeTotalCapacity(validNodes, dbTx) {
    const lnd = getLND();
    const nodeInfoPromises = [];
    for (let key of validNodes) {
        nodeInfoPromises.push(processNodeTotalCapacity(lnd, key, dbTx));
    }
    return Promise.all(nodeInfoPromises);
}

async function processNodeTotalCapacity(lnd, key, dbTx) {
    const nodeDetail = await getNode({lnd, public_key: key});
    return dbTx.run(
        DB_QUERIES.UPDATE_NODE_CAPACITY_INFO,
        {
            public_key : key,
            capacity : nodeDetail.capacity,
            channel_count : nodeDetail.channel_count
        }
    )
}

// to be replaced with above adter testings
async function processNodeTotalCapacityNotify(lnd, key, dbTx) {
    logger.debug('CLOSE NODE: processNodeTotalCapacityNotify-key: '+key);
    let nodeDetail;
    try {
        nodeDetail = await getNode({lnd, public_key: key});
    }
    catch (e) {
        logger.error('ERROR while getNode for keyof close channel notification : ' + key + ', err: ' + e)
        return;
    }
    logger.debug('CLOSE NODE: processNodeTotalCapacityNotify-nodeDetail.capacity: '+nodeDetail.capacity + ', nodeDetail.channel_count: ' + nodeDetail.channel_count + ', key: ' + key)
    return dbTx.run(
        DB_QUERIES.UPDATE_NODE_CAPACITY_INFO,
        {
            public_key : key,
            capacity : nodeDetail.capacity,
            channel_count : nodeDetail.channel_count
        }
    )
}

function processLndGraphNotifications() {
    const notifications = [...this.notifications];
    this.notifications = [];
    for (let i = 0; i < notifications.length; i++) {
        processLndGraphNotification(notifications[i], this);
    }
}


async function processLndGraphNotification(notification, lndGraphToDBHandler) {
    let session;
    try {
        const db = getDB();
        session = db.session();
        const lnd = getLND();

        await session.writeTransaction(async dbTx => {
            if (notification.public_key) {
                const nodeDetail = await getNode({lnd, public_key: notification.public_key});
                // logger.debug('\n\nnode update received: ' + JSON.stringify(notification) + '\nNODE CAP & CH COUNT: ' + nodeDetail.capacity + ' & ' + nodeDetail.channel_count);
                await dbTx.run(
                    DB_QUERIES.UPDATE_NODE_NOTIFICATION,
                    {
                        public_key: notification.public_key,
                        alias: notification.alias,
                        color: notification.color,
                        sockets: notification.sockets || null,
                        capacity : nodeDetail.capacity,
                        channel_count : nodeDetail.channel_count,
                        updated_at: notification.updated_at
                    }
                );
            }
            else if (notification.close_height) {
                let channel_point = null;
                if (typeof notification.transaction_id !== 'undefined' && typeof notification.transaction_vout !== 'undefined') {
                    channel_point = notification.transaction_id + ':' + notification.transaction_vout;
                }
                const public_keys = await dbTx.run(
                    DB_QUERIES.UPDATE_CHANNEL_CLOSE_NOTIFICATION,
                    {
                        c_channel_id: notification.id,
                        c_close_height: notification.close_height,
                        c_capacity: notification.capacity,
                        c_channel_point: channel_point,
                        c_updated_at: notification.updated_at
                    }
                );
                logger.debug('\n\nchannel closed update received: ' + JSON.stringify(notification) + '\nNODE CAP & CH COUNT: ' + public_keys);
                if (public_keys && public_keys.records 
                    && typeof public_keys.records.length !== 'undefined' && public_keys.records.length == 2) {
                        logger.debug('\nCLOSE NODE CAP & CH COUNT');
                    await Promise.all([processNodeTotalCapacityNotify(lnd, public_keys.records[0].get('public_keys'), dbTx),
                    processNodeTotalCapacityNotify(lnd, public_keys.records[1].get('public_keys'), dbTx)]);
                }
            } else {
                // logger.debug('\n\nchannel update received: ' + JSON.stringify(notification));
                const nodeDetails = await Promise.all([getNode({lnd, public_key: notification.public_keys[0]}), 
                            getNode({lnd, public_key: notification.public_keys[1]})]);
                // logger.debug('\n\nchannel update received: ' + JSON.stringify(notification) + '\nNODE0 CAP & CH COUNT: ' + nodeDetails[0].capacity + ' & ' + nodeDetails[0].channel_count  + '\nNODE1 CAP & CH COUNT: ' + nodeDetails[1].capacity + ' & ' + nodeDetails[1].channel_count);
                await dbTx.run(
                    DB_QUERIES.UPDATE_CHANNEL_NOTIFICATION,
                    {
                        n0_public_key: notification.public_keys[0],
                        n1_public_key: notification.public_keys[1],
                        n0_capacity : nodeDetails[0].capacity,
                        n0_channel_count : nodeDetails[0].channel_count,
                        n1_capacity : nodeDetails[1].capacity,
                        n1_channel_count : nodeDetails[1].channel_count,
    
                        c_channel_id: notification.id,
                        c_channel_point: notification.transaction_id + ':' + notification.transaction_vout,
                        c_capacity: notification.capacity,
                        c_updated_at: notification.updated_at,
    
                        r0_base_fee_mtokens: notification.base_fee_mtokens,
                        r0_cltv_delta: notification.cltv_delta,
                        r0_fee_rate: notification.fee_rate,
                        r0_is_disabled: notification.is_disabled,
                        r0_max_htlc_mtokens: notification.max_htlc_mtokens || null,
                        r0_min_htlc_mtokens: notification.min_htlc_mtokens,
                        r0_updated_at: notification.updated_at
                    }
                );
            }
        });

        await session.close();
    }
    catch(e) {
        try {
            await session.close();
        }
        catch(se) {
            logger.warn('\n\nerror while session close.' + se);
        }
        logger.error('while processing lightning graph notification. ' + e);
        if (notification.lh_max_retry && notification.lh_max_retry == config.lh_max_retry) {
            logger.fatal('\n\nCRITICAL ERROR: Failed to process the notification.' + JSON.stringify(notification));
        }
        else {
            logger.info('\n\nWARNING: Failed to process the notification. Will retry: ' + JSON.stringify(notification));
            notification.lh_max_retry = notification.lh_max_retry ? notification.lh_max_retry + 1 : 1;
            lndGraphToDBHandler.notifications.push(notification);
            logger.info('\n\nNew retry count: ' + notification.lh_max_retry);
        }
    }
}

module.exports = {
    loadGraphToDB
};