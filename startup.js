const {getLND} = require('./lnd');
const {getNetworkGraph} = require('ln-service');
const {getNode} = require('ln-service');
const {subscribeToLNDGraph} = require('./lndService');
const {getDB} = require('./db');

const config = require('./configs/config.json');
const {DB_QUERIES} = require('./constants');
const logger = require('log4js').getLogger("startup");

async function loadGraphToDB() {
    try {
        const lndGraphToDBHandler = subscribeToLNDGraph();
        const lnd = getLND();
        let {channels, nodes} = await getNetworkGraph({lnd});

        const node_count = nodes.length;
        const channel_count = channels.length;
        logger.info('LND returned ' + node_count + ' LN nodes and ' + (channel_count) + ' LN channels for describegraph');
        logger.info('Neo4j DB will load ' + (node_count + channel_count) + ' graph nodes and ' + (channel_count * 2) + ' graph edges.');
        
        let validNodes = new Set();
        await populateNodes(nodes, validNodes);
        nodes = null;
        let validChannels = new Set();
        await populateChannels(channels, validNodes, validChannels);
        channels = null;
        await deleteStaleChannels(validChannels); // To remove stale channels & nodes from DB that are missed by above update query.
        validChannels = null;
        await deleteStaleNodes(validNodes);
        validNodes = null;
        await updateNodeTotalCapacity();

        lndGraphToDBHandler.on('move', processLndGraphNotifications);
        lndGraphToDBHandler.moveToDB();

        logger.info('Neo4j DB has loaded ' + (node_count + channel_count) + ' graph nodes and ' + (channel_count * 2) + ' graph edges.');
    }
    catch (e) {
        logger.fatal('Error while loading describegraph data from LND to Neo4j DB. Restart the server. Error: ' + e);
        throw e;
    }
}

