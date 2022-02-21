const config = require('./configs/config.json');
const lnService = require('ln-service');
const assert = require("assert");
const logger = require('log4js').getLogger("lnd");

let _lnd;

function initLND() {
  return new Promise((resolve, reject) => {
    if (_lnd) {
      logger.warn("Trying to init lnd grpc again!");
      return resolve();
    }

    try {
      const uri = process.env.LND_URI || config.lnd.uri || '127.0.0.1:10009';
      const cert = process.env.LND_CERT || config.lnd.cert || '';
      const macaroon = process.env.LND_MACAROON || config.lnd.macaroon || null;
      if (macaroon != null) {
        const {lnd} = lnService.authenticatedLndGrpc({
          cert: cert,
          macaroon: macaroon,
          socket: uri
        });
  
        _lnd = lnd;
        
        resolve();
      } 
      else {
        reject('Missing macaroon for lnd auth.');
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