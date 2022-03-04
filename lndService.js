const {EventEmitter} = require('events');
const {getLND} = require('./lnd');
const {subscribeToGraph} = require('ln-service');
const logger = require('log4js').getLogger("lndService");

class LndGraphToDBHandler extends EventEmitter {
    constructor() {
        super();
        this.notifications = [];
    }

    moveToDB(notificationType) {
        this.emit('move', notificationType);
    }
}

/**
Assumptions based on ln-service & LND GRPC Docs and BOLT Spec:
1. There won't be any missing of notification by LND.
2. But in case of any network failure, there can be missing of notifications. - Can be addressed with caching of notifications keys/ids & updated_at, distributed message brokers and fleet of LNDs.
*/
function subscribeToLNDGraph() {
    logger.info('subscribing to LND graph notifications.')
    const lnd = getLND();
    const lndGraphSubscription = subscribeToGraph({lnd});
    const lndGraphToDBHandler = new LndGraphToDBHandler();

    lndGraphSubscription.on('node_updated', (node_updated) => {
        lndGraphToDBHandler.notifications.push(node_updated);
        lndGraphToDBHandler.moveToDB('node_updated');
    });

    lndGraphSubscription.on('channel_updated', (channel_updated) => {
        lndGraphToDBHandler.notifications.push(channel_updated);
        lndGraphToDBHandler.moveToDB('channel_updated');
    });

    lndGraphSubscription.on('channel_closed', (channel_closed) => {
        lndGraphToDBHandler.notifications.push(channel_closed);
        lndGraphToDBHandler.moveToDB('channel_closed');
    });

    return lndGraphToDBHandler;
}

module.exports = {
    LndGraphToDBHandler,
    subscribeToLNDGraph
} 