async function populateNodes(nodes, validNodes) {
    const driver = getDB();

    const nodeCount = nodes.length;
    let startIndex = 0;

    while (startIndex < nodeCount) {
        const start = startIndex;
        let end = startIndex + config.queriesPerTransaction-1;
        if (end >= nodeCount) {
            end = nodeCount-1;
        }

        const session = driver.session();
        try {
            await session.writeTransaction(async tx => {
                const txPromises = [];
                for (let i = start; i <= end; i++) {
                    const node = nodes[i];
                    validNodes.add(node.public_key);

                    txPromises.push(tx.run(
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
            });
        } finally {
            await session.close();
        }

        startIndex = end+1;
    }
}

async function populateChannels(channels, validNodes, validChannels) {
    const driver = getDB();

    const channelCount = channels.length;
    let startIndex = 0;

    while (startIndex < channelCount) {
        const start = startIndex;
        let end = startIndex + config.queriesPerTransaction-1;
        if (end >= channelCount) {
            end = channelCount-1;
        }

        const session = driver.session();
        try {
            await session.writeTransaction(async tx => {
                const txPromises = [];
                for (let i = start; i <= end; i++) {
                    const channel = channels[i];
                    validChannels.add(channel.id);
                    validNodes.add(channel.policies[0].public_key);
                    validNodes.add(channel.policies[1].public_key);

                    txPromises.push(tx.run(
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
            });
        } finally {
            await session.close();
        }

        startIndex = end+1;
    }
}

async function deleteStaleChannels(validChannels) {
    const driver = getDB();
    const session = driver.session();
    try {
        await session.writeTransaction(async tx => {
            const existing_channel_ids = await tx.run(
                DB_QUERIES.ALL_CHANNEL_IDS
            );
        
            let channelGraphNodeCleanupPromises = [];
        
            for (let i = 0; i < existing_channel_ids.records.length; i++) {
                const existing_channel_id = existing_channel_ids.records[0].get('channel_id');
        
                if (!validChannels.has(existing_channel_id)) {
                    channelGraphNodeCleanupPromises.push(tx.run(
                        DB_QUERIES.DELETE_CHANNELS_BY_CHANNEL_IDS,
                        {
                            channel_id : existing_channel_id
                        }
                    ));
                }
            }
            return Promise.all(channelGraphNodeCleanupPromises);
        });
    } finally {
        await session.close();
    }
}

async function deleteStaleNodes(validNodes) {
    const driver = getDB();
    const session = driver.session();
    try {
        await session.writeTransaction(async tx => {
            const existing_public_keys = await tx.run(
                DB_QUERIES.ALL_NODE_PUBLIC_KEYS
            );
        
            let nodeGraphNodeCleanupPromises = [];
        
            for (let i = 0; i < existing_public_keys.records.length; i++) {
                const existing_public_key = existing_public_keys.records[0].get('public_key');
        
                if (!validNodes.has(existing_public_key)) {
                    nodeGraphNodeCleanupPromises.push(tx.run(
                        DB_QUERIES.DELETE_NODES_BY_NODE_PUBLIC_KEYS,
                        {
                            public_key : existing_public_key
                        }
                    ));
                }
            }
            return Promise.all(nodeGraphNodeCleanupPromises);
        });
    } finally {
        await session.close();
    }
}

async function updateNodeTotalCapacity(validNodes) {
    const driver = getDB();
    const session = driver.session();
    try {
        await session.writeTransaction(async tx => {
            return tx.run(
                DB_QUERIES.UPDATE_NODES_CAPACITY_INFO
            )
        });
    } finally {
        await session.close();
    }
}

async function processNodeTotalCapacity(key) {
    let nodeDetail;
    try {
        const lnd = getLND();
        nodeDetail = await getNode({lnd, public_key: key});
    }
    catch (e) {
        logger.error('ERROR while getting total channel capacity for node key: ' + key + ', error: ' + e)
        return;
    }
    logger.trace('Total channel capacity for node key: '+ key +', capacity: ' + nodeDetail.capacity +', + channel count: ' + nodeDetail.channel_count)
    const driver = getDB();
    const session = driver.session();
    try {
        await session.writeTransaction(async tx => {
            return tx.run(
                DB_QUERIES.UPDATE_NODE_CAPACITY_INFO,
                {
                    public_key : key,
                    capacity : nodeDetail.capacity,
                    channel_count : nodeDetail.channel_count
                }
            )
        });
    } finally {
        await session.close();
    }
}

async function processLndGraphNotifications() {
    const notifications = [...this.notifications];
    this.notifications = [];
    for (let i = 0; i < notifications.length; i++) {
        await processLndGraphNotification(notifications[i], this);
    }
}

async function processLndGraphNotification(notification, lndGraphToDBHandler) {
    const driver = getDB();
    const session = driver.session();
    try {
        await session.writeTransaction(async tx => {
            const lnd = getLND();
            if (notification.public_key) {
                const nodeDetail = await getNode({lnd, public_key: notification.public_key});
                await tx.run(
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
                const public_keys = await tx.run(
                    DB_QUERIES.UPDATE_CHANNEL_CLOSE_NOTIFICATION,
                    {
                        c_channel_id: notification.id,
                        c_close_height: notification.close_height,
                        c_channel_point: (notification.transaction_id != null && notification.transaction_vout != null) ? (notification.transaction_id + ':' + notification.transaction_vout) : null,
                        c_capacity: (notification.capacity != null) ? notification.capacity : null,
                        c_updated_at: notification.updated_at
                    }
                );
                if (public_keys && public_keys.records 
                    && typeof public_keys.records.length !== 'undefined' && public_keys.records.length === 2) {
                    await Promise.all([processNodeTotalCapacity(lnd, public_keys.records[0].get('public_keys'), tx),
                    processNodeTotalCapacity(lnd, public_keys.records[1].get('public_keys'), tx)]);
                }
            } else {
                const nodeDetails = await Promise.all([getNode({lnd, public_key: notification.public_keys[0]}), 
                                                    getNode({lnd, public_key: notification.public_keys[1]})]);
                await tx.run(
                    DB_QUERIES.UPDATE_CHANNEL_NOTIFICATION,
                    {
                        n0_public_key: notification.public_keys[0],
                        n1_public_key: notification.public_keys[1],
                        n0_capacity : nodeDetails[0].capacity,
                        n0_channel_count : nodeDetails[0].channel_count,
                        n1_capacity : nodeDetails[1].capacity,
                        n1_channel_count : nodeDetails[1].channel_count,
    
                        c_channel_id: notification.id,
                        c_channel_point: (notification.transaction_id != null && notification.transaction_vout != null) ? (notification.transaction_id + ':' + notification.transaction_vout) : null,
                        c_capacity: (notification.capacity != null) ? notification.capacity : null,
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
            logger.warn('Error while DB session close in error case of lightning graph notification processing: ' + se);
        }
        if (notification.lh_max_retry && notification.lh_max_retry === config.lh_max_retry) {
            logger.fatal('CRITICAL ERROR Last retry failed to process the lightning graph notification.' + JSON.stringify(notification) + ', error: ' + e);
        }
        else {
            logger.error('Failed to process lightning graph notification: ' + JSON.stringify(notification) + ', retry attempt: ' + notification.lh_max_retry + ', error: ' + e);
            notification.lh_max_retry = notification.lh_max_retry ? notification.lh_max_retry + 1 : 1;
            lndGraphToDBHandler.notifications.push(notification);
        }
    }
}

module.exports = {
    loadGraphToDB
};