var express = require('express');
var fs = require('fs');
var router = express.Router();
const neo4j = require('neo4j-driver');
const lnService = require('ln-service');
const {getNetworkGraph} = require('ln-service'); 

router.get('/', async function(req, res, next) {
  console.time('Total')
  let resStr = await graph();
  console.timeEnd('Total')
  res.send(resStr);
});

async function graph() {
  const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'admin123'))
  let session = driver.session()
  let txc;
  try {

    // let lngraph = fs.readFileSync('/Users/samani2/projects/btc/docs/graph.json');

    const {lnd} = lnService.authenticatedLndGrpc({
      cert: 'LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCk1JSUNyakNDQWxPZ0F3SUJBZ0lRSXZla0xXYXh4NDhxTSsxZFRPRGZFVEFLQmdncWhrak9QUVFEQWpBNk1SOHcKSFFZRFZRUUtFeFpzYm1RZ1lYVjBiMmRsYm1WeVlYUmxaQ0JqWlhKME1SY3dGUVlEVlFRREV3NVRRVTFCVGtreQpMVTB0TWpjd016QWVGdzB5TWpBeE1UVXhOalF6TXpOYUZ3MHlNekF6TVRJeE5qUXpNek5hTURveEh6QWRCZ05WCkJBb1RGbXh1WkNCaGRYUnZaMlZ1WlhKaGRHVmtJR05sY25ReEZ6QVZCZ05WQkFNVERsTkJUVUZPU1RJdFRTMHkKTnpBek1Ga3dFd1lIS29aSXpqMENBUVlJS29aSXpqMERBUWNEUWdBRXEvUk1tOXZhL2plMnNSNTUzdVlodE94bApZTjZkbEMxL3FyYzBkYnd1T21jYlo5eWlVUW1oS2krdU1RK1h5VTdHWVlRdnhEZ2wxU2w3VWhxS2ZKTVpFYU9DCkFUa3dnZ0UxTUE0R0ExVWREd0VCL3dRRUF3SUNwREFUQmdOVkhTVUVEREFLQmdnckJnRUZCUWNEQVRBUEJnTlYKSFJNQkFmOEVCVEFEQVFIL01CMEdBMVVkRGdRV0JCUW5YZHo0Ly9ZWDlHVXFxd0FyV1Rxc3d5WVVUVENCM1FZRApWUjBSQklIVk1JSFNnZzVUUVUxQlRra3lMVTB0TWpjd000SUpiRzlqWVd4b2IzTjBnZ1IxYm1sNGdncDFibWw0CmNHRmphMlYwZ2dkaWRXWmpiMjV1aHdSL0FBQUJoeEFBQUFBQUFBQUFBQUFBQUFBQUFBQUJoeEQrZ0FBQUFBQUEKQUFBQUFBQUFBQUFCaHhEK2dBQUFBQUFBQUs3ZVNQLytBQkVpaHhEK2dBQUFBQUFBQUJ3VU5hbkQyZ3lEaHdUQQpxQUVYaHhEK2dBQUFBQUFBQUFEa00vLytVeGlVaHhEK2dBQUFBQUFBQVBESWtkYmppcE9raHhEK2dBQUFBQUFBCkFGcW9ZaFFWV2VzYWh4RCtnQUFBQUFBQUFNNkJDeHk5TEFhZU1Bb0dDQ3FHU000OUJBTUNBMGtBTUVZQ0lRQ0wKMGZmS3RxSFVyU2NWUzQzV0ZDS291d0dWaUZ2SlBBL1FPc3RkemxjQmlnSWhBUHZqeHdTWVQvMDdwVDFqWmIzMQptOE5pRml1eXBFUUZxa3BhZmhYdUM2QTMKLS0tLS1FTkQgQ0VSVElGSUNBVEUtLS0tLQo=',
      macaroon: 'AgEDbG5kAvgBAwoQ464l+l6pJ3KuuITIeH8TbBIBMBoWCgdhZGRyZXNzEgRyZWFkEgV3cml0ZRoTCgRpbmZvEgRyZWFkEgV3cml0ZRoXCghpbnZvaWNlcxIEcmVhZBIFd3JpdGUaIQoIbWFjYXJvb24SCGdlbmVyYXRlEgRyZWFkEgV3cml0ZRoWCgdtZXNzYWdlEgRyZWFkEgV3cml0ZRoXCghvZmZjaGFpbhIEcmVhZBIFd3JpdGUaFgoHb25jaGFpbhIEcmVhZBIFd3JpdGUaFAoFcGVlcnMSBHJlYWQSBXdyaXRlGhgKBnNpZ25lchIIZ2VuZXJhdGUSBHJlYWQAAiR0aW1lLWJlZm9yZSAyMDIzLTAxLTMxVDEzOjI0OjE0LjA1N1oAAAYg1+OSWI6dJeuR/Ns0kBQCpjqsQ6XZ7B0EXgUg0Jzc8f8=',
      socket: '127.0.0.1:10009'
    });
    console.time('LND')
    const {channels, nodes} = await getNetworkGraph({lnd});
    console.timeEnd('LND')

    let edges = channels;

    console.time('ADD')


    txc = session.beginTransaction();
    const validNodes = new Set();
    for (let i = 0; i < nodes.length; i++) {
      let node = nodes[i];
      validNodes.add(node.public_key);

      let _alias = node.alias || '';
      let _pubKey = node.public_key;
      let _lastUpdate = node.updated_at || '';
      let _color = node.color || '';
      
      await txc.run(
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
      );
    }

    const validChannels = new Set();
    for (let i = 0; i < edges.length; i++) {
      let edge = edges[i];
      validChannels.add(edge);

      const _channelID = edge.id;
      const _chanPoint = edge.transaction_id + ':' + edge.transaction_vout;
      const _lastUpdate = edge.updated_at || '';
      const _capacity = edge.capacity;

      await txc.run(
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
      );

      const pubKey1 = edge.policies[0].public_key;
      const pubKey2 = edge.policies[1].public_key;

      const timeLockDelta1 = edge.policies[0].cltv_delta || '';
      const minHtlc1 = edge.policies[0].min_htlc_mtokens || '';
      const feeBaseMsat1 = edge.policies[0].base_fee_mtokens || '';
      const feeRateMilliMsat1 = edge.policies[0].fee_rate || '';
      const disabled1 = edge.policies[0].is_disabled || true;
      const maxHtlcMsat1 = edge.policies[0].max_htlc_mtokens || '';
      const lastUpdate1 = edge.policies[0].updated_at || '';

      const timeLockDelta2 = edge.policies[1].cltv_delta || '';
      const minHtlc2 = edge.policies[1].min_htlc_mtokens || '';
      const feeBaseMsat2 = edge.policies[1].base_fee_mtokens || '';
      const feeRateMilliMsat2 = edge.policies[1].fee_rate || '';
      const disabled2 = edge.policies[1].is_disabled || true;
      const maxHtlcMsat2 = edge.policies[1].max_htlc_mtokens || '';
      const lastUpdate2 = edge.policies[1].updated_at || '';

      await txc.run(
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
        `MERGE (n:Node {pubKey: $pubKey})-[r:OPENED]-(c:Channel {channelID: $channelID})
        ON MATCH SET r.timeLockDelta = $timeLockDelta
        ON MATCH SET r.minHtlc = $minHtlc
        ON MATCH SET r.maxHtlcMsat = $maxHtlcMsat
        ON MATCH SET r.feeBaseMsat = $feeBaseMsat
        ON MATCH SET r.feeRateMilliMsat = $feeRateMilliMsat
        ON MATCH SET r.disabled = $disabled
        ON MATCH SET r.lastUpdate = $lastUpdate`,
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

    const existingChannelIDs = await txc.run(
      `MATCH (c:Channel) RETURN c.channelID AS channelID`
    );

    for (let i = 0; i < existingChannelIDs.records.length; i++) {
      const existingChannelID = existingChannelIDs.records[0].get('channelID');

      if (!validChannels.has(existingChannelID)) {
        await txc.run(
          `MATCH (c:Channel {channelID: $channelID}) DETACH DELETE c`,
          {
            channelID : existingChannelID
          }
        );
      }
    }

    const existingPubKeys = await txc.run(
      `MATCH (n:Node) RETURN n.pubKey AS pubKey`
    );
  
    for (let i = 0; i < existingPubKeys.records.length; i++) {
      const existingPubKey = existingPubKeys.records[0].get('pubKey');

      if (!validNodes.has(existingPubKey)) {
        await txc.run(
          `MATCH (n:Node {pubKey: $pubKey}) DETACH DELETE n`,
          {
            pubKey : existingPubKey
          }
        );
      }
    }

    await txc.commit()
    console.timeEnd('ADD')
    console.log(nodes.length + ' nodes and ' + edges.length + ' edges are loaded');
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
