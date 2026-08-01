use crate::error::{MultisigError, Result};
use crate::types::{
    encode_varint, PrivateKey, PublicKey, Transaction, TransactionInput, TransactionOutput, Utxo,
};
use k256::ecdsa::{
    signature::hazmat::{PrehashSigner, PrehashVerifier},
    Signature as EcdsaSignature, SigningKey, VerifyingKey,
};
use k256::elliptic_curve::sec1::ToEncodedPoint;
use ripemd::Ripemd160;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const SIGHASH_ALL_FORKID: u8 = 0x41;
const OP_CHECKMULTISIG: u8 = 0xae;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArbitratedPoolRoles {
    pub buyer: PublicKey,
    pub seller: PublicKey,
    pub arbiter: PublicKey,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArbitratedPoolStateInput {
    pub protocol: String,
    pub version: u32,
    pub previous_state: Transaction,
    pub previous_source_output: TransactionOutput,
    pub sequence: u32,
    pub lock_time: Option<u32>,
    pub buyer_amount: Option<u64>,
    pub seller_amount: u64,
    pub arbiter_amount: u64,
    pub pool_amount: u64,
    pub roles: ArbitratedPoolRoles,
    pub fee_rate: u64,
    pub payment_proof: Option<Vec<u8>>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct FundingTxResult {
    pub tx: Transaction,
    pub pool_amount: u64,
    pub pool_output_index: u32,
    pub fee: u64,
}

fn hash256(bytes: &[u8]) -> [u8; 32] {
    let first = Sha256::digest(bytes);
    let second = Sha256::digest(first);
    second.into()
}

fn hash160(bytes: &[u8]) -> [u8; 20] {
    let sha = Sha256::digest(bytes);
    Ripemd160::digest(sha).into()
}

fn push_data(data: &[u8]) -> Vec<u8> {
    let mut result = Vec::new();
    if data.len() < 76 {
        result.push(data.len() as u8);
    } else if data.len() <= 0xff {
        result.extend([0x4c, data.len() as u8]);
    } else if data.len() <= 0xffff {
        result.push(0x4d);
        result.extend_from_slice(&(data.len() as u16).to_le_bytes());
    } else {
        result.push(0x4e);
        result.extend_from_slice(&(data.len() as u32).to_le_bytes());
    }
    result.extend(data);
    result
}

fn p2pkh(key: &PublicKey) -> Result<Vec<u8>> {
    validate_public_key(key)?;
    let hash = hash160(&key.key);
    let mut script = vec![0x76, 0xa9, 0x14];
    script.extend(hash);
    script.extend([0x88, 0xac]);
    Ok(script)
}

fn validate_public_key(key: &PublicKey) -> Result<()> {
    if key.key.len() != 33
        || (key.key[0] != 0x02 && key.key[0] != 0x03)
        || VerifyingKey::from_sec1_bytes(&key.key).is_err()
    {
        return Err(MultisigError::InvalidPublicKeys);
    }
    Ok(())
}

fn validate_roles(roles: &ArbitratedPoolRoles) -> Result<()> {
    validate_public_key(&roles.buyer)?;
    validate_public_key(&roles.seller)?;
    validate_public_key(&roles.arbiter)?;
    if roles.buyer == roles.seller || roles.buyer == roles.arbiter || roles.seller == roles.arbiter
    {
        return Err(MultisigError::TransactionError(
            "Buyer, seller and arbiter public keys must be different".to_string(),
        ));
    }
    Ok(())
}

pub fn build_arbitrated_pool_lock(roles: &ArbitratedPoolRoles) -> Result<Vec<u8>> {
    validate_roles(roles)?;
    let mut script = vec![0x52];
    for key in [&roles.buyer, &roles.seller, &roles.arbiter] {
        script.extend(push_data(&key.key));
    }
    script.extend([0x53, OP_CHECKMULTISIG]);
    Ok(script)
}

fn output_scripts(roles: &ArbitratedPoolRoles) -> Result<(Vec<u8>, Vec<u8>, Vec<u8>)> {
    Ok((
        p2pkh(&roles.buyer)?,
        p2pkh(&roles.seller)?,
        p2pkh(&roles.arbiter)?,
    ))
}

fn valid_payment_proof(script: &[u8]) -> bool {
    if script.len() < 3 || script[0] != 0 || script[1] != 0x6a {
        return false;
    }
    let (length, offset) = match script[2] {
        1..=75 => (script[2] as usize, 3usize),
        0x4c if script.len() >= 4 => (script[3] as usize, 4usize),
        0x4d if script.len() >= 5 => (u16::from_le_bytes([script[3], script[4]]) as usize, 5usize),
        0x4e if script.len() >= 7 => (
            u32::from_le_bytes([script[3], script[4], script[5], script[6]]) as usize,
            7usize,
        ),
        _ => return false,
    };
    length > 0 && offset.checked_add(length) == Some(script.len())
}

fn validate_state_outputs(tx: &Transaction, roles: &ArbitratedPoolRoles) -> Result<()> {
    let (buyer, seller, arbiter) = output_scripts(roles)?;
    if tx.outputs.len() != 3 && tx.outputs.len() != 4 {
        return Err(MultisigError::TransactionError(
            "Arbitrated pool state must have exactly three or four outputs".to_string(),
        ));
    }
    for (index, expected) in [buyer, seller, arbiter].iter().enumerate() {
        if tx.outputs[index].locking_script != *expected {
            return Err(MultisigError::TransactionError(format!(
                "Arbitrated pool output {index} does not match its role"
            )));
        }
    }
    if tx.outputs.len() == 4
        && (tx.outputs[3].satoshis != 0 || !valid_payment_proof(&tx.outputs[3].locking_script))
    {
        return Err(MultisigError::TransactionError(
            "Invalid payment proof output".to_string(),
        ));
    }
    Ok(())
}

fn hash_prevouts(tx: &Transaction) -> Result<[u8; 32]> {
    let mut prevouts = Vec::new();
    for input in &tx.inputs {
        let mut txid = hex::decode(&input.source_txid)
            .map_err(|_| MultisigError::TransactionError("Invalid source txid".to_string()))?;
        if txid.len() != 32 {
            return Err(MultisigError::TransactionError(
                "Invalid source txid length".to_string(),
            ));
        }
        txid.reverse();
        prevouts.extend(txid);
        prevouts.extend_from_slice(&input.source_output_index.to_le_bytes());
    }
    Ok(hash256(&prevouts))
}

fn hash_sequences(tx: &Transaction) -> [u8; 32] {
    let mut sequences = Vec::new();
    for input in &tx.inputs {
        sequences.extend_from_slice(&input.sequence.to_le_bytes());
    }
    hash256(&sequences)
}

fn hash_outputs(tx: &Transaction) -> [u8; 32] {
    let mut outputs = Vec::new();
    for output in &tx.outputs {
        outputs.extend_from_slice(&output.satoshis.to_le_bytes());
        outputs.extend(encode_varint(output.locking_script.len() as u64));
        outputs.extend(&output.locking_script);
    }
    hash256(&outputs)
}

fn signature_hash(
    tx: &Transaction,
    input_index: usize,
    source: &TransactionOutput,
) -> Result<[u8; 32]> {
    if input_index >= tx.inputs.len() {
        return Err(MultisigError::TransactionError(
            "Input index out of bounds".to_string(),
        ));
    }
    let input = &tx.inputs[input_index];
    let mut outpoint_txid = hex::decode(&input.source_txid)
        .map_err(|_| MultisigError::TransactionError("Invalid source txid".to_string()))?;
    if outpoint_txid.len() != 32 {
        return Err(MultisigError::TransactionError(
            "Invalid source txid length".to_string(),
        ));
    }
    outpoint_txid.reverse();
    let mut preimage = Vec::new();
    preimage.extend_from_slice(&tx.version.to_le_bytes());
    preimage.extend(hash_prevouts(tx)?);
    preimage.extend(hash_sequences(tx));
    preimage.extend(outpoint_txid);
    preimage.extend_from_slice(&input.source_output_index.to_le_bytes());
    preimage.extend(encode_varint(source.locking_script.len() as u64));
    preimage.extend(&source.locking_script);
    preimage.extend_from_slice(&source.satoshis.to_le_bytes());
    preimage.extend_from_slice(&input.sequence.to_le_bytes());
    preimage.extend(hash_outputs(tx));
    preimage.extend_from_slice(&tx.lock_time.to_le_bytes());
    preimage.extend_from_slice(&(SIGHASH_ALL_FORKID as u32).to_le_bytes());
    Ok(hash256(&preimage))
}

fn private_key_public(key: &PrivateKey) -> Result<PublicKey> {
    let secret =
        k256::SecretKey::from_slice(&key.key).map_err(|_| MultisigError::InvalidPrivateKey)?;
    Ok(PublicKey {
        key: secret
            .public_key()
            .to_encoded_point(true)
            .as_bytes()
            .to_vec(),
    })
}

fn sign_hash(hash: &[u8; 32], key: &PrivateKey) -> Result<Vec<u8>> {
    let secret =
        k256::SecretKey::from_slice(&key.key).map_err(|_| MultisigError::InvalidPrivateKey)?;
    let signing_key = SigningKey::from(secret);
    let mut signature: EcdsaSignature = signing_key
        .sign_prehash(hash)
        .map_err(|_| MultisigError::SignatureError("Failed to create signature".to_string()))?;
    if let Some(normalized) = signature.normalize_s() {
        signature = normalized;
    }
    let mut result = signature.to_der().as_bytes().to_vec();
    result.push(SIGHASH_ALL_FORKID);
    Ok(result)
}

fn state_source(
    state: &Transaction,
    pool_amount: u64,
    roles: &ArbitratedPoolRoles,
) -> Result<TransactionOutput> {
    let source = state
        .inputs
        .first()
        .and_then(|input| input.source_output.clone())
        .ok_or_else(|| {
            MultisigError::TransactionError("Previous state source output is required".to_string())
        })?;
    let lock = build_arbitrated_pool_lock(roles)?;
    if source.satoshis != pool_amount || source.locking_script != lock {
        return Err(MultisigError::TransactionError(
            "State source output does not match configured pool".to_string(),
        ));
    }
    Ok(source)
}

fn validate_unsigned_state(state: &Transaction, roles: &ArbitratedPoolRoles) -> Result<()> {
    validate_roles(roles)?;
    if state.inputs.len() != 1 {
        return Err(MultisigError::TransactionError(
            "Arbitrated pool state must have exactly one input".to_string(),
        ));
    }
    if !state.inputs[0].unlocking_script.is_empty() {
        return Err(MultisigError::TransactionError(
            "State must have an empty unlocking script".to_string(),
        ));
    }
    validate_state_outputs(state, roles)
}

pub fn build_arbitrated_pool_state(input: ArbitratedPoolStateInput) -> Result<Transaction> {
    if input.protocol != crate::version::PROTOCOL
        || input.version != crate::version::PROTOCOL_VERSION
    {
        return Err(MultisigError::TransactionError(format!(
            "Unsupported pool protocol: expected {} v{}",
            crate::version::PROTOCOL,
            crate::version::PROTOCOL_VERSION
        )));
    }
    if input.pool_amount == 0 {
        return Err(MultisigError::TransactionError(
            "Pool amount must be positive".to_string(),
        ));
    }
    if input
        .seller_amount
        .checked_add(input.arbiter_amount)
        .is_none()
    {
        return Err(MultisigError::TransactionError(
            "Allocated amount overflow".to_string(),
        ));
    }
    let allocated = input.seller_amount + input.arbiter_amount;
    if allocated > input.pool_amount {
        return Err(MultisigError::TransactionError(
            "Allocated amount exceeds pool amount".to_string(),
        ));
    }
    if input.previous_state.inputs.len() != 1 {
        return Err(MultisigError::TransactionError(
            "Arbitrated pool state must have exactly one input".to_string(),
        ));
    }
    if input.sequence <= input.previous_state.inputs[0].sequence {
        return Err(MultisigError::TransactionError(
            "Payment sequence must increase".to_string(),
        ));
    }
    validate_state_outputs(&input.previous_state, &input.roles)?;
    let configured_lock = build_arbitrated_pool_lock(&input.roles)?;
    if input.previous_source_output.satoshis != input.pool_amount
        || input.previous_source_output.locking_script != configured_lock
    {
        return Err(MultisigError::TransactionError(
            "Previous state source output does not match configured pool".to_string(),
        ));
    }
    let source = input.previous_state.inputs[0]
        .source_output
        .clone()
        .unwrap_or_else(|| input.previous_source_output.clone());
    if source != input.previous_source_output {
        return Err(MultisigError::TransactionError(
            "Previous state source output does not match configured pool".to_string(),
        ));
    }
    let (buyer, seller, arbiter) = output_scripts(&input.roles)?;
    let mut state = input.previous_state.clone();
    state.inputs[0].source_output = Some(source);
    state.outputs[0] = TransactionOutput {
        satoshis: input.pool_amount - allocated,
        locking_script: buyer,
    };
    state.outputs[1] = TransactionOutput {
        satoshis: input.seller_amount,
        locking_script: seller,
    };
    state.outputs[2] = TransactionOutput {
        satoshis: input.arbiter_amount,
        locking_script: arbiter,
    };
    state.inputs[0].sequence = input.sequence;
    if let Some(lock_time) = input.lock_time {
        state.lock_time = lock_time;
    }
    if let Some(proof) = input.payment_proof.filter(|value| !value.is_empty()) {
        let mut script = vec![0, 0x6a];
        script.extend(push_data(&proof));
        let output = TransactionOutput {
            satoshis: 0,
            locking_script: script,
        };
        if state.outputs.len() == 4 {
            state.outputs[3] = output;
        } else {
            state.outputs.push(output);
        }
    }
    state.inputs[0].unlocking_script = fake_unlocking_script();
    let size = state.serialize()?.len() as u64;
    let fee = if input.fee_rate == 0 {
        0
    } else {
        size.checked_mul(input.fee_rate)
            .and_then(|value| value.checked_add(999))
            .ok_or_else(|| {
                MultisigError::TransactionError("Transaction fee overflow".to_string())
            })?
            / 1000
    };
    if fee > state.outputs[0].satoshis {
        return Err(MultisigError::TransactionError(
            "Buyer balance is insufficient for fee".to_string(),
        ));
    }
    state.outputs[0].satoshis -= fee;
    if input
        .buyer_amount
        .is_some_and(|amount| amount != state.outputs[0].satoshis)
    {
        return Err(MultisigError::TransactionError(
            "Buyer amount does not match canonical fee".to_string(),
        ));
    }
    state.inputs[0].unlocking_script.clear();
    Ok(state)
}

pub fn build_arbitrated_pool_opening_state(
    funding_tx: &Transaction,
    pool_amount: u64,
    roles: ArbitratedPoolRoles,
    lock_time: u32,
    fee_rate: u64,
) -> Result<Transaction> {
    if funding_tx.outputs.is_empty() {
        return Err(MultisigError::TransactionError(
            "Funding transaction is required".to_string(),
        ));
    }
    let lock = build_arbitrated_pool_lock(&roles)?;
    if funding_tx.outputs[0].satoshis != pool_amount || funding_tx.outputs[0].locking_script != lock
    {
        return Err(MultisigError::TransactionError(
            "Funding pool output does not match configured pool".to_string(),
        ));
    }
    let (buyer, seller, arbiter) = output_scripts(&roles)?;
    let source = TransactionOutput {
        satoshis: pool_amount,
        locking_script: lock,
    };
    let previous = Transaction {
        version: 1,
        inputs: vec![TransactionInput {
            source_txid: funding_tx.txid()?,
            source_output_index: 0,
            unlocking_script: Vec::new(),
            sequence: 1,
            source_output: Some(source.clone()),
        }],
        outputs: vec![
            TransactionOutput {
                satoshis: pool_amount,
                locking_script: buyer,
            },
            TransactionOutput {
                satoshis: 0,
                locking_script: seller,
            },
            TransactionOutput {
                satoshis: 0,
                locking_script: arbiter,
            },
        ],
        lock_time,
    };
    build_arbitrated_pool_state(ArbitratedPoolStateInput {
        protocol: crate::version::PROTOCOL.to_string(),
        version: crate::version::PROTOCOL_VERSION,
        previous_state: previous.clone(),
        previous_source_output: source,
        sequence: 2,
        lock_time: Some(lock_time),
        buyer_amount: None,
        seller_amount: 0,
        arbiter_amount: 0,
        pool_amount,
        roles,
        fee_rate,
        payment_proof: None,
    })
}

pub fn build_arbitrated_pool_final_state(input: ArbitratedPoolStateInput) -> Result<Transaction> {
    build_arbitrated_pool_state(input)
}

pub fn sign_arbitrated_pool_as_buyer(
    state: &Transaction,
    pool_amount: u64,
    roles: &ArbitratedPoolRoles,
    key: &PrivateKey,
) -> Result<Vec<u8>> {
    sign_role(state, pool_amount, roles, key, &roles.buyer)
}
pub fn sign_arbitrated_pool_as_seller(
    state: &Transaction,
    pool_amount: u64,
    roles: &ArbitratedPoolRoles,
    key: &PrivateKey,
) -> Result<Vec<u8>> {
    sign_role(state, pool_amount, roles, key, &roles.seller)
}
pub fn sign_arbitrated_pool_as_arbiter(
    state: &Transaction,
    pool_amount: u64,
    roles: &ArbitratedPoolRoles,
    key: &PrivateKey,
) -> Result<Vec<u8>> {
    sign_role(state, pool_amount, roles, key, &roles.arbiter)
}

fn sign_role(
    state: &Transaction,
    pool_amount: u64,
    roles: &ArbitratedPoolRoles,
    key: &PrivateKey,
    expected: &PublicKey,
) -> Result<Vec<u8>> {
    validate_unsigned_state(state, roles)?;
    if private_key_public(key)? != *expected {
        return Err(MultisigError::TransactionError(
            "Private key does not match declared role".to_string(),
        ));
    }
    let source = state_source(state, pool_amount, roles)?;
    sign_hash(&signature_hash(state, 0, &source)?, key)
}

fn verify_role(
    state: &Transaction,
    pool_amount: u64,
    roles: &ArbitratedPoolRoles,
    signature: &[u8],
    expected: &PublicKey,
) -> Result<bool> {
    validate_unsigned_state(state, roles)?;
    if signature.len() < 9 || *signature.last().unwrap() != SIGHASH_ALL_FORKID {
        return Err(MultisigError::SignatureError(
            "Invalid signature".to_string(),
        ));
    }
    let source = state_source(state, pool_amount, roles)?;
    let key = VerifyingKey::from_sec1_bytes(&expected.key)
        .map_err(|_| MultisigError::InvalidPublicKeys)?;
    let parsed = EcdsaSignature::from_der(&signature[..signature.len() - 1])
        .map_err(|_| MultisigError::SignatureError("Invalid DER signature".to_string()))?;
    key.verify_prehash(&signature_hash(state, 0, &source)?, &parsed)
        .map_err(|_| MultisigError::SignatureError("Signature verification failed".to_string()))?;
    Ok(true)
}

pub fn verify_arbitrated_pool_buyer_signature(
    state: &Transaction,
    pool_amount: u64,
    roles: &ArbitratedPoolRoles,
    signature: &[u8],
) -> Result<bool> {
    verify_role(state, pool_amount, roles, signature, &roles.buyer)
}
pub fn verify_arbitrated_pool_seller_signature(
    state: &Transaction,
    pool_amount: u64,
    roles: &ArbitratedPoolRoles,
    signature: &[u8],
) -> Result<bool> {
    verify_role(state, pool_amount, roles, signature, &roles.seller)
}
pub fn verify_arbitrated_pool_arbiter_signature(
    state: &Transaction,
    pool_amount: u64,
    roles: &ArbitratedPoolRoles,
    signature: &[u8],
) -> Result<bool> {
    verify_role(state, pool_amount, roles, signature, &roles.arbiter)
}

fn merge(
    state: &Transaction,
    pool_amount: u64,
    roles: &ArbitratedPoolRoles,
    first: &[u8],
    second: &[u8],
    first_key: &PublicKey,
    second_key: &PublicKey,
) -> Result<Transaction> {
    validate_unsigned_state(state, roles)?;
    if first == second {
        return Err(MultisigError::SignatureError(
            "Duplicate signatures are not permitted".to_string(),
        ));
    }
    verify_role(state, pool_amount, roles, first, first_key)?;
    verify_role(state, pool_amount, roles, second, second_key)?;
    let mut result = state.clone();
    let mut unlocking = vec![0];
    unlocking.extend(push_data(first));
    unlocking.extend(push_data(second));
    result.inputs[0].unlocking_script = unlocking;
    Ok(result)
}

pub fn merge_arbitrated_pool_buyer_seller_signatures(
    state: &Transaction,
    pool_amount: u64,
    roles: &ArbitratedPoolRoles,
    buyer: &[u8],
    seller: &[u8],
) -> Result<Transaction> {
    merge(
        state,
        pool_amount,
        roles,
        buyer,
        seller,
        &roles.buyer,
        &roles.seller,
    )
}
pub fn merge_arbitrated_pool_buyer_arbiter_signatures(
    state: &Transaction,
    pool_amount: u64,
    roles: &ArbitratedPoolRoles,
    buyer: &[u8],
    arbiter: &[u8],
) -> Result<Transaction> {
    merge(
        state,
        pool_amount,
        roles,
        buyer,
        arbiter,
        &roles.buyer,
        &roles.arbiter,
    )
}
pub fn merge_arbitrated_pool_seller_arbiter_signatures(
    state: &Transaction,
    pool_amount: u64,
    roles: &ArbitratedPoolRoles,
    seller: &[u8],
    arbiter: &[u8],
) -> Result<Transaction> {
    merge(
        state,
        pool_amount,
        roles,
        seller,
        arbiter,
        &roles.seller,
        &roles.arbiter,
    )
}

fn fake_unlocking_script() -> Vec<u8> {
    let mut script = vec![0];
    script.extend(push_data(&[0; 73]));
    script.extend(push_data(&[0; 73]));
    script
}

#[cfg(test)]
#[allow(clippy::items_after_test_module)]
mod tests {
    use super::*;
    use crate::{PROTOCOL, PROTOCOL_VERSION};

    fn setup() -> (
        PrivateKey,
        PrivateKey,
        PrivateKey,
        ArbitratedPoolRoles,
        Transaction,
    ) {
        let buyer = PrivateKey::new(vec![1; 32]);
        let seller = PrivateKey::new(vec![2; 32]);
        let arbiter = PrivateKey::new(vec![3; 32]);
        let roles = ArbitratedPoolRoles {
            buyer: private_key_public(&buyer).unwrap(),
            seller: private_key_public(&seller).unwrap(),
            arbiter: private_key_public(&arbiter).unwrap(),
        };
        let funding = build_arbitrated_pool_funding_tx(
            &[Utxo {
                txid: "bb".repeat(32),
                vout: 0,
                satoshis: 30000,
            }],
            29000,
            &buyer,
            &roles,
            0,
        )
        .unwrap();
        let opening = build_arbitrated_pool_opening_state(
            &funding.tx,
            funding.pool_amount,
            roles.clone(),
            800000,
            0,
        )
        .unwrap();
        (buyer, seller, arbiter, roles, opening)
    }

    fn fixture_paid_state() -> (Transaction, ArbitratedPoolRoles) {
        let buyer = PrivateKey::new(
            hex::decode("a682814ac246ca65543197e593aa3b2633b891959c183416f54e2c63a8de1d8c")
                .unwrap(),
        );
        let seller = PrivateKey::new(
            hex::decode("903b1b2c396f17203fa83444d72bf5c666119d9d681eb715520f99ae6f92322c")
                .unwrap(),
        );
        let arbiter = PrivateKey::new(
            hex::decode("a2d2ca4c19e3c560792ca751842c29b9da94be09f712a7f9ba7c66e64a354829")
                .unwrap(),
        );
        let roles = ArbitratedPoolRoles {
            buyer: private_key_public(&buyer).unwrap(),
            seller: private_key_public(&seller).unwrap(),
            arbiter: private_key_public(&arbiter).unwrap(),
        };
        let mut state = Transaction::from_hex("01000000013d4fa11aefde8f614b8d99c0e4d840c09f55fc8b0a2611befc10e5328cc847d2000000000004000000031b700000000000001976a914a8d0cb37061679d0523314d882d81b989254df7b88acc8000000000000001976a9147e06a09c32ea06e80745cbfae60036968b64238888ac64000000000000001976a914789d07c284ff3f6c41633e2031b375e57434759688ac00350c00").unwrap();
        state.inputs[0].source_output = Some(TransactionOutput::new(
            29000,
            build_arbitrated_pool_lock(&roles).unwrap(),
        ));
        (state, roles)
    }

    #[test]
    fn v4_raw_hex_roundtrip_and_bip143_component_vector_are_stable() {
        let (state, roles) = fixture_paid_state();
        let raw = state.to_hex().unwrap();
        assert_eq!(Transaction::from_hex(&raw).unwrap().to_hex().unwrap(), raw);
        let source = state.inputs[0].source_output.as_ref().unwrap();
        assert_eq!(
            hex::encode(hash_prevouts(&state).unwrap()),
            "e46a58d1738a4d5c782d6fa0fb0581de503076f15cda7b7c9c8d79ba75d1d2fb"
        );
        assert_eq!(
            hex::encode(hash_sequences(&state)),
            "a14e2895f7b9e1e7b37f82b38e345462a36edfa6dbce70939cc1bfc6a74ddd5e"
        );
        assert_eq!(
            hex::encode(hash_outputs(&state)),
            "761562e89b68d7cfee518e90c4cd2f1fce533cac59312184800322e22f11f51f"
        );
        assert_eq!(
            hex::encode(signature_hash(&state, 0, source).unwrap()),
            "7a1c6a0c0a9f541b2e1523c1f291d27573371fc553078ee450659fc88f198524"
        );
        let signature = sign_arbitrated_pool_as_buyer(
            &state,
            29000,
            &roles,
            &PrivateKey::new(
                hex::decode("a682814ac246ca65543197e593aa3b2633b891959c183416f54e2c63a8de1d8c")
                    .unwrap(),
            ),
        )
        .unwrap();
        assert!(verify_arbitrated_pool_buyer_signature(&state, 29000, &roles, &signature).unwrap());
    }

    #[test]
    fn v4_fee_zero_and_nonzero_arbiter_amounts_are_exact() {
        let (buyer, _seller, _arbiter, roles, opening) = setup();
        assert_eq!(opening.outputs[0].satoshis, 29000);
        let source = TransactionOutput::new(29000, build_arbitrated_pool_lock(&roles).unwrap());
        let paid = build_arbitrated_pool_state(ArbitratedPoolStateInput {
            protocol: PROTOCOL.to_string(),
            version: PROTOCOL_VERSION,
            previous_state: opening,
            previous_source_output: source.clone(),
            sequence: 3,
            lock_time: None,
            buyer_amount: None,
            seller_amount: 200,
            arbiter_amount: 100,
            pool_amount: 29000,
            roles: roles.clone(),
            fee_rate: 0,
            payment_proof: None,
        })
        .unwrap();
        assert_eq!(
            paid.outputs
                .iter()
                .map(|output| output.satoshis)
                .collect::<Vec<_>>(),
            vec![28700, 200, 100]
        );
        let with_proof = build_arbitrated_pool_state(ArbitratedPoolStateInput {
            protocol: PROTOCOL.to_string(),
            version: PROTOCOL_VERSION,
            previous_state: paid.clone(),
            previous_source_output: source.clone(),
            sequence: 4,
            lock_time: None,
            buyer_amount: None,
            seller_amount: 300,
            arbiter_amount: 200,
            pool_amount: 29000,
            roles: roles.clone(),
            fee_rate: 0,
            payment_proof: Some(vec![1, 2, 3]),
        })
        .unwrap();
        let preserved = build_arbitrated_pool_state(ArbitratedPoolStateInput {
            protocol: PROTOCOL.to_string(),
            version: PROTOCOL_VERSION,
            previous_state: with_proof.clone(),
            previous_source_output: source.clone(),
            sequence: 5,
            lock_time: None,
            buyer_amount: None,
            seller_amount: 300,
            arbiter_amount: 200,
            pool_amount: 29000,
            roles: roles.clone(),
            fee_rate: 0,
            payment_proof: None,
        })
        .unwrap();
        let replaced = build_arbitrated_pool_state(ArbitratedPoolStateInput {
            protocol: PROTOCOL.to_string(),
            version: PROTOCOL_VERSION,
            previous_state: with_proof.clone(),
            previous_source_output: source.clone(),
            sequence: 5,
            lock_time: None,
            buyer_amount: None,
            seller_amount: 300,
            arbiter_amount: 200,
            pool_amount: 29000,
            roles: roles.clone(),
            fee_rate: 0,
            payment_proof: Some(vec![4, 5, 6]),
        })
        .unwrap();
        assert_eq!(preserved.outputs[3], with_proof.outputs[3]);
        assert_ne!(replaced.outputs[3], with_proof.outputs[3]);
        let buyer_signature = sign_arbitrated_pool_as_buyer(&paid, 29000, &roles, &buyer).unwrap();
        let mut changed = paid.clone();
        changed.outputs[1].satoshis += 1;
        assert!(
            verify_arbitrated_pool_buyer_signature(&changed, 29000, &roles, &buyer_signature)
                .is_err()
        );
    }

    #[test]
    fn v4_sign_verify_and_merge_reject_noncanonical_boundaries() {
        let (buyer, seller, _arbiter, roles, state) = setup();
        let signature = sign_arbitrated_pool_as_buyer(&state, 29000, &roles, &buyer).unwrap();
        let mut multiple_inputs = state.clone();
        multiple_inputs
            .inputs
            .push(multiple_inputs.inputs[0].clone());
        assert!(sign_arbitrated_pool_as_buyer(&multiple_inputs, 29000, &roles, &buyer).is_err());
        let mut signed_input = state.clone();
        signed_input.inputs[0].unlocking_script = vec![0];
        assert!(
            verify_arbitrated_pool_buyer_signature(&signed_input, 29000, &roles, &signature)
                .is_err()
        );
        let mut missing_output = state.clone();
        missing_output.outputs.truncate(2);
        assert!(
            verify_arbitrated_pool_buyer_signature(&missing_output, 29000, &roles, &signature)
                .is_err()
        );
        let mut too_many_outputs = state.clone();
        too_many_outputs
            .outputs
            .push(too_many_outputs.outputs[0].clone());
        too_many_outputs
            .outputs
            .push(too_many_outputs.outputs[0].clone());
        assert!(verify_arbitrated_pool_buyer_signature(
            &too_many_outputs,
            29000,
            &roles,
            &signature
        )
        .is_err());
        assert!(merge_arbitrated_pool_buyer_seller_signatures(
            &state, 29000, &roles, &signature, &signature
        )
        .is_err());
        let source = TransactionOutput::new(29000, build_arbitrated_pool_lock(&roles).unwrap());
        let mut wrong_arbiter = state.clone();
        wrong_arbiter.outputs[2].locking_script = p2pkh(&roles.seller).unwrap();
        assert!(
            verify_arbitrated_pool_buyer_signature(&wrong_arbiter, 29000, &roles, &signature)
                .is_err()
        );
        let mut invalid_proof = state.clone();
        invalid_proof
            .outputs
            .push(TransactionOutput::new(0, vec![0, 0x6a, 1, 1]));
        invalid_proof.outputs[3].satoshis = 1;
        assert!(
            verify_arbitrated_pool_buyer_signature(&invalid_proof, 29000, &roles, &signature)
                .is_err()
        );
        assert!(build_arbitrated_pool_state(ArbitratedPoolStateInput {
            protocol: PROTOCOL.to_string(),
            version: PROTOCOL_VERSION,
            previous_state: state.clone(),
            previous_source_output: source.clone(),
            sequence: 3,
            lock_time: None,
            buyer_amount: None,
            seller_amount: 29000,
            arbiter_amount: 0,
            pool_amount: 29000,
            roles: roles.clone(),
            fee_rate: 1,
            payment_proof: None,
        })
        .is_err());
        assert!(build_arbitrated_pool_state(ArbitratedPoolStateInput {
            protocol: PROTOCOL.to_string(),
            version: PROTOCOL_VERSION,
            previous_state: state.clone(),
            previous_source_output: source.clone(),
            sequence: 3,
            lock_time: None,
            buyer_amount: None,
            seller_amount: 0,
            arbiter_amount: 0,
            pool_amount: 29000,
            roles: roles.clone(),
            fee_rate: u64::MAX,
            payment_proof: None,
        })
        .is_err());
        assert!(build_arbitrated_pool_state(ArbitratedPoolStateInput {
            protocol: PROTOCOL.to_string(),
            version: PROTOCOL_VERSION,
            previous_state: state.clone(),
            previous_source_output: source.clone(),
            sequence: 3,
            lock_time: None,
            buyer_amount: Some(0),
            seller_amount: 0,
            arbiter_amount: 0,
            pool_amount: 29000,
            roles: roles.clone(),
            fee_rate: 0,
            payment_proof: None,
        })
        .is_err());
        assert!(build_arbitrated_pool_state(ArbitratedPoolStateInput {
            protocol: PROTOCOL.to_string(),
            version: PROTOCOL_VERSION,
            previous_state: state,
            previous_source_output: source,
            sequence: 3,
            lock_time: None,
            buyer_amount: None,
            seller_amount: 1,
            arbiter_amount: u64::MAX,
            pool_amount: 29000,
            roles: roles.clone(),
            fee_rate: 0,
            payment_proof: None,
        })
        .is_err());
        assert_ne!(private_key_public(&seller).unwrap(), roles.buyer);
    }
}

pub fn build_arbitrated_pool_funding_tx(
    utxos: &[Utxo],
    pool_amount: u64,
    buyer_private_key: &PrivateKey,
    roles: &ArbitratedPoolRoles,
    fee_rate: u64,
) -> Result<FundingTxResult> {
    if utxos.is_empty() || pool_amount == 0 {
        return Err(MultisigError::TransactionError(
            "Buyer UTXOs and a positive pool amount are required".to_string(),
        ));
    }
    validate_roles(roles)?;
    if private_key_public(buyer_private_key)? != roles.buyer {
        return Err(MultisigError::TransactionError(
            "Private key does not match buyer public key".to_string(),
        ));
    }
    let source_script = p2pkh(&roles.buyer)?;
    let pool_script = build_arbitrated_pool_lock(roles)?;
    let total = utxos.iter().try_fold(0u64, |sum, utxo| {
        sum.checked_add(utxo.satoshis).ok_or_else(|| {
            MultisigError::TransactionError("Buyer UTXO total overflows".to_string())
        })
    })?;
    if total < pool_amount {
        return Err(MultisigError::TransactionError(
            "Buyer balance is insufficient for pool amount".to_string(),
        ));
    }
    let mut tx = Transaction {
        version: 1,
        inputs: utxos
            .iter()
            .map(|u| TransactionInput {
                source_txid: u.txid.clone(),
                source_output_index: u.vout,
                unlocking_script: Vec::new(),
                sequence: 0xffff_ffff,
                source_output: Some(TransactionOutput {
                    satoshis: u.satoshis,
                    locking_script: source_script.clone(),
                }),
            })
            .collect(),
        outputs: vec![
            TransactionOutput {
                satoshis: pool_amount,
                locking_script: pool_script,
            },
            TransactionOutput {
                satoshis: total - pool_amount,
                locking_script: source_script.clone(),
            },
        ],
        lock_time: 0,
    };
    for index in 0..tx.inputs.len() {
        let sig = sign_hash(
            &signature_hash(&tx, index, tx.inputs[index].source_output.as_ref().unwrap())?,
            buyer_private_key,
        )?;
        let key = private_key_public(buyer_private_key)?;
        tx.inputs[index].unlocking_script = push_data(&sig);
        tx.inputs[index]
            .unlocking_script
            .extend(push_data(&key.key));
    }
    let size = tx.serialize()?.len() as u64;
    let fee = if fee_rate == 0 {
        0
    } else {
        size.checked_mul(fee_rate)
            .and_then(|v| v.checked_add(999))
            .ok_or_else(|| {
                MultisigError::TransactionError("Transaction fee overflow".to_string())
            })?
            / 1000
    };
    if total
        < pool_amount.checked_add(fee).ok_or_else(|| {
            MultisigError::TransactionError(
                "Buyer balance is insufficient for pool amount and fee".to_string(),
            )
        })?
    {
        return Err(MultisigError::TransactionError(
            "Buyer balance is insufficient for pool amount and fee".to_string(),
        ));
    }
    tx.outputs[1].satoshis = total - pool_amount - fee;
    for index in 0..tx.inputs.len() {
        let sig = sign_hash(
            &signature_hash(&tx, index, tx.inputs[index].source_output.as_ref().unwrap())?,
            buyer_private_key,
        )?;
        let key = private_key_public(buyer_private_key)?;
        tx.inputs[index].unlocking_script = push_data(&sig);
        tx.inputs[index]
            .unlocking_script
            .extend(push_data(&key.key));
    }
    Ok(FundingTxResult {
        tx,
        pool_amount,
        pool_output_index: 0,
        fee,
    })
}
