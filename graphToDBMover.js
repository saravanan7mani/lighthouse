const {EventEmitter} = require('events');
const {getLND} = require('./lnd');
const {subscribeToGraph} = require('ln-service');
const {transformChannel} = require('./objectMapper');
const {copyChannelPolciy} = require('./objectMapper');

class GraphToDBMover extends EventEmitter {
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

function subscribeToLNDGraph() {
    const lnd = getLND();
    const _sub = subscribeToGraph({lnd});

    const graphToDBMover = new GraphToDBMover();
    const _nodeMap = graphToDBMover.getNodeMap();
    const _channelMap = graphToDBMover.getChannelMap(); // both channel update & closed events are stored in same map for simplicity.

    _sub.on('node_updated', (nodeUpdate) => {
        const node = _channelMap.get(nodeUpdate.public_key);
        if (node.updated_at && nodeUpdate.updated_at) {
            if (node.updated_at > nodeUpdate.updated_at) { // If both dates exists, accept the new notification if its latest. Else blindly update. To be revisted.
                return;
            }
        }
        _nodeMap.set(nodeUpdate.public_key, nodeUpdate);
        graphToDBMover.moveToDB('node_updated');
    });

    _sub.on('channel_updated', (channel_updated) => {
        if (_channelMap.has(channel_updated.id)) {
            const channel = _channelMap.get(channel_updated.id);

            if (channel.channel_closed) { // Dont override closed channel with any new announcement
                return;
            }

            if (channel.policies[0].public_key === channel_updated.public_keys[0]) {
                if (!copyChannelPolciy(channel_updated, channel, 0)) {
                    return;
                }
            }
            else {
                if (!copyChannelPolciy(channel_updated, channel, 1)) {
                    return;
                }
            }
        }
        else {
            _channelMap.set(transformChannel(channel_updated.id, channel_updated));
        }
        graphToDBMover.moveToDB('channel_updated');
    });

    _sub.on('channel_closed', (channel_closed) => {
        _channelMap.set(channel_updated.id, channel_updated);
        graphToDBMover.moveToDB('channel_closed');
    });

    return graphToDBMover;
}

module.export = {
    GraphToDBMover,
    subscribeToLNDGraph
} 

