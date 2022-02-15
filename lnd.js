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
      const uri = process.env.NEO4J_URI || config.lnd.uri || '127.0.0.1:10009';
      const username = process.env.NEO4J_USERNAME || config.lnd.cert || null;
      const password = process.env.NEO4J_PASSWORD || config.lnd.macaroon || null;
      if (!username || !password) {
        reject('Missing lnd grpc credential.');
      } 
      else {
        const {lnd} = lnService.authenticatedLndGrpc({
          cert: config.lnd.cert,
          macaroon: config.lnd.macaroon,
          socket: config.lnd.uri
        });
  
        _lnd = lnd;
        
        resolve();
      }
    }
    catch(e) {
      reject('error while connecting lnd grpc. ' + e);
    }
  });
}

module.exports = {
  initLND,
  getLND
};

function getLND() {
  assert.ok(_lnd, "LND Grpc has not been initialized. Please call init first.");
  return _lnd;
}