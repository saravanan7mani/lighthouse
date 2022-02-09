const DB_QUERIES = {
    POPULATE_NODES:`MERGE (n:Node {public_key: $public_key})
        ON CREATE SET n.public_key = $public_key
        SET n.alias = $alias
        SET n.color = $color
        SET n.sockets = $sockets
        SET n.updated_at = datetime($updated_at)`,

    POPULATE_CHANNELS: `MERGE (n0:Node {public_key: $n0_public_key})
        MERGE (n1:Node {public_key: $n1_public_key})
        MERGE (c:Channel {channel_id: $c_channel_id})
        MERGE (n0)-[r0:OPENED]->(c)<-[r1:OPENED]-(n1)
        ON CREATE SET n0.public_key = $n0_public_key
        ON CREATE SET n1.public_key = $n1_public_key
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

    ALL_CHANNEL_IDS: `MATCH (c:Channel) RETURN c.channel_id AS channel_id`,

    DELETE_CHANNELS_BY_CHANNEL_IDS: `MATCH (c:Channel {channel_id: $channel_id}) DETACH DELETE c`,

    ALL_NODE_PUBLIC_KEYS: `MATCH (n:Node) RETURN n.public_key AS public_key`,

    DELETE_NODES_BY_NODE_PUBLIC_KEYS: `MATCH (n:Node {public_key: $public_key}) DETACH DELETE n`,

    UPDATE_NODE_NOTIFICATION: `MERGE (n0:Node {public_key: $public_key})
        WITH n0
        CALL apoc.lock.nodes([n0])
        CALL {
            WITH n0
            WITH n0 WHERE n0.updated_at IS NULL OR n0.updated_at < datetime($updated_at)
            MERGE (n:Node {public_key: $public_key})
            ON CREATE SET n.public_key = $public_key
            SET n.alias = $alias
            SET n.color = $color
            SET n.sockets = $sockets
            SET n.updated_at = datetime($updated_at)
            RETURN count(*) AS cnt
        }
        RETURN n0, cnt`,

    UPDATE_CHANNEL_NOTIFICATION: `MERGE (c:Channel {channel_id: $c_channel_id})
    WITH c
    CALL apoc.lock.nodes([c])
    CALL {
        WITH c
        WITH c WHERE c.closed IS NULL AND (c.updated_at IS NULL OR c.updated_at < datetime($c_updated_at))
        MERGE (n0:Node {public_key: $n0_public_key})
        MERGE (n1:Node {public_key: $n1_public_key})
        MERGE (n0)-[r0:OPENED]->(c)<-[r1:OPENED]-(n1)
        ON CREATE SET n0.public_key = $n0_public_key
        ON CREATE SET n1.public_key = $n1_public_key
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
        RETURN count(*) AS cnt
    }
    RETURN c, cnt`,

    UPDATE_CHANNEL_CLOSE_NOTIFICATION: `MERGE (c:Channel {channel_id: $c_channel_id})
    WITH c
    CALL apoc.lock.nodes([c])
    CALL {
        WITH c
        WITH c WHERE c.closed IS NULL
        ON CREATE SET c.channel_id = $c_channel_id
        SET c.closed = true
        SET c.updated_at = datetime($c_updated_at)
        SET c.close_height = $c_close_height
        SET (CASE WHEN c.capacity IS NULL THEN c END).capacity = $c_capacity
        SET (CASE WHEN c.channel_point IS NULL THEN c END).channel_point = $c_channel_point
        MATCH (n0)-[r0:OPENED]->(c)<-[r1:OPENED]-(n1)
        DELETE r0, r1
        RETURN count(*) AS cnt
    }
    RETURN c, cnt`
};


module.exports = {
    DB_QUERIES
}