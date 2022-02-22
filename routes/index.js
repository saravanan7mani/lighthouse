var express = require('express');
var router = express.Router();

router.get('/', function(req, res) {
  res.json('hail satoshi');
});

module.exports = router;
