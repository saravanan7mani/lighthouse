const {loadGraphToDB} = require('../startup');
const {getNodesByTotalCapacity} = require('../graphService');
const express = require('express');
const router = express.Router();

router.get('/', async function(req, res) {
  console.time('GRAPH_LOAD_TIME')
  await loadGraphToDB();
  console.timeEnd('GRAPH_LOAD_TIME')
  res.send();
});

router.get('/nodes', async function(req, res) {
  console.time('NODES_TIME')

  let min_capacity = req.query.min_capacity;
  let max_capacity = req.query.max_capacity;
  let skip = req.query.skip;
  let limit = req.query.limit;

  let input = {min_capacity, max_capacity, skip, limit};
  const errMsg = verifyGetNodesByTotalCapacityInput(input);
  if (errMsg.length) {
    res.status(400).json(errMsg);
  }
  else {
    min_capacity = parseInt(min_capacity);
    max_capacity = parseInt(max_capacity);
    skip = parseInt(skip);
    limit = parseInt(limit);

    input = {min_capacity, max_capacity, skip, limit};
    res.json(await getNodesByTotalCapacity(input));
  }

  console.timeEnd('NODES_TIME')
});

function verifyGetNodesByTotalCapacityInput(input) {
  let errMsg = '';

  const min_capacity = parseInt(input.min_capacity);
  const max_capacity = parseInt(input.max_capacity);
  const skip = parseInt(input.skip);
  const limit = parseInt(input.limit);

  if (typeof input.min_capacity !== 'undefined') {
    if (!Number.isSafeInteger(min_capacity) || min_capacity < 1) {
      errMsg = errMsg + 'min_capacity ' + input.min_capacity + ', ';
    }
  }
  
  if (typeof input.max_capacity !== 'undefined') {
    if (!Number.isSafeInteger(max_capacity) || max_capacity < 1) {
      errMsg = errMsg + 'max_capacity ' + input.max_capacity + ', ';
    }
  }
  
  if (!errMsg.length) {
    if (Number.isSafeInteger(min_capacity) && Number.isSafeInteger(max_capacity) && min_capacity > max_capacity) {
      errMsg = errMsg + 'min_capacity '+input.min_capacity+' is greater than max_capacity ' + input.max_capacity + ', ';
    }
  }
  
  if (typeof input.skip !== 'undefined') {
    if (!Number.isSafeInteger(skip) || skip < 0) {
      errMsg = errMsg + 'skip ' + input.skip + ', ';
    }
  }
  
  if (typeof input.limit !== 'undefined') {
    if (!Number.isSafeInteger(limit) || input.limit < 0) {
      errMsg = errMsg + 'limit ' + input.limit + ', ';
    }
  }

  if (errMsg.length) {
    return 'Invalid input: ' + errMsg.slice(0, -2);
  }
  return errMsg;
}

module.exports = router;