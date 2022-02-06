const config = require('./config.json');
const neo4j = require('neo4j-driver');
const assert = require("assert");

let _db;

function initDB() {
  return new Promise((resolve, reject) => {
    if (_db) {
      console.warn("Trying to init neo4j DB again!");
      return resolve();
    }

    try {
        _db = neo4j.driver(config.neo4j.uri,
          neo4j.auth.basic(config.neo4j.username, config.neo4j.password));
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