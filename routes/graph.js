const {loadGraphToDB} = require('../startup');
const {getNodesList} = require('../graphService');
const {getChannelsByNodes} = require('../graphService');
const express = require('express');
const router = express.Router();
const logger = require('log4js').getLogger("graph");

router.get('/nodes', async function(req, res) {
  let min_capacity = req.query.min_capacity;
  let max_capacity = req.query.max_capacity;
  let skip = req.query.skip;
  let limit = req.query.limit;

  let input = {min_capacity, max_capacity, skip, limit};
  const errMsg = verifyGetNodesRequest(input);
  if (errMsg.length) {
    logger.warn('Invalid input for get nodes request: ' + errMsg);
    res.status(400).json(errMsg);
  }
  else {
    min_capacity = parseInt(min_capacity);
    max_capacity = parseInt(max_capacity);
    skip = parseInt(skip);
    limit = parseInt(limit);

    input = {min_capacity, max_capacity, skip, limit};
    res.json(await getNodesList(input));
  }
});

router.post('/nodes', async function(req, res) {
  const public_keys = req.body.public_keys;
  const errMsg = verifyGetChannelsRequest(public_keys);
  if (errMsg.length) {
    logger.warn('Invalid input for get channels & peers request: ' + errMsg);
    res.status(400).json(errMsg);
  }
  else {
    res.json(await getChannelsByNodes(public_keys));
  }
});

function verifyGetChannelsRequest(public_keys) {
  let errMsg = '';
  if (public_keys == null || !public_keys.length) {
    errMsg = 'Empty public_keys for get channels & peers.';
  }
  else if (public_keys.length > 10) {
    errMsg = 'More than 10 public_keys are not allowed.';
  }
  else {
    const validLength = public_keys.every((public_key) => {
      return public_key != null && public_key.length <= 100;
    });
    if (!validLength) {
      errMsg = 'Every public_key length should be less than or equal to 100 characters.'
    }
  }
  return errMsg;
}

function verifyGetNodesRequest(input) {
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