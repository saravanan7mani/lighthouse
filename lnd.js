const config = require('./config.json');
const lnService = require('ln-service');
const assert = require("assert");

let _lnd;

function initLND() {
  return new Promise((resolve, reject) => {
    if (_lnd) {
      console.warn("Trying to init lnd grpc again!");
      return resolve();
    }

    try {
      const {lnd} = lnService.authenticatedLndGrpc({
        cert: config.lnd.cert,
        macaroon: config.lnd.macaroon,
        socket: config.lnd.uri
      });

      _lnd = lnd;
      
      resolve();
    }
    catch(e) {
      reject('error while connecting lnd grpc. ' + e);
    }
  });
}

module.exports = {
  initLND,
  getLND,
};

function getLND() {
  assert.ok(_lnd, "LND Grpc has not been initialized. Please call init first.");
  return _lnd;
}