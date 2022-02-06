const {EventEmitter} = require('events');
const {getLND} = require('./lnd');
const {subscribeToGraph} = require('ln-service');
const {transformChannel} = require('./objectMapper');
const {copyChannelPolciy} = require('./objectMapper');

class LndGraphToDBHandler extends EventEmitter {
    constructor() {
        super();
        this.notifcations = [];
    }

    moveToDB(notificationType) {
        this.emit('move', notificationType);
    }
}

/**
Assumptions based on ln-service & LND GRPC Docs and BOLT Spec:
1. 
2. 
3. 
4. There won't be any missing of notification.
5. But in case of any network failure, there can be missing of notifications. - NEED TO BE FIXED WITH PRIMARY/SECONDARY.
*/ 

function subscribeToLNDGraph() {
    const lnd = getLND();
    const lndGraphSubscription = subscribeToGraph({lnd});
    const lndGraphToDBHandler = new LndGraphToDBHandler();

    lndGraphSubscription.on('node_updated', (node_updated) => {
        lndGraphToDBHandler.notifcations.push(node_updated);
        lndGraphToDBHandler.moveToDB('node_updated');
    });

    lndGraphSubscription.on('channel_updated', (channel_updated) => {
        lndGraphToDBHandler.notifcations.push(channel_updated);
        lndGraphToDBHandler.moveToDB('channel_updated');
    });

    lndGraphSubscription.on('channel_closed', (channel_closed) => {
        lndGraphToDBHandler.notifcations.push(channel_closed);
        lndGraphToDBHandler.moveToDB('channel_closed');
    });

    return lndGraphToDBHandler;
}

module.export = {
    LndGraphToDBHandler,
    subscribeToLNDGraph
} 