const {loadGraphToDB} = require('../startup');
const {getNodesByTotalCapacity} = require('../graphService');
const express = require('express');
const router = express.Router();

router.get('/', async function(req, res, next) {
  console.time('GRAPH_LOAD_TIME')
  await loadGraphToDB();
  console.timeEnd('GRAPH_LOAD_TIME')
  res.send();
});

router.get('/nodes', async function(req, res, next) {
  console.time('NODES_TIME')
  let min_capacity = parseInt(req.query.min_capacity);
  let max_capacity = parseInt(req.query.max_capacity);
  let skip = parseInt(req.query.skip);
  let limit = parseInt(req.query.limit);
  const result = await getNodesByTotalCapacity(min_capacity, max_capacity, skip, limit);
  console.timeEnd('NODES_TIME')
  res.json(result);
});

module.exports = router;