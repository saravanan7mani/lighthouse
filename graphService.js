const {getDB} = require('./db');
const neo4j = require('neo4j-driver');
const {DB_QUERIES} = require('./constants');
const logger = require('log4js').getLogger("graphService");

async function getNodesList(input) {
    logger.info('Request for node list is received for min_capacity: ' + input.min_capacity + ', max_capacity: ' + input.max_capacity + ', skip: ' + input.skip + ', limit: ' + input.limit);
    const query = prepareGetNodesQuery(input);

    const driver = getDB();
    const session = driver.session();

    try {
        const results = await session.readTransaction(async tx => {
            const txPromises = [];
            if (query.isTotalQueryRequired) {
                txPromises.push(tx.run(query.countQuery, query.countQueryArgs));
            }
            txPromises.push(tx.run(query.nodesQuery, query.nodesQueryArgs));
            return Promise.all(txPromises);    
        });

        const response = {};
        if (query.isTotalQueryRequired) {
            response.total = results[0].records[0].get('total').low;
            response.nodes = results[1];
        }
        else {
            response.nodes = results[0];
        }
        response.nodes = response.nodes.records.map(record => {
            const node = {};
            if (record.get('alias') != null) {
                node.alias = record.get('alias');
            }
            if (record.get('capacity') != null) {
                node.capacity = record.get('capacity');
            }
            if (record.get('channel_count') != null) {
                node.channel_count = record.get('channel_count');
            }
            if (record.get('public_key') != null) {
                node.public_key = record.get('public_key');
            }
            if (record.get('sockets') != null && record.get('sockets').length) {
                node.sockets = record.get('sockets');
            }
            if (record.get('updated_at') != null) {
                node.updated_at = record.get('updated_at');
            }
            return node;
        });
        response.nodes_count = response.nodes.length;
        return response;
    }
    finally {
        await session.close();
    }
}

function prepareGetNodesQuery(input) {
    let countQuery;
    let nodesQuery;

    let countQueryArgs = {};
    let nodesQueryArgs = {};

    let isTotalQueryRequired = false;

    if (Number.isSafeInteger(input.skip) && input.skip > 0) {
        nodesQueryArgs.skip = neo4j.int(input.skip);
    }
    else {
        nodesQueryArgs.skip = neo4j.int(0);
        isTotalQueryRequired = true;
    }

    if (Number.isSafeInteger(input.limit) && input.limit > 0) {
        nodesQueryArgs.limit = neo4j.int(input.limit);
    }
    else {
        nodesQueryArgs.limit = neo4j.int(100);
    }

    const query = {countQuery, countQueryArgs, nodesQuery, nodesQueryArgs, isTotalQueryRequired};

    prepareGetNodesByTotalCapacityQuery(input, query);
    
    return query;
}

function prepareGetNodesByTotalCapacityQuery(input, query) {

    if (Number.isSafeInteger(input.min_capacity) && input.min_capacity > 0) {
        query.nodesQueryArgs.min_capacity = neo4j.int(input.min_capacity);
    }

    if (Number.isSafeInteger(input.max_capacity) && input.max_capacity > 0) {
        query.nodesQueryArgs.max_capacity = neo4j.int(input.max_capacity);
    }

    if (query.nodesQueryArgs.min_capacity && query.nodesQueryArgs.max_capacity 
        && query.nodesQueryArgs.min_capacity === query.nodesQueryArgs.max_capacity) {
            query.nodesQueryArgs.capacity = query.nodesQueryArgs.min_capacity;
            delete query.nodesQueryArgs.min_capacity;
            delete query.nodesQueryArgs.max_capacity;
    }

    if (query.isTotalQueryRequired) {
        if (query.nodesQueryArgs.min_capacity) {
            query.countQueryArgs.min_capacity = query.nodesQueryArgs.min_capacity;
        }
        if (query.nodesQueryArgs.max_capacity) {
            query.countQueryArgs.max_capacity = query.nodesQueryArgs.max_capacity;
        }
        if (query.nodesQueryArgs.capacity) {
            query.countQueryArgs.capacity = query.nodesQueryArgs.capacity;
        }
    }

    if (query.nodesQueryArgs.min_capacity && query.nodesQueryArgs.max_capacity) {
        query.nodesQuery = DB_QUERIES.GET_NODES_BY_MIN_MAX_CAPACITY;
        if (query.isTotalQueryRequired) {
            query.countQuery = DB_QUERIES.GET_NODES_COUNT_BY_MIN_MAX_CAPACITY;
        }
    }
    else if (query.nodesQueryArgs.min_capacity) {
        query.nodesQuery = DB_QUERIES.GET_NODES_BY_MIN_CAPACITY;
        if (query.isTotalQueryRequired) {
            query.countQuery = DB_QUERIES.GET_NODES_COUNT_BY_MIN_CAPACITY;
        }
    }
    else if (query.nodesQueryArgs.max_capacity) {
        query.nodesQuery = DB_QUERIES.GET_NODES_BY_MAX_CAPACITY;
        if (query.isTotalQueryRequired) {
            query.countQuery = DB_QUERIES.GET_NODES_COUNT_BY_MAX_CAPACITY;
        }
    }
    else if (query.nodesQueryArgs.capacity) {
        query.nodesQuery = DB_QUERIES.GET_NODES_BY_CAPACITY;
        if (query.isTotalQueryRequired) {
            query.countQuery = DB_QUERIES.GET_NODES_COUNT_BY_CAPACITY;
        }
    }
    else {
        query.nodesQuery = DB_QUERIES.GET_NODES;
        if (query.isTotalQueryRequired) {
            query.countQuery = DB_QUERIES.GET_NODES_COUNT;
        }
    }
}

