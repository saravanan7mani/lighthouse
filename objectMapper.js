function transformChannel(source) {
    return {
        id: source.id,
        capacity: source.capacity,
        transaction_id: source.transaction_id,
        transaction_vout: source.transaction_vout,
        updated_at: source.updated_at,
        policies: [{
            base_fee_mtokens: source.base_fee_mtokens,
            cltv_delta: source.cltv_delta,
            fee_rate: source.fee_rate,
            is_disabled: source.is_disabled,
            max_htlc_mtokens: source.max_htlc_mtokens,
            min_htlc_mtokens: source.min_htlc_mtokens,
            public_key: source.public_keys[0],
            updated_at: source.updated_at // TBD - Need to be sure about the receiving order of announcements
        }]
    };
}

function copyChannelPolciy(source, target, index) {
    const targetPolicy = target.policies[index];
    
    if (targetPolicy.updated_at && source.updated_at) {
        if (targetPolicy.updated_at > source.updated_at) { // If both dates exists, accept the new notification if its latest. Else blindly update. To be revisted.
            return;
        }
    }

    targetPolicy.base_fee_mtokens = source.base_fee_mtokens;
    targetPolicy.cltv_delta = source.cltv_delta;
    targetPolicy.fee_rate = source.fee_rate;
    targetPolicy.is_disabled = source.is_disabled;
    targetPolicy.max_htlc_mtokens = source.max_htlc_mtokens;
    targetPolicy.min_htlc_mtokens = source.min_htlc_mtokens;
    targetPolicy.updated_at = source.updated_at;
    target.updated_at = source.updated_at;
    return target;
}

module.exports = {
    transformChannel,
    copyChannelPolciy
};