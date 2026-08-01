use keymaster_multisig::*;
use serde::Deserialize;

#[derive(Deserialize)]
struct Fixture {
    protocol: String,
    version: u32,
    #[serde(rename = "feeRate")]
    fee_rate: u64,
    #[serde(rename = "buyerPrivHex")]
    buyer_priv_hex: String,
    #[serde(rename = "sellerPrivHex")]
    seller_priv_hex: String,
    #[serde(rename = "arbiterPrivHex")]
    arbiter_priv_hex: String,
    #[serde(rename = "buyerUtxos")]
    buyer_utxos: Vec<Utxo>,
    #[serde(rename = "poolAmount")]
    pool_amount: u64,
    #[serde(rename = "lockTime")]
    lock_time: u32,
    #[serde(rename = "negotiationSequence")]
    negotiation_sequence: u32,
    #[serde(rename = "negotiationSellerAmount")]
    negotiation_seller_amount: u64,
    #[serde(rename = "negotiationArbiterAmount")]
    negotiation_arbiter_amount: u64,
    #[serde(rename = "paidArbiterSequence")]
    paid_arbiter_sequence: u32,
    #[serde(rename = "paidArbiterSellerAmount")]
    paid_arbiter_seller_amount: u64,
    #[serde(rename = "paidArbiterAmount")]
    paid_arbiter_amount: u64,
    #[serde(rename = "proofSequence")]
    proof_sequence: u32,
    #[serde(rename = "proofSellerAmount")]
    proof_seller_amount: u64,
    #[serde(rename = "proofArbiterAmount")]
    proof_arbiter_amount: u64,
    #[serde(rename = "paymentProofHex")]
    payment_proof_hex: String,
}

fn private_public(key: &PrivateKey) -> PublicKey {
    let secret = k256::SecretKey::from_slice(&key.key).unwrap();
    use k256::elliptic_curve::sec1::ToEncodedPoint;
    PublicKey::new(
        secret
            .public_key()
            .to_encoded_point(true)
            .as_bytes()
            .to_vec(),
    )
}

fn main() {
    let fixture: Fixture = serde_json::from_str(
        &std::fs::read_to_string("testdata/arbitrated_pool_v4_fixture.json").unwrap(),
    )
    .unwrap();
    assert_eq!(fixture.protocol, PROTOCOL);
    assert_eq!(fixture.version, PROTOCOL_VERSION);
    let buyer = PrivateKey::new(hex::decode(fixture.buyer_priv_hex).unwrap());
    let seller = PrivateKey::new(hex::decode(fixture.seller_priv_hex).unwrap());
    let arbiter = PrivateKey::new(hex::decode(fixture.arbiter_priv_hex).unwrap());
    let roles = ArbitratedPoolRoles {
        buyer: private_public(&buyer),
        seller: private_public(&seller),
        arbiter: private_public(&arbiter),
    };
    let funding = build_arbitrated_pool_funding_tx(
        &fixture.buyer_utxos,
        fixture.pool_amount,
        &buyer,
        &roles,
        fixture.fee_rate,
    )
    .unwrap();
    let opening = build_arbitrated_pool_opening_state(
        &funding.tx,
        funding.pool_amount,
        roles.clone(),
        fixture.lock_time,
        fixture.fee_rate,
    )
    .unwrap();
    let lock = build_arbitrated_pool_lock(&roles).unwrap();
    let source = TransactionOutput::new(funding.pool_amount, lock.clone());
    let build = |previous: &Transaction, sequence, seller_amount, arbiter_amount, payment_proof| {
        build_arbitrated_pool_state(ArbitratedPoolStateInput {
            protocol: fixture.protocol.clone(),
            version: fixture.version,
            previous_state: previous.clone(),
            previous_source_output: source.clone(),
            sequence,
            lock_time: None,
            buyer_amount: None,
            seller_amount,
            arbiter_amount,
            pool_amount: funding.pool_amount,
            roles: roles.clone(),
            fee_rate: fixture.fee_rate,
            payment_proof,
        })
    };
    let negotiation = build(
        &opening,
        fixture.negotiation_sequence,
        fixture.negotiation_seller_amount,
        fixture.negotiation_arbiter_amount,
        None,
    )
    .unwrap();
    let paid_arbiter = build(
        &negotiation,
        fixture.paid_arbiter_sequence,
        fixture.paid_arbiter_seller_amount,
        fixture.paid_arbiter_amount,
        None,
    )
    .unwrap();
    let proof_state = build(
        &paid_arbiter,
        fixture.proof_sequence,
        fixture.proof_seller_amount,
        fixture.proof_arbiter_amount,
        Some(hex::decode(fixture.payment_proof_hex).unwrap()),
    )
    .unwrap();
    let buyer_signature =
        sign_arbitrated_pool_as_buyer(&paid_arbiter, funding.pool_amount, &roles, &buyer).unwrap();
    let seller_signature =
        sign_arbitrated_pool_as_seller(&paid_arbiter, funding.pool_amount, &roles, &seller)
            .unwrap();
    let arbiter_signature =
        sign_arbitrated_pool_as_arbiter(&paid_arbiter, funding.pool_amount, &roles, &arbiter)
            .unwrap();
    let final_buyer_seller = merge_arbitrated_pool_buyer_seller_signatures(
        &paid_arbiter,
        funding.pool_amount,
        &roles,
        &buyer_signature,
        &seller_signature,
    )
    .unwrap();
    let final_buyer_arbiter = merge_arbitrated_pool_buyer_arbiter_signatures(
        &paid_arbiter,
        funding.pool_amount,
        &roles,
        &buyer_signature,
        &arbiter_signature,
    )
    .unwrap();
    let final_seller_arbiter = merge_arbitrated_pool_seller_arbiter_signatures(
        &paid_arbiter,
        funding.pool_amount,
        &roles,
        &seller_signature,
        &arbiter_signature,
    )
    .unwrap();
    let values = [
        ("LockHex", hex::encode(lock)),
        ("FundingHex", funding.tx.to_hex().unwrap()),
        ("FundingTxID", funding.tx.txid().unwrap()),
        ("OpeningStateHex", opening.to_hex().unwrap()),
        ("OpeningStateTxID", opening.txid().unwrap()),
        ("NegotiationStateHex", negotiation.to_hex().unwrap()),
        ("NegotiationStateTxID", negotiation.txid().unwrap()),
        ("PaidArbiterStateHex", paid_arbiter.to_hex().unwrap()),
        ("PaidArbiterStateTxID", paid_arbiter.txid().unwrap()),
        ("ProofStateHex", proof_state.to_hex().unwrap()),
        ("ProofStateTxID", proof_state.txid().unwrap()),
        ("BuyerSignatureHex", hex::encode(buyer_signature)),
        ("SellerSignatureHex", hex::encode(seller_signature)),
        ("ArbiterSignatureHex", hex::encode(arbiter_signature)),
        ("FinalBuyerSellerHex", final_buyer_seller.to_hex().unwrap()),
        (
            "FinalBuyerArbiterHex",
            final_buyer_arbiter.to_hex().unwrap(),
        ),
        (
            "FinalSellerArbiterHex",
            final_seller_arbiter.to_hex().unwrap(),
        ),
    ];
    for (name, value) in values {
        println!("{name} {value}");
    }
}
