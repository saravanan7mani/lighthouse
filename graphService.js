const {getDB} = require('./db');
const neo4j = require('neo4j-driver');
const {DB_QUERIES} = require('./constants');

async function getNodesByTotalCapacity(min_capacity, max_capacity, skip, limit) {
    console.log('getNodesByTotalCapacity - min_capacity: ' + min_capacity + ', max_capacity: ' + max_capacity + ', skip: ' + skip + ', limit: ' + limit);
    const driver = getDB();
    const session = driver.session();
    
    let getNodesCountQuery;
    let getNodesQuery;

    let getNodesCountQueryArgs = {};
    let getNodesQueryArgs = {};

    let isTotalRequired = false;

    if (typeof skip === 'number' && skip !== NaN && skip !== Infinity && skip > 0) {
        getNodesQueryArgs.skip = neo4j.int(skip);
    }
    else {
        getNodesQueryArgs.skip = neo4j.int(0);
        isTotalRequired = true;
    }

    if (typeof limit === 'number' && limit !== NaN && limit !== Infinity && limit > 0) {
        getNodesQueryArgs.limit = neo4j.int(limit); // pagination possible
    }
    else {
        getNodesQueryArgs.limit = neo4j.int(10); // no pagination
    }

    if (typeof min_capacity == 'number' && min_capacity !== NaN && min_capacity !== Infinity && min_capacity > 0) {
        getNodesQueryArgs.min_capacity = neo4j.int(min_capacity);
    }

    if (typeof max_capacity == 'number' && max_capacity !== NaN && max_capacity !== Infinity && max_capacity > 0) {
        getNodesQueryArgs.max_capacity = neo4j.int(max_capacity);
    }

    if (getNodesQueryArgs.min_capacity && getNodesQueryArgs.max_capacity 
        && getNodesQueryArgs.min_capacity === getNodesQueryArgs.max_capacity) {
            getNodesQueryArgs.capacity = neo4j.int(min_capacity);
            delete getNodesQueryArgs.min_capacity;
            delete getNodesQueryArgs.max_capacity;
    }

    if (isTotalRequired) {
        if (getNodesQueryArgs.min_capacity) {
            getNodesCountQueryArgs.min_capacity = neo4j.int(min_capacity);
        }
        if (getNodesQueryArgs.max_capacity) {
            getNodesCountQueryArgs.max_capacity = neo4j.int(max_capacity);
        }
        if (getNodesQueryArgs.capacity) {
            getNodesCountQueryArgs.capacity = neo4j.int(min_capacity);
        }
    }

    if (getNodesQueryArgs.min_capacity && getNodesQueryArgs.max_capacity) {
        getNodesQuery = DB_QUERIES.GET_NODES_BY_MIN_MAX_CAPACITY;
        if (isTotalRequired) {
            getNodesCountQuery = DB_QUERIES.GET_NODES_COUNT_BY_MIN_MAX_CAPACITY;
        }
    }
    else if (getNodesQueryArgs.min_capacity) {
        getNodesQuery = DB_QUERIES.GET_NODES_BY_MIN_CAPACITY;
        if (isTotalRequired) {
            getNodesCountQuery = DB_QUERIES.GET_NODES_COUNT_BY_MIN_CAPACITY;
        }
    }
    else if (getNodesQueryArgs.max_capacity) {
        getNodesQuery = DB_QUERIES.GET_NODES_BY_MAX_CAPACITY;
        if (isTotalRequired) {
            getNodesCountQuery = DB_QUERIES.GET_NODES_COUNT_BY_MAX_CAPACITY;
        }
    }
    else if (getNodesQueryArgs.capacity) {
        getNodesQuery = DB_QUERIES.GET_NODES_BY_CAPACITY;
        if (isTotalRequired) {
            getNodesCountQuery = DB_QUERIES.GET_NODES_COUNT_BY_CAPACITY;
        }
    }
    else {
        getNodesQuery = DB_QUERIES.GET_NODES;
        if (isTotalRequired) {
            getNodesCountQuery = DB_QUERIES.GET_NODES_COUNT;
        }
    }

    console.log('getNodesCountQuery: ' + getNodesCountQuery);
    console.log('getNodesCountQueryArgs: ' + JSON.stringify(getNodesCountQueryArgs));
    console.log('getNodesQuery: ' + getNodesQuery);
    console.log('getNodesQueryArgs: ' + JSON.stringify(getNodesQueryArgs));

    try {
        const results = await session.readTransaction(async tx => {
            const txPromises = [];
            if (isTotalRequired) {
                txPromises.push(tx.run(getNodesCountQuery, getNodesCountQueryArgs));
            }
            txPromises.push(tx.run(getNodesQuery, getNodesQueryArgs));
            return Promise.all(txPromises);    
        });

        const response = {};
        if (isTotalRequired) {
            response.total = results[0].records[0].get('total').low;
            response.nodes = results[1];
        }
        else {
            response.nodes = results[0];
        }
        response.nodes = response.nodes.records.map(record => {
            return {
                alias: record.get('alias'),
                capacity: record.get('capacity'),
                channel_count: record.get('channel_count'),
                public_key: record.get('public_key'),
                sockets: record.get('sockets'),
                updated_at: record.get('updated_at')
            };
        });
        // console.log('getNodesByTotalCapacity-response: ' + JSON.stringify(response));
        return response;
    }
    finally {
        await session.close();
    }
}

module.exports = {
    getNodesByTotalCapacity
}