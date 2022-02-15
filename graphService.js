const {getDB} = require('./db');
const neo4j = require('neo4j-driver');
const {DB_QUERIES} = require('./constants');

async function getNodesByTotalCapacity(input) {
    console.log('getNodesByTotalCapacity - min_capacity: ' + input.min_capacity + ', max_capacity: ' + input.max_capacity + ', skip: ' + input.skip + ', limit: ' + input.limit);
    const queryRequest = parseGetNodesByTotalCapacityInput(input);

    console.log('countQuery: ' + queryRequest.countQuery);
    console.log('countQueryArgs: ' + JSON.stringify(queryRequest.countQueryArgs));
    console.log('nodesQuery: ' + queryRequest.nodesQuery);
    console.log('nodesQueryArgs: ' + JSON.stringify(queryRequest.nodesQueryArgs));

    const driver = getDB();
    const session = driver.session();

    try {
        const results = await session.readTransaction(async tx => {
            const txPromises = [];
            if (queryRequest.isTotalRequired) {
                txPromises.push(tx.run(queryRequest.countQuery, queryRequest.countQueryArgs));
            }
            txPromises.push(tx.run(queryRequest.nodesQuery, queryRequest.nodesQueryArgs));
            return Promise.all(txPromises);    
        });

        const queryResponse = {};
        if (queryRequest.isTotalRequired) {
            queryResponse.total = results[0].records[0].get('total').low;
            queryResponse.nodes = results[1];
        }
        else {
            queryResponse.nodes = results[0];
        }
        queryResponse.nodes = queryResponse.nodes.records.map(record => {
            const node = {};
            if (record.get('alias') !== null) {
                node.alias = record.get('alias');
            }
            if (record.get('capacity') !== null) {
                node.capacity = record.get('capacity');
            }
            if (record.get('channel_count') !== null) {
                node.channel_count = record.get('channel_count');
            }
            if (record.get('public_key') !== null) {
                node.public_key = record.get('public_key');
            }
            if (record.get('sockets') !== null) {
                node.sockets = record.get('sockets');
            }
            if (record.get('updated_at') !== null) {
                node.updated_at = record.get('updated_at');
            }
            return node;
        });
        // console.log('getNodesByTotalCapacity-response: ' + JSON.stringify(response));
        return queryResponse;
    }
    finally {
        await session.close();
    }
}

function parseGetNodesByTotalCapacityInput(input) {
    let countQuery;
    let nodesQuery;

    let countQueryArgs = {};
    let nodesQueryArgs = {};

    let isTotalRequired = false;

    if (Number.isSafeInteger(input.skip) && input.skip > 0) {
        nodesQueryArgs.skip = neo4j.int(input.skip);
    }
    else {
        nodesQueryArgs.skip = neo4j.int(0);
        isTotalRequired = true;
    }

    if (Number.isSafeInteger(input.limit) && input.limit > 0) {
        nodesQueryArgs.limit = neo4j.int(input.limit);
    }
    else {
        nodesQueryArgs.limit = neo4j.int(100);
    }

    const query = {countQuery, countQueryArgs, nodesQuery, nodesQueryArgs, isTotalRequired};

    parseTotalCapacityInput(input, query);
    
    return query;
}

function parseTotalCapacityInput(input, query) {

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

    if (query.isTotalRequired) {
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
        if (query.isTotalRequired) {
            query.countQuery = DB_QUERIES.GET_NODES_COUNT_BY_MIN_MAX_CAPACITY;
        }
    }
    else if (query.nodesQueryArgs.min_capacity) {
        query.nodesQuery = DB_QUERIES.GET_NODES_BY_MIN_CAPACITY;
        if (query.isTotalRequired) {
            query.countQuery = DB_QUERIES.GET_NODES_COUNT_BY_MIN_CAPACITY;
        }
    }
    else if (query.nodesQueryArgs.max_capacity) {
        query.nodesQuery = DB_QUERIES.GET_NODES_BY_MAX_CAPACITY;
        if (query.isTotalRequired) {
            query.countQuery = DB_QUERIES.GET_NODES_COUNT_BY_MAX_CAPACITY;
        }
    }
    else if (query.nodesQueryArgs.capacity) {
        query.nodesQuery = DB_QUERIES.GET_NODES_BY_CAPACITY;
        if (query.isTotalRequired) {
            query.countQuery = DB_QUERIES.GET_NODES_COUNT_BY_CAPACITY;
        }
    }
    else {
        query.nodesQuery = DB_QUERIES.GET_NODES;
        if (query.isTotalRequired) {
            query.countQuery = DB_QUERIES.GET_NODES_COUNT;
        }
    }
}

module.exports = {
    getNodesByTotalCapacity
}