async function getChannelsByNodes(input) {
    logger.info('Request for channel details for nodes is received for ' + input.length + ' number of public keys');

    const driver = getDB();
    const session = driver.session();

    try {
        const results = await session.readTransaction(async tx => {
            return await tx.run(DB_QUERIES.GET_PEERS_OF_NODES, {public_keys: input});
        });

        const nodes = new Map();
        const channels = [];

        results.records.forEach(record => {
            const n0_public_key = record.get('n0').properties.public_key;
            if (!nodes.has(n0_public_key)) {
                const node = {};
                node.public_key = n0_public_key;
                nodes.set(n0_public_key, node);
                if (record.get('n0').properties.alias != null) {
                    node.alias = record.get('n0').properties.alias;
                }
                if (record.get('n0').properties.capacity != null) {
                    node.capacity = record.get('n0').properties.capacity;
                }
                if (record.get('n0').properties.channel_count != null) {
                    node.channel_count = record.get('n0').properties.channel_count;
                }
                if (record.get('n0_updated_at') != null) {
                    node.updated_at = record.get('n0_updated_at');
                }
                if (record.get('n0').properties.color != null) {
                    node.color = record.get('n0').properties.color;
                }
                if (record.get('n0').properties.sockets != null && record.get('n0').properties.sockets.length) {
                    node.sockets = record.get('n0').properties.sockets;
                }
            }

            const n1_public_key = record.get('n1').properties.public_key;
            if (!nodes.has(n1_public_key)) {
                const node = {};
                node.public_key = n1_public_key;
                nodes.set(n1_public_key, node);
                if (record.get('n1').properties.alias != null) {
                    node.alias = record.get('n1').properties.alias;
                }
                if (record.get('n1').properties.capacity != null) {
                    node.capacity = record.get('n1').properties.capacity;
                }
                if (record.get('n1').properties.channel_count != null) {
                    node.channel_count = record.get('n1').properties.channel_count;
                }
                if (record.get('n1_updated_at') != null) {
                    node.updated_at = record.get('n1_updated_at');
                }
                if (record.get('n1').properties.color != null) {
                    node.color = record.get('n1').properties.color;
                }
                if (record.get('n1').properties.sockets != null && record.get('n1').properties.sockets.length) {
                    node.sockets = record.get('n1').properties.sockets;
                }
            }

            const channel = {};
            channels.push(channel);
            channel.channel_id = record.get('c').properties.channel_id;
            channel.n0_public_key = n0_public_key;
            channel.n1_public_key = n1_public_key;
            if (record.get('c').properties.capacity != null) {
                channel.capacity = record.get('c').properties.capacity;  
            }
            if (record.get('c').properties.channel_point != null) {
                channel.channel_point = record.get('c').properties.channel_point;  
            }
            if (record.get('c_updated_at') != null) {
                channel.updated_at = record.get('c_updated_at');
            }
            if (record.get('r0').properties.base_fee_mtokens != null) {
                channel.n0_base_fee_mtokens = record.get('r0').properties.base_fee_mtokens;  
            }
            if (record.get('r0').properties.cltv_delta != null) {
                channel.n0_cltv_delta = record.get('r0').properties.cltv_delta;  
            }
            if (record.get('r0').properties.fee_rate != null) {
                channel.n0_fee_rate = record.get('r0').properties.fee_rate;  
            }
            if (record.get('r0').properties.is_disabled != null) {
                channel.n0_is_disabled = record.get('r0').properties.is_disabled;  
            }
            if (record.get('r0').properties.max_htlc_mtokens != null) {
                channel.n0_max_htlc_mtokens = record.get('r0').properties.max_htlc_mtokens;  
            }
            if (record.get('r0').properties.min_htlc_mtokens != null) {
                channel.n0_min_htlc_mtokens = record.get('r0').properties.min_htlc_mtokens;  
            }
            if (record.get('r0_updated_at') != null) {
                channel.n0_updated_at = record.get('r0_updated_at');  
            }

            if (record.get('r1').properties.base_fee_mtokens != null) {
                channel.n1_base_fee_mtokens = record.get('r1').properties.base_fee_mtokens;  
            }
            if (record.get('r1').properties.cltv_delta != null) {
                channel.n1_cltv_delta = record.get('r1').properties.cltv_delta;  
            }
            if (record.get('r1').properties.fee_rate != null) {
                channel.n1_fee_rate = record.get('r1').properties.fee_rate;  
            }
            if (record.get('r1').properties.is_disabled != null) {
                channel.n1_is_disabled = record.get('r1').properties.is_disabled;  
            }
            if (record.get('r1').properties.max_htlc_mtokens != null) {
                channel.n1_max_htlc_mtokens = record.get('r1').properties.max_htlc_mtokens;  
            }
            if (record.get('r1').properties.min_htlc_mtokens != null) {
                channel.n1_min_htlc_mtokens = record.get('r1').properties.min_htlc_mtokens;  
            }
            if (record.get('r1_updated_at') != null) {
                channel.n1_updated_at = record.get('r1_updated_at');  
            }
        });

        return {nodes: [...nodes.values()], nodes_count: nodes.size, channels, channel_count: channels.length};
    }
    finally {
        await session.close();
    }
}

module.exports = {
    getNodesList,
    getChannelsByNodes
}