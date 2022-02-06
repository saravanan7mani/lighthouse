const {EventEmitter} = require('events');
const {getLND} = require('./lnd');
const {subscribeToGraph} = require('ln-service');
const {transformChannel} = require('./objectMapper');
const {copyChannelPolciy} = require('./objectMapper');

class LndGraphToDBHandler extends EventEmitter {
    constructor() {
        super();
        this.nodeMap = new Map();
        this.channelMap = new Map();
    }

    moveToDB(notificationType) {
        this.emit('move', notificationType);
    }

    getNodeMap() {
        return this.nodeMap;
    }

    getChannelMap() {
        return this.nodeMap;
    }
}

/**
Assumptions based on ln-service & LND GRPC Docs and BOLT Spec:
1. All 3 kind of notifications will always provide values for all its response fields.
2. Consumer of the above notification can assume that the order of notifications for every Node and Channel are already assured.
3. If channel_closed is received, there won't be further notifications for that channel from either peers.
4. There won't be any missing of notification.
5. But in case of any network failure, there can be missing of notifications. - NEED TO BE FIXED WITH PRIMARY/SECONDARY.
*/ 

function subscribeToLNDGraph() {
    const lnd = getLND();
    const lndGraphSubscription = subscribeToGraph({lnd});

    const lndGraphToDBHandler = new LndGraphToDBHandler();
    const nodeMap = lndGraphToDBHandler.getNodeMap();
    const channelMap = lndGraphToDBHandler.getChannelMap(); // both channel update & closed events are stored in same map for simplicity.

    lndGraphSubscription.on('node_updated', (node_updated) => {
        nodeMap.set(node_updated.public_key, node_updated);
        lndGraphToDBHandler.moveToDB('node_updated');
    });

    lndGraphSubscription.on('channel_updated', (channel_updated) => {
        if (channelMap.has(channel_updated.id)) {
            const channel = channelMap.get(channel_updated.id);

            if (channel.policies[0].public_key === channel_updated.public_keys[0]) {
                copyChannelPolciy(channel_updated, channel, 0);
            }
            else {
                copyChannelPolciy(channel_updated, channel, 1);
            }
        }
        else {
            channelMap.set(channel_updated.id, transformChannel(channel_updated));
        }
        lndGraphToDBHandler.moveToDB('channel_updated');
    });

    lndGraphSubscription.on('channel_closed', (channel_closed) => {
        channelMap.set(channel_closed.id, channel_closed);
        lndGraphToDBHandler.moveToDB('channel_closed');
    });

    return lndGraphToDBHandler;
}

module.export = {
    LndGraphToDBHandler,
    subscribeToLNDGraph
} 