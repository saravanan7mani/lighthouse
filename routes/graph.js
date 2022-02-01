var {loadGraphToDB} = require('../graphService');
const express = require('express');
const router = express.Router();

router.get('/', async function(req, res, next) {
  console.time('GRAPHLOAD')
  let resStr = await loadGraphToDB();
  console.timeEnd('GRAPHLOAD')
  res.send(resStr);
});

module.exports = router;