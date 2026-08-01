use keymaster_multisig::*;
use serde_wasm_bindgen::{from_value, to_value};
use wasm_bindgen_test::*;

wasm_bindgen_test_configure!(run_in_node_experimental);

fn public_key(private_key: &PrivateKey) -> PublicKey {
    let secret = k256::SecretKey::from_slice(&private_key.key).unwrap();
    use k256::elliptic_curve::sec1::ToEncodedPoint;
    PublicKey::new(
        secret
            .public_key()
            .to_encoded_point(true)
            .as_bytes()
            .to_vec(),
    )
}

#[wasm_bindgen_test]
fn v4_wasm_exports_execute_the_complete_arbitrated_pool_flow() {
    let buyer = PrivateKey::new(vec![1; 32]);
    let seller = PrivateKey::new(vec![2; 32]);
    let arbiter = PrivateKey::new(vec![3; 32]);
    let roles = ArbitratedPoolRoles {
        buyer: public_key(&buyer),
        seller: public_key(&seller),
        arbiter: public_key(&arbiter),
    };
    let utxos = vec![Utxo {
        txid: "bb".repeat(32),
        vout: 0,
        satoshis: 30000,
    }];
    let funding_value = build_arbitrated_pool_funding_v4(
        to_value(&utxos).unwrap(),
        29000,
        to_value(&buyer).unwrap(),
        to_value(&roles).unwrap(),
        0,
    )
    .unwrap();
    let funding: FundingTxResult = from_value(funding_value).unwrap();
    assert_eq!(funding.fee, 0);
    let opening_value = build_arbitrated_pool_opening_state_v4(
        to_value(&funding.tx).unwrap(),
        funding.pool_amount,
        to_value(&roles).unwrap(),
        800000,
        0,
    )
    .unwrap();
    let opening: Transaction = from_value(opening_value).unwrap();
    let lock_value = build_arbitrated_pool_lock_v4(to_value(&roles).unwrap()).unwrap();
    let lock: Vec<u8> = from_value(lock_value).unwrap();
    let source = TransactionOutput::new(29000, lock);
    let input = ArbitratedPoolStateInput {
        protocol: PROTOCOL.to_string(),
        version: PROTOCOL_VERSION,
        previous_state: opening,
        previous_source_output: source,
        sequence: 3,
        lock_time: None,
        buyer_amount: None,
        seller_amount: 200,
        arbiter_amount: 100,
        pool_amount: 29000,
        roles: roles.clone(),
        fee_rate: 0,
        payment_proof: None,
    };
    let state_value = build_arbitrated_pool_state_v4(to_value(&input).unwrap()).unwrap();
    let state: Transaction = from_value(state_value.clone()).unwrap();
    let buyer_signature = sign_arbitrated_pool_as_buyer_v4(
        to_value(&state).unwrap(),
        29000,
        to_value(&roles).unwrap(),
        to_value(&buyer).unwrap(),
    )
    .unwrap();
    let seller_signature = sign_arbitrated_pool_as_seller_v4(
        to_value(&state).unwrap(),
        29000,
        to_value(&roles).unwrap(),
        to_value(&seller).unwrap(),
    )
    .unwrap();
    let arbiter_signature = sign_arbitrated_pool_as_arbiter_v4(
        to_value(&state).unwrap(),
        29000,
        to_value(&roles).unwrap(),
        to_value(&arbiter).unwrap(),
    )
    .unwrap();
    assert!(verify_arbitrated_pool_buyer_signature_v4(
        to_value(&state).unwrap(),
        29000,
        to_value(&roles).unwrap(),
        buyer_signature.clone(),
    )
    .unwrap());
    assert!(verify_arbitrated_pool_seller_signature_v4(
        to_value(&state).unwrap(),
        29000,
        to_value(&roles).unwrap(),
        seller_signature.clone(),
    )
    .unwrap());
    assert!(verify_arbitrated_pool_arbiter_signature_v4(
        to_value(&state).unwrap(),
        29000,
        to_value(&roles).unwrap(),
        arbiter_signature.clone(),
    )
    .unwrap());
    let buyer_seller = merge_arbitrated_pool_buyer_seller_signatures_v4(
        to_value(&state).unwrap(),
        29000,
        to_value(&roles).unwrap(),
        buyer_signature.clone(),
        seller_signature.clone(),
    )
    .unwrap();
    let merged: Transaction = from_value(buyer_seller).unwrap();
    assert!(!merged.inputs[0].unlocking_script.is_empty());
    merge_arbitrated_pool_buyer_arbiter_signatures_v4(
        to_value(&state).unwrap(),
        29000,
        to_value(&roles).unwrap(),
        buyer_signature.clone(),
        arbiter_signature.clone(),
    )
    .unwrap();
    merge_arbitrated_pool_seller_arbiter_signatures_v4(
        to_value(&state).unwrap(),
        29000,
        to_value(&roles).unwrap(),
        seller_signature,
        arbiter_signature,
    )
    .unwrap();
    build_arbitrated_pool_final_state_v4(to_value(&input).unwrap()).unwrap();
}
