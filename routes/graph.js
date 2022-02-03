var {sub} = require('../graphService');
const express = require('express');
const router = express.Router();

router.get('/', async function(req, res, next) {
  console.time('GRAPH_LOAD_TIME')
  console.timeEnd('GRAPH_LOAD_TIME')
  res.send();
});

module.exports = router;