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

    moveToDB() {
        this.emit('move')
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
    const _channelMap = graphToDBMover.getChannelMap();

    _sub.on('node_updated', (nodeUpdate) => {
        _nodeMap.set(nodeUpdate.public_key, nodeUpdate);
        graphToDBMover.moveToDB();
    });

    _sub.on('channel_updated', (channel_updated) => {
        if (_channelMap.has(channel_updated.id)) {
            const channel = _channelMap.get(channel_updated.id);

            if (channel.policies[0].public_key === channel_updated.public_keys[0]) {
                copyChannelPolciy(channel_updated, channel.policies[0])
            }
            else {
                copyChannelPolciy(channel_updated, channel.policies[1])
            }
        }
        else {
            _channelMap.set(transformChannel(channel_updated.id, channel_updated));
        }
        graphToDBMover.moveToDB();
    });

    _sub.on('channel_closed', (channel_closed) => {
        _channelMap.set(channel_updated.id, channel_updated);
        graphToDBMover.moveToDB();
    });

    return graphToDBMover;
}

module.export = {
    GraphToDBMover,
    subscribeToLNDGraph
} 

