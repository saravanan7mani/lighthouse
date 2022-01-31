var express = require('express');
var fs = require('fs');
var router = express.Router();
const neo4j = require('neo4j-driver')

router.get('/', function(req, res, next) {
  res.send(graph());
});

async function graph() {
  const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'admin123'))
  let session = driver.session()
  let txc;
  try {
    let lngraph = fs.readFileSync('/Users/samani2/projects/btc/docs/graph.json');

    lngraph = JSON.parse(lngraph);
    let nodes = lngraph.nodes;
    let edges = lngraph.edges;

    await session.run(
      'MATCH (n) DETACH DELETE n'
    );

    txc = session.beginTransaction();

    await txc.run(
      'DROP INDEX ON :Node(pubKey)'
    )
    await txc.run(
      'DROP INDEX ON :Node(alias)'
    )
    await txc.run(
      'DROP INDEX ON :Channel(channelID)'
    )
    await txc.run(
      'DROP INDEX ON :Channel(capacity)'
    )
    await txc.run(
      'DROP INDEX ON :Channel(chanPoint)'
    )

    await txc.run(
      'CREATE INDEX ON :Node(pubKey)'
    )
    await txc.run(
      'CREATE INDEX ON :Node(alias)'
    )
    await txc.run(
      'CREATE INDEX ON :Channel(channelID)'
    )
    await txc.run(
      'CREATE INDEX ON :Channel(capacity)'
    )
    await txc.run(
      'CREATE INDEX ON :Channel(chanPoint)'
    )

    await txc.commit();

    txc = session.beginTransaction();
    
    for (let i = 0; i < nodes.length; i++) {
      let node = nodes[i];
      let _alias = node.alias || '';
      let _pubKey = node.pub_key || '';
      let _lastUpdate = node.last_update || '';
      let _color = node.color || '';
      
      await txc.run(
        'MERGE (n:Node { alias: $alias, pubKey: $pubKey, lastUpdate: $lastUpdate, color: $color})',
        {
          alias: _alias,
          pubKey: _pubKey,
          lastUpdate: _lastUpdate,
          color: _color
        }
      );
    }

    for (let i = 0; i < edges.length; i++) {
      let edge = edges[i];
      const _channelID = edge.channel_id || undefined;
      const _chanPoint = edge.chan_point || undefined;
      const _lastUpdate = edge.last_update || '';
      const _capacity = edge.capacity || 0;

      await txc.run(
        'CREATE (c:Channel {channelID: $channelID, chanPoint: $chanPoint, lastUpdate: $lastUpdate, capacity: $capacity})',
        {
          channelID: _channelID,
          chanPoint: _chanPoint,
          lastUpdate: _lastUpdate,
          capacity: _capacity
        }
      );

      let pubKey1 = edge.node1_pub || undefined;
      let pubKey2 = edge.node2_pub || undefined;

      let timeLockDelta1 = '';
      let minHtlc1 = '';
      let feeBaseMsat1 = '';
      let feeRateMilliMsat1 = '';
      let disabled1 = true;
      let maxHtlcMsat1 = '';
      let lastUpdate1 = '';

      let timeLockDelta2 = '';
      let minHtlc2 = '';
      let feeBaseMsat2 = '';
      let feeRateMilliMsat2 = '';
      let disabled2 = true;
      let maxHtlcMsat2 = '';
      let lastUpdate2 = '';

      if (edge.node1_policy) {
        timeLockDelta1 = edge.node1_policy.time_lock_delta || '';
        minHtlc1 = edge.node1_policy.min_htlc || '';
        feeBaseMsat1 = edge.node1_policy.fee_base_msat || '';
        feeRateMilliMsat1 = edge.node1_policy.fee_rate_milli_msat || '';
        disabled1 = edge.node1_policy.disabled || true;
        maxHtlcMsat1 = edge.node1_policy.max_htlc_msat || '';
        lastUpdate1 = edge.node1_policy.last_update || '';
      }

      if (edge.node2_policy) {
        timeLockDelta2 = edge.node2_policy.time_lock_delta || '';
        minHtlc2 = edge.node2_policy.min_htlc || '';
        feeBaseMsat2 = edge.node2_policy.fee_base_msat || '';
        feeRateMilliMsat2 = edge.node2_policy.fee_rate_milli_msat || '';
        disabled2 = edge.node2_policy.disabled || true;
        maxHtlcMsat2 = edge.node2_policy.max_htlc_msat || '';
        lastUpdate2 = edge.node2_policy.last_update || '';
      }

      await txc.run(
        'MATCH (n:Node),(c:Channel) WHERE n.pubKey = $pubKey AND c.channelID = $channelID CREATE (n)-[r:OPENED { timeLockDelta: $timeLockDelta, minHtlc: $minHtlc, maxHtlcMsat: $maxHtlcMsat, feeBaseMsat: $feeBaseMsat, feeRateMilliMsat: $feeRateMilliMsat, disabled: $disabled, lastUpdate: $lastUpdate } ]->(c)',
        {
          pubKey: pubKey1,
          channelID: _channelID,
          timeLockDelta: timeLockDelta1,
          minHtlc: minHtlc1,
          maxHtlcMsat: maxHtlcMsat1,
          feeBaseMsat: feeBaseMsat1,
          feeRateMilliMsat: feeRateMilliMsat1,
          disabled: disabled1,
          lastUpdate: lastUpdate1
        }
      );

      await txc.run(
        'MATCH (n:Node),(c:Channel) WHERE n.pubKey = $pubKey AND c.channelID = $channelID CREATE (n)-[r:OPENED { timeLockDelta: $timeLockDelta, minHtlc: $minHtlc, maxHtlcMsat: $maxHtlcMsat, feeBaseMsat: $feeBaseMsat, feeRateMilliMsat: $feeRateMilliMsat, disabled: $disabled, lastUpdate: $lastUpdate } ]->(c)',
        {
          pubKey: pubKey2,
          channelID: _channelID,
          timeLockDelta: timeLockDelta2,
          minHtlc: minHtlc2,
          maxHtlcMsat: maxHtlcMsat2,
          feeBaseMsat: feeBaseMsat2,
          feeRateMilliMsat: feeRateMilliMsat2,
          disabled: disabled2,
          lastUpdate: lastUpdate2
        }
      );
    }

    await txc.commit()
    console.log('committed')
    return nodes.length + ' nodes and ' + edges.length + ' edges are loaded';
  } catch (error) {
    console.log(error)
    await txc.rollback()
    console.log('rolled back')
    return error;
  } finally {
    await session.close()
    await driver.close()
  }
}

module.exports = router;
