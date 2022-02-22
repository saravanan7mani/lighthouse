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

    UPDATE_NODES_CAPACITY_INFO: `MATCH (n0:Node)-[r0:OPENED]->(c:Channel)
        WITH n0, COUNT(c) AS n0_channel_count, SUM(c.capacity) AS n0_capacity
        SET n0.capacity = n0_capacity
        SET n0.channel_count = n0_channel_count`,

    UPDATE_NODE_CAPACITY_INFO: `Match (n:Node {public_key: $public_key})
        SET n.capacity = $capacity
        SET n.channel_count = $channel_count`,

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
            SET n.capacity = $capacity
            SET n.channel_count = $channel_count
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
            SET n0.capacity = $n0_capacity
            SET n0.channel_count = $n0_channel_count
            SET n1.capacity = $n1_capacity
            SET n1.channel_count = $n1_channel_count
            SET (CASE WHEN $c_capacity IS NOT NULL THEN c END).capacity = $c_capacity
            SET (CASE WHEN $c_channel_point IS NOT NULL THEN c END).channel_point = $c_channel_point
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
        ON CREATE SET c.channel_id = $c_channel_id
        SET c.closed = true
        SET c.updated_at = datetime($c_updated_at)
        SET c.close_height = $c_close_height
        SET (CASE WHEN $c_capacity IS NOT NULL THEN c END).capacity = $c_capacity
        SET (CASE WHEN $c_channel_point IS NOT NULL THEN c END).channel_point = $c_channel_point
        WITH c
        MATCH (n0)-[r0:OPENED]->(c)<-[r1:OPENED]-(n1)
        DELETE r0, r1
        RETURN n0.public_key as public_keys`,

    GET_NODES_COUNT_BY_MIN_MAX_CAPACITY: `MATCH (n:Node)-[OPENED]->(Channel) WHERE n.capacity >= $min_capacity AND n.capacity <= $max_capacity 
        RETURN count(DISTINCT(id(n))) AS total`,

    GET_NODES_COUNT_BY_MIN_CAPACITY: `MATCH (n:Node)-[OPENED]->(Channel) WHERE n.capacity >= $min_capacity RETURN count(DISTINCT(id(n))) AS total`,

    GET_NODES_COUNT_BY_MAX_CAPACITY: `MATCH (n:Node)-[OPENED]->(Channel) WHERE n.capacity <= $max_capacity RETURN count(DISTINCT(id(n))) AS total`,

    GET_NODES_COUNT_BY_CAPACITY: `MATCH (n:Node)-[OPENED]->(Channel) WHERE n.capacity = $capacity RETURN count(DISTINCT(id(n))) AS total`,

    GET_NODES_COUNT: `MATCH (n:Node)-[OPENED]->(Channel) RETURN count(DISTINCT(id(n))) AS total`,

    GET_NODES_BY_MIN_MAX_CAPACITY: `MATCH (n:Node)-[OPENED]->(Channel) WHERE n.capacity >= $min_capacity AND n.capacity <= $max_capacity 
        RETURN DISTINCT(id(n)) AS id, n.alias AS alias, n.capacity AS capacity, n.channel_count AS channel_count, n.public_key AS public_key, 
        n.sockets AS sockets, apoc.date.toISO8601(n.updated_at.epochMillis, "ms") AS updated_at 
        ORDER BY n.capacity, id(n) SKIP $skip LIMIT $limit`,

    GET_NODES_BY_MIN_CAPACITY: `MATCH (n:Node)-[OPENED]->(Channel) WHERE n.capacity >= $min_capacity 
        RETURN DISTINCT(id(n)) AS id, n.alias AS alias, n.capacity AS capacity, n.channel_count AS channel_count, n.public_key AS public_key, 
        n.sockets AS sockets, apoc.date.toISO8601(n.updated_at.epochMillis, "ms") AS updated_at
        ORDER BY n.capacity, id(n) SKIP $skip LIMIT $limit`,

    GET_NODES_BY_MAX_CAPACITY: `MATCH (n:Node)-[OPENED]->(Channel) WHERE n.capacity <= $max_capacity 
        RETURN DISTINCT(id(n)) AS id, n.alias AS alias, n.capacity AS capacity, n.channel_count AS channel_count, n.public_key AS public_key, 
        n.sockets AS sockets, apoc.date.toISO8601(n.updated_at.epochMillis, "ms") AS updated_at
        ORDER BY n.capacity, id(n) SKIP $skip LIMIT $limit`,

    GET_NODES_BY_CAPACITY: `MATCH (n:Node)-[OPENED]->(Channel) WHERE n.capacity = $capacity 
        RETURN DISTINCT(id(n)) AS id, n.alias AS alias, n.capacity AS capacity, n.channel_count AS channel_count, n.public_key AS public_key, 
        n.sockets AS sockets, apoc.date.toISO8601(n.updated_at.epochMillis, "ms") AS updated_at
        ORDER BY n.capacity, id(n) SKIP $skip LIMIT $limit`,

    GET_NODES: `MATCH (n:Node)-[OPENED]->(Channel) RETURN DISTINCT(id(n)) AS id, n.alias AS alias, n.capacity AS capacity, n.channel_count AS channel_count, 
        n.public_key AS public_key, n.sockets AS sockets, apoc.date.toISO8601(n.updated_at.epochMillis, "ms") AS updated_at
        ORDER BY n.capacity, id(n) SKIP $skip LIMIT $limit`,

    GET_PEERS_OF_NODES: `UNWIND $public_keys AS n_public_key
        MATCH (n0:Node {public_key: n_public_key})-[r0:OPENED]->(c:Channel)<-[r1:OPENED]-(n1:Node) 
        RETURN n0, r0, c, r1, n1, apoc.date.toISO8601(n0.updated_at.epochMillis, "ms") AS n0_updated_at, 
        apoc.date.toISO8601(n1.updated_at.epochMillis, "ms") AS n1_updated_at,
        apoc.date.toISO8601(c.updated_at.epochMillis, "ms") AS c_updated_at, 
        apoc.date.toISO8601(r0.updated_at.epochMillis, "ms") AS r0_updated_at, 
        apoc.date.toISO8601(r1.updated_at.epochMillis, "ms") AS r1_updated_at  
        ORDER BY n0.capacity, n1.capacity`
}

module.exports = {
    DB_QUERIES
}