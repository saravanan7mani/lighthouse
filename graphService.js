const {getLND} = require('./lnd');
const {getNetworkGraph} = require('ln-service');
const {getDB} = require('./db');
const {subscribeToLNDGraph} = require('./lndService');
// const fs = require('fs');

// It requires retry in case of exception before commit. WARNING notification duplicate configs.
async function loadGraphToDB() {
    const db = getDB();
    let session;
    let dbTx;
    try {
        const lnd = getLND();
        // const lndGraphToDBHandler = subscribeToLNDGraph();
        const {channels, nodes} = await getNetworkGraph({lnd});
        // fs.writeFileSync('/Users/samani2/projects/btc/docs/alexchannels.json', JSON.stringify(nodes));
        // fs.writeFileSync('/Users/samani2/projects/btc/docs/alexchannels.json', JSON.stringify(channels));
        console.log((nodes.length) + ' LN nodes and ' + (channels.length) + ' LN channels to be loaded');
        console.log((nodes.length + channels.length) + ' graph nodes and ' + (channels.length * 2) + ' graph edges to be loaded');
        
        session = db.session();
        dbTx = session.beginTransaction();

        const validNodes = new Set();
        const validChannels = new Set();

        await prcessGraphNodes(nodes, channels, validNodes, validChannels, dbTx);
        await cleanChannelGraphNodes(validChannels, dbTx); // To remove stale channels & nodes from DB that are missed by above update query.
        await cleanNodeGraphNodes(validNodes, dbTx);

        await dbTx.commit()
        await session.close()

        // lndGraphToDBHandler.on('error', () => {
            
        // });
        // lndGraphToDBHandler.on('move', processLndGraphNotifications(this)); // does it need to be await? TBD
        // lndGraphToDBHandler.moveToDB();

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

async function processLndGraphNotifications(lndGraphToDBHandler) {
    let session;
    let dbTx;
    try {
        session = db.session();
        dbTx = session.beginTransaction();

        const nodeMap = lndGraphToDBHandler.getNodeMap();
        const channelMap = lndGraphToDBHandler.getChannelMap();
        const nodes = [...nodeMap.values()];
        const channels = [...channelMap.values()];

        await prcessGraphNodes(nodes, channels, undefined, undefined, dbTx);
        await processGraphEdges(channels, dbTx);
        
        await dbTx.commit();

        nodeMap.clear();
        channelMap.clear();
    }
    catch(e) {
        if (dbTx) {
            await dbTx.rollback();
        }
        console.log('error occurred while proceesing LND graph notification. Rolled back.' + e);
    }
    finally {
        if (session) {
            await session.close();
        }
    }
}

function prcessGraphNodes(nodes, channels, validNodes, validChannels, dbTx) {
    let nodePromises = [];

    for (let i = 0; i < nodes.length; i++) {
        let node = nodes[i];
        validNodes.add(node.public_key);

        nodePromises.push(dbTx.run(
            `MERGE (n:Node {public_key: $public_key})
            ON CREATE SET n.public_key = $public_key
            SET n.alias = $alias
            SET n.color = $color
            SET n.updated_at = datetime($updated_at)`,
            {
                public_key: node.public_key,
                alias: node.alias,
                color: node.color,
                updated_at: node.updated_at
            }
        ));
    }
    
    for (let i = 0; i < channels.length; i++) {
        let channel = channels[i];
        validChannels.add(channel.id);

        nodePromises.push(dbTx.run(`MATCH (n0:Node {public_key: $n0_public_key})
            MATCH (n1:Node {public_key: $n1_public_key})
            
            MERGE (n0)-[r0:OPENED]->(c:Channel {channel_id: $c_channel_id})<-[r1:OPENED]-(n1)
            
            ON CREATE SET c.channel_id = $c_channel_id
            ON CREATE SET c.channel_point = $c_channel_point
            SET c.capacity = $c_capacity
            SET c.updated_at = datetime($c_updated_at)
            
            SET r0.base_fee_mtokens = $r0_base_fee_mtokens
            SET r0.cltv_delta = $r0_cltv_delta
            SET r0.fee_rate = $r0_fee_rate
            SET r0.is_disabled = $r0_is_disabled
            SET r0.max_htlc_mtokens = $r0_max_htlc_mtokens
            SET r0.min_htlc_mtokens = $r0_min_htlc_mtokens
            SET r0.updated_at = datetime($r0_updated_at)
            
            SET r1.base_fee_mtokens = $r1_base_fee_mtokens
            SET r1.cltv_delta = $r1_cltv_delta
            SET r1.fee_rate = $r1_fee_rate
            SET r1.is_disabled = $r1_is_disabled
            SET r1.max_htlc_mtokens = $r1_max_htlc_mtokens
            SET r1.min_htlc_mtokens = $r1_min_htlc_mtokens
            SET r1.updated_at = datetime($r1_updated_at)`,
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
    
    return Promise.all(nodePromises);
}

// function processGraphEdges(channels, dbTx) {
//     let edgePromises = [];
//     for (let i = 0; i < channels.length; i++) {
//         let channel = channels[i];
       
//         edgePromises.push(dbTx.run(
//             `MATCH (n:Node {public_key: $public_key})
//             MATCH (c:Channel {channel_id: $channel_id})
//             MERGE (n)-[r:OPENED]->(c)
//             SET r.base_fee_mtokens = $base_fee_mtokens
//             SET r.cltv_delta = $cltv_delta
//             SET r.fee_rate = $fee_rate
//             SET r.is_disabled = $is_disabled
//             SET r.max_htlc_mtokens = $max_htlc_mtokens
//             SET r.min_htlc_mtokens = $min_htlc_mtokens
//             SET r.updated_at = datetime($updated_at)`,
//             {
//                 public_key: channel.policies[0].public_key,
//                 channel_id: channel.id,
//                 base_fee_mtokens: channel.policies[0].base_fee_mtokens || null,
//                 cltv_delta: channel.policies[0].cltv_delta || null,
//                 fee_rate: channel.policies[0].fee_rate || null,
//                 is_disabled: channel.policies[0].is_disabled || null,
//                 max_htlc_mtokens: channel.policies[0].max_htlc_mtokens || null,
//                 min_htlc_mtokens: channel.policies[0].min_htlc_mtokens || null,
//                 updated_at: ((channel.policies[0].updated_at) ? channel.policies[0].updated_at : null)
//             }
//         ));
        
//         edgePromises.push(dbTx.run(
//             `MATCH (n:Node {public_key: $public_key})
//             MATCH (c:Channel {channel_id: $channel_id})
//             MERGE (n)-[r:OPENED]->(c)
//             SET r.base_fee_mtokens = $base_fee_mtokens
//             SET r.cltv_delta = $cltv_delta
//             SET r.fee_rate = $fee_rate
//             SET r.is_disabled = $is_disabled
//             SET r.max_htlc_mtokens = $max_htlc_mtokens
//             SET r.min_htlc_mtokens = $min_htlc_mtokens
//             SET r.updated_at = datetime($updated_at)`,
//             {
//                 public_key: channel.policies[1].public_key,
//                 channel_id: channel.id,
//                 base_fee_mtokens: channel.policies[1].base_fee_mtokens || null,
//                 cltv_delta: channel.policies[1].cltv_delta || null,
//                 fee_rate: channel.policies[1].fee_rate || null,
//                 is_disabled: channel.policies[1].is_disabled || null,
//                 max_htlc_mtokens: channel.policies[1].max_htlc_mtokens || null,
//                 min_htlc_mtokens: channel.policies[1].min_htlc_mtokens || null,
//                 updated_at: ((channel.policies[1].updated_at) ? channel.policies[1].updated_at : null)
//             }
//         ));
//     }
//     return Promise.all(edgePromises);
// }

async function cleanChannelGraphNodes(validChannels, dbTx) {
    const existing_channel_ids = await dbTx.run(
        `MATCH (c:Channel) RETURN c.channel_id AS channel_id`
    );

    let channelGraphNodeCleanupPromises = [];

    for (let i = 0; i < existing_channel_ids.records.length; i++) {
        const existing_channel_id = existing_channel_ids.records[0].get('channel_id');

        if (!validChannels.has(existing_channel_id)) {
            channelGraphNodeCleanupPromises.push(dbTx.run(
                `MATCH (c:Channel {channel_id: $channel_id}) DETACH DELETE c`,
                {
                    channel_id : existing_channel_id
                }
            ));
        }
    }
    return Promise.all(channelGraphNodeCleanupPromises);
}

async function cleanNodeGraphNodes(validNodes, dbTx) {
    const existing_public_keys = await dbTx.run(
        `MATCH (n:Node) RETURN n.public_key AS public_key`
    );

    let nodeGraphNodeCleanupPromises = [];

    for (let i = 0; i < existing_public_keys.records.length; i++) {
        const existing_public_key = existing_public_keys.records[0].get('public_key');

        if (!validNodes.has(existing_public_key)) {
            nodeGraphNodeCleanupPromises.push(dbTx.run(
                `MATCH (n:Node {public_key: $public_key}) DETACH DELETE n`,
                {
                    public_key : existing_public_key
                }
            ));
        }
    }
    return Promise.all(nodeGraphNodeCleanupPromises);
}

module.exports = {
    loadGraphToDB
};