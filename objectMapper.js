function transformChannel(source) {
    return {
        id: source.id,
        capacity: source.capacity,
        transaction_id: source.transaction_id,
        transaction_vout: source.transaction_vout,
        updated_at: _updated_at,
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

function copyChannelPolciy(source, target) {
    target.base_fee_mtokens = source.base_fee_mtokens;
    target.cltv_delta = source.cltv_delta;
    target.fee_rate = source.fee_rate;
    target.is_disabled = source.is_disabled;
    target.max_htlc_mtokens = source.max_htlc_mtokens;
    target.min_htlc_mtokens = source.min_htlc_mtokens;
    target.updated_at = source.updated_at;
}

module.exports = {
    transformChannel,
    copyChannelPolciy
};