const {getLND} = require('./lnd');
const {getNetworkGraph} = require('ln-service');
const {getDB} = require('./db');
const {subscribeToLNDGraph} = require('./graphToDBMover');

async function loadGraphToDB() {
    let db;
    let session;
    let dbTx;
    try {
        const lnd = getLND();
        const graphToDBMover = subscribeToLNDGraph();
        const {channels, nodes} = await getNetworkGraph({lnd});

        console.log((nodes.length + channels.length) + ' nodes and ' + (channels.length * 2) + ' edges to be loaded');
        
        db = getDB();
        session = db.session();
        dbTx = session.beginTransaction();

        const validNodes = new Set();
        const validChannels = new Set();

        await prcessGraphNodes(nodes, channels, validNodes, validChannels, dbTx);
        await processGraphEdges(channels, dbTx);
        await cleanChannelGraphNodes(validChannels, dbTx);
        await cleanNodeGraphNodes(validNodes, dbTx);

        await dbTx.commit()
        await session.close()

        // graphToDBMover.on('move', () => {
        //     _session = db.session();
        //     _dbTx = session.beginTransaction();

        // })
        console.log((nodes.length + channels.length) + ' nodes and ' + (channels.length * 2) + ' edges are loaded');
        return (nodes.length + channels.length) + ' nodes and ' + (channels.length * 2) + ' edges are loaded';
    }
    catch (e) {
        if (dbTx) {
            await dbTx.rollback()
        }
        if (session) {
            await session.close()
        }
        await db.close()
        console.log('rolled back. ' + e)
        throw e;
    }
}
  
function prcessGraphNodes(nodes, channels, validNodes, validChannels, txc) {
    let nodePromises = [];

    for (let i = 0; i < nodes.length; i++) {
        let node = nodes[i];
        if (validNodes) {
            validNodes.add(node.public_key);
        }
        
        let _alias = node.alias || '';
        let _pubKey = node.public_key;
        let _lastUpdate = node.updated_at || '';
        let _color = node.color || '';

        nodePromises.push(txc.run(
            `MERGE (n:Node { pubKey: $pubKey})
            ON CREATE SET n.pubKey = $pubKey
            ON MATCH SET n.lastUpdate = $lastUpdate
            ON MATCH SET n.color = $color`,
            {
                alias: _alias,
                pubKey: _pubKey,
                lastUpdate: _lastUpdate,
                color: _color
            }
        ));
    }

    for (let i = 0; i < channels.length; i++) {
        let channel = channels[i];
        if (validChannels) {
            validChannels.add(channel.id);
        }

        const _channelID = channel.id;
        const _chanPoint = channel.transaction_id + ':' + channel.transaction_vout;
        const _lastUpdate = channel.updated_at || '';
        const _capacity = channel.capacity;

        nodePromises.push(txc.run(
            `MERGE (c:Channel { channelID: $channelID})
            ON CREATE SET c.channelID = $channelID
            ON CREATE SET c.chanPoint = $chanPoint
            ON MATCH SET c.lastUpdate = $lastUpdate
            ON MATCH SET c.capacity = $capacity`,
            {
                channelID: _channelID,
                chanPoint: _chanPoint,
                lastUpdate: _lastUpdate,
                capacity: _capacity
            }
        ));
    }
    return Promise.all(nodePromises);
}

