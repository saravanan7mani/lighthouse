var {loadGraphToDB} = require('../graphService');
const express = require('express');
const router = express.Router();

router.get('/', async function(req, res, next) {
  console.time('GRAPH_LOAD_TIME')
  let resStr = await loadGraphToDB();
  console.timeEnd('GRAPH_LOAD_TIME')
  res.send(resStr);
});

module.exports = router;