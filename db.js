const config = require('./configs/config.json');
const neo4j = require('neo4j-driver');
const assert = require("assert");
const logger = require('log4js').getLogger("db");
let _db;

function initDB() {
  return new Promise((resolve, reject) => {
    if (_db) {
      logger.warn('Trying to init neo4j DB again!');
      return resolve();
    }

    try {
        const uri = process.env.NEO4J_URI || config.neo4j.uri || 'bolt://localhost:7687';
        const username = process.env.NEO4J_USERNAME || config.neo4j.username || 'neo4j';
        const password = process.env.NEO4J_PASSWORD || config.neo4j.password || 'neo4j';
        _db = neo4j.driver(uri, neo4j.auth.basic(username, password));
        resolve();
    }
    catch(e) {
      reject('error while connecting neo4j DB. ' + e);
    }
  });
}

module.exports = {
    initDB,
    getDB
};

function getDB() {
    assert.ok(_db, "DB has not been initialized. Please call init first.");
    return _db;
}