function processGraphEdges(channels, txc) {
    let edgePromises = [];
    for (let i = 0; i < channels.length; i++) {
        let channel = channels[i];

        let _channelID = channel.id;  
        let _pubKey = channel.policies[0].public_key;
        let _timeLockDelta = channel.policies[0].cltv_delta || '';
        let _minHtlc = channel.policies[0].min_htlc_mtokens || '';
        let _feeBaseMsat = channel.policies[0].base_fee_mtokens || '';
        let _feeRateMilliMsat = channel.policies[0].fee_rate || '';
        let _disabled = channel.policies[0].is_disabled || true;
        let _maxHtlcMsat = channel.policies[0].max_htlc_mtokens || '';
        let _lastUpdate = channel.policies[0].updated_at || '';
       
        edgePromises.push(txc.run(
            `MATCH (n:Node {pubKey: $pubKey})
            MATCH (c:Channel {channelID: $channelID})
            MERGE (n)-[r:OPENED]->(c)
            ON MATCH SET r.timeLockDelta = $timeLockDelta
            ON MATCH SET r.minHtlc = $minHtlc
            ON MATCH SET r.maxHtlcMsat = $maxHtlcMsat
            ON MATCH SET r.feeBaseMsat = $feeBaseMsat
            ON MATCH SET r.feeRateMilliMsat = $feeRateMilliMsat
            ON MATCH SET r.disabled = $disabled
            ON MATCH SET r.lastUpdate = $lastUpdate`,
            {
                pubKey: _pubKey,
                channelID: _channelID,
                timeLockDelta: _timeLockDelta,
                minHtlc: _minHtlc,
                maxHtlcMsat: _maxHtlcMsat,
                feeBaseMsat: _feeBaseMsat,
                feeRateMilliMsat: _feeRateMilliMsat,
                disabled: _disabled,
                lastUpdate: _lastUpdate
            }
        ));

        _pubKey = channel.policies[1].public_key;
        _timeLockDelta = channel.policies[1].cltv_delta || '';
        _minHtlc = channel.policies[1].min_htlc_mtokens || '';
        _feeBaseMsat = channel.policies[1].base_fee_mtokens || '';
        _feeRateMilliMsat = channel.policies[1].fee_rate || '';
        _disabled = channel.policies[1].is_disabled || true;
        _maxHtlcMsat = channel.policies[1].max_htlc_mtokens || '';
        _lastUpdate = channel.policies[1].updated_at || '';

        edgePromises.push(txc.run(
            `MATCH (n:Node {pubKey: $pubKey})
            MATCH (c:Channel {channelID: $channelID})
            MERGE (n)-[r:OPENED]->(c)
            ON MATCH SET r.timeLockDelta = $timeLockDelta
            ON MATCH SET r.minHtlc = $minHtlc
            ON MATCH SET r.maxHtlcMsat = $maxHtlcMsat
            ON MATCH SET r.feeBaseMsat = $feeBaseMsat
            ON MATCH SET r.feeRateMilliMsat = $feeRateMilliMsat
            ON MATCH SET r.disabled = $disabled
            ON MATCH SET r.lastUpdate = $lastUpdate`,
            {
                pubKey: _pubKey,
                channelID: _channelID,
                timeLockDelta: _timeLockDelta,
                minHtlc: _minHtlc,
                maxHtlcMsat: _maxHtlcMsat,
                feeBaseMsat: _feeBaseMsat,
                feeRateMilliMsat: _feeRateMilliMsat,
                disabled: _disabled,
                lastUpdate: _lastUpdate
            }
        ));
    }
    return Promise.all(edgePromises);
}

async function cleanChannelGraphNodes(validChannels, txc) {
    const existingChannelIDs = await txc.run(
        `MATCH (c:Channel) RETURN c.channelID AS channelID`
    );

    let channelGraphNodeCleanupPromises = [];

    for (let i = 0; i < existingChannelIDs.records.length; i++) {
        const existingChannelID = existingChannelIDs.records[0].get('channelID');

        if (!validChannels.has(existingChannelID)) {
        channelGraphNodeCleanupPromises.push(txc.run(
            `MATCH (c:Channel {channelID: $channelID}) DETACH DELETE c`,
            {
                channelID : existingChannelID
            }
        ));
        }
    }
    return Promise.all(channelGraphNodeCleanupPromises);
}

async function cleanNodeGraphNodes(validNodes, txc) {
    const existingPubKeys = await txc.run(
        `MATCH (n:Node) RETURN n.pubKey AS pubKey`
    );

    let nodeGraphNodeCleanupPromises = [];

    for (let i = 0; i < existingPubKeys.records.length; i++) {
        const existingPubKey = existingPubKeys.records[0].get('pubKey');

        if (!validNodes.has(existingPubKey)) {
            nodeGraphNodeCleanupPromises.push(txc.run(
                `MATCH (n:Node {pubKey: $pubKey}) DETACH DELETE n`,
                {
                    pubKey : existingPubKey
                }
            ));
        }
    }
    return Promise.all(nodeGraphNodeCleanupPromises);
}

module.exports = {
    loadGraphToDB
};