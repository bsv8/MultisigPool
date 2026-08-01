pub mod arbitrated_pool;
mod error;
mod multisig;
mod types;
mod version;

pub use arbitrated_pool::*;
pub use error::{MultisigError, Result};
pub use multisig::Multisig;
pub use types::*;
pub use version::{PROTOCOL, PROTOCOL_VERSION, RELEASE_VERSION, VERSION};

use serde_wasm_bindgen as swbg;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn build_arbitrated_pool_lock_v4(roles: JsValue) -> std::result::Result<JsValue, JsValue> {
    let roles: ArbitratedPoolRoles = swbg::from_value(roles)?;
    let script = arbitrated_pool::build_arbitrated_pool_lock(&roles)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    Ok(swbg::to_value(&script)?)
}

#[wasm_bindgen]
pub fn build_arbitrated_pool_state_v4(input: JsValue) -> std::result::Result<JsValue, JsValue> {
    let input: ArbitratedPoolStateInput = swbg::from_value(input)?;
    let state = arbitrated_pool::build_arbitrated_pool_state(input)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    Ok(swbg::to_value(&state)?)
}

#[wasm_bindgen]
pub fn build_arbitrated_pool_funding_v4(
    utxos: JsValue,
    pool_amount: u64,
    buyer_private_key: JsValue,
    roles: JsValue,
    fee_rate: u64,
) -> std::result::Result<JsValue, JsValue> {
    let utxos: Vec<Utxo> = swbg::from_value(utxos)?;
    let buyer_private_key: PrivateKey = swbg::from_value(buyer_private_key)?;
    let roles: ArbitratedPoolRoles = swbg::from_value(roles)?;
    let result = arbitrated_pool::build_arbitrated_pool_funding_tx(
        &utxos,
        pool_amount,
        &buyer_private_key,
        &roles,
        fee_rate,
    )
    .map_err(|error| JsValue::from_str(&error.to_string()))?;
    Ok(swbg::to_value(&result)?)
}

#[wasm_bindgen]
pub fn build_arbitrated_pool_opening_state_v4(
    funding_tx: JsValue,
    pool_amount: u64,
    roles: JsValue,
    lock_time: u32,
    fee_rate: u64,
) -> std::result::Result<JsValue, JsValue> {
    let funding_tx: Transaction = swbg::from_value(funding_tx)?;
    let roles: ArbitratedPoolRoles = swbg::from_value(roles)?;
    let state = arbitrated_pool::build_arbitrated_pool_opening_state(
        &funding_tx,
        pool_amount,
        roles,
        lock_time,
        fee_rate,
    )
    .map_err(|error| JsValue::from_str(&error.to_string()))?;
    Ok(swbg::to_value(&state)?)
}

#[wasm_bindgen]
pub fn build_arbitrated_pool_final_state_v4(
    input: JsValue,
) -> std::result::Result<JsValue, JsValue> {
    let input: ArbitratedPoolStateInput = swbg::from_value(input)?;
    let state = arbitrated_pool::build_arbitrated_pool_final_state(input)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    Ok(swbg::to_value(&state)?)
}

fn wasm_sign_role(
    state: JsValue,
    pool_amount: u64,
    roles: JsValue,
    key: JsValue,
    sign: fn(&Transaction, u64, &ArbitratedPoolRoles, &PrivateKey) -> Result<Vec<u8>>,
) -> std::result::Result<JsValue, JsValue> {
    let state: Transaction = swbg::from_value(state)?;
    let roles: ArbitratedPoolRoles = swbg::from_value(roles)?;
    let key: PrivateKey = swbg::from_value(key)?;
    let signature = sign(&state, pool_amount, &roles, &key)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    Ok(swbg::to_value(&signature)?)
}

#[wasm_bindgen]
pub fn sign_arbitrated_pool_as_buyer_v4(
    state: JsValue,
    pool_amount: u64,
    roles: JsValue,
    key: JsValue,
) -> std::result::Result<JsValue, JsValue> {
    wasm_sign_role(
        state,
        pool_amount,
        roles,
        key,
        arbitrated_pool::sign_arbitrated_pool_as_buyer,
    )
}

#[wasm_bindgen]
pub fn sign_arbitrated_pool_as_seller_v4(
    state: JsValue,
    pool_amount: u64,
    roles: JsValue,
    key: JsValue,
) -> std::result::Result<JsValue, JsValue> {
    wasm_sign_role(
        state,
        pool_amount,
        roles,
        key,
        arbitrated_pool::sign_arbitrated_pool_as_seller,
    )
}

#[wasm_bindgen]
pub fn sign_arbitrated_pool_as_arbiter_v4(
    state: JsValue,
    pool_amount: u64,
    roles: JsValue,
    key: JsValue,
) -> std::result::Result<JsValue, JsValue> {
    wasm_sign_role(
        state,
        pool_amount,
        roles,
        key,
        arbitrated_pool::sign_arbitrated_pool_as_arbiter,
    )
}

fn wasm_verify_role(
    state: JsValue,
    pool_amount: u64,
    roles: JsValue,
    signature: JsValue,
    verify: fn(&Transaction, u64, &ArbitratedPoolRoles, &[u8]) -> Result<bool>,
) -> std::result::Result<bool, JsValue> {
    let state: Transaction = swbg::from_value(state)?;
    let roles: ArbitratedPoolRoles = swbg::from_value(roles)?;
    let signature: Vec<u8> = swbg::from_value(signature)?;
    verify(&state, pool_amount, &roles, &signature)
        .map_err(|error| JsValue::from_str(&error.to_string()))
}

#[wasm_bindgen]
pub fn verify_arbitrated_pool_buyer_signature_v4(
    state: JsValue,
    pool_amount: u64,
    roles: JsValue,
    signature: JsValue,
) -> std::result::Result<bool, JsValue> {
    wasm_verify_role(
        state,
        pool_amount,
        roles,
        signature,
        arbitrated_pool::verify_arbitrated_pool_buyer_signature,
    )
}

#[wasm_bindgen]
pub fn verify_arbitrated_pool_seller_signature_v4(
    state: JsValue,
    pool_amount: u64,
    roles: JsValue,
    signature: JsValue,
) -> std::result::Result<bool, JsValue> {
    wasm_verify_role(
        state,
        pool_amount,
        roles,
        signature,
        arbitrated_pool::verify_arbitrated_pool_seller_signature,
    )
}

#[wasm_bindgen]
pub fn verify_arbitrated_pool_arbiter_signature_v4(
    state: JsValue,
    pool_amount: u64,
    roles: JsValue,
    signature: JsValue,
) -> std::result::Result<bool, JsValue> {
    wasm_verify_role(
        state,
        pool_amount,
        roles,
        signature,
        arbitrated_pool::verify_arbitrated_pool_arbiter_signature,
    )
}

type ArbitratedPoolMerge =
    fn(&Transaction, u64, &ArbitratedPoolRoles, &[u8], &[u8]) -> Result<Transaction>;

fn wasm_merge(
    state: JsValue,
    pool_amount: u64,
    roles: JsValue,
    first: JsValue,
    second: JsValue,
    merge: ArbitratedPoolMerge,
) -> std::result::Result<JsValue, JsValue> {
    let state: Transaction = swbg::from_value(state)?;
    let roles: ArbitratedPoolRoles = swbg::from_value(roles)?;
    let first: Vec<u8> = swbg::from_value(first)?;
    let second: Vec<u8> = swbg::from_value(second)?;
    let merged = merge(&state, pool_amount, &roles, &first, &second)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    Ok(swbg::to_value(&merged)?)
}

#[wasm_bindgen]
pub fn merge_arbitrated_pool_buyer_seller_signatures_v4(
    state: JsValue,
    pool_amount: u64,
    roles: JsValue,
    buyer: JsValue,
    seller: JsValue,
) -> std::result::Result<JsValue, JsValue> {
    wasm_merge(
        state,
        pool_amount,
        roles,
        buyer,
        seller,
        arbitrated_pool::merge_arbitrated_pool_buyer_seller_signatures,
    )
}

#[wasm_bindgen]
pub fn merge_arbitrated_pool_buyer_arbiter_signatures_v4(
    state: JsValue,
    pool_amount: u64,
    roles: JsValue,
    buyer: JsValue,
    arbiter: JsValue,
) -> std::result::Result<JsValue, JsValue> {
    wasm_merge(
        state,
        pool_amount,
        roles,
        buyer,
        arbiter,
        arbitrated_pool::merge_arbitrated_pool_buyer_arbiter_signatures,
    )
}

#[wasm_bindgen]
pub fn merge_arbitrated_pool_seller_arbiter_signatures_v4(
    state: JsValue,
    pool_amount: u64,
    roles: JsValue,
    seller: JsValue,
    arbiter: JsValue,
) -> std::result::Result<JsValue, JsValue> {
    wasm_merge(
        state,
        pool_amount,
        roles,
        seller,
        arbiter,
        arbitrated_pool::merge_arbitrated_pool_seller_arbiter_signatures,
    )
}

#[wasm_bindgen]
pub fn create_multisig(
    private_keys: JsValue,
    public_keys: JsValue,
    m: usize,
) -> std::result::Result<MultisigWasm, JsValue> {
    let pub_keys: Vec<PublicKey> = swbg::from_value(public_keys)?;
    let priv_keys: Option<Vec<PrivateKey>> = swbg::from_value(private_keys).ok();

    let multisig =
        Multisig::new(priv_keys, pub_keys, m).map_err(|e| JsValue::from_str(&e.to_string()))?;

    Ok(MultisigWasm { multisig })
}

#[wasm_bindgen]
pub fn create_locking_script(
    public_keys: JsValue,
    m: usize,
) -> std::result::Result<JsValue, JsValue> {
    let pub_keys: Vec<PublicKey> = swbg::from_value(public_keys)?;

    if m == 0 || m > pub_keys.len() {
        return Err(JsValue::from_str("Invalid m value"));
    }
    if pub_keys.is_empty() || pub_keys.len() > 20 {
        return Err(JsValue::from_str("Invalid public keys"));
    }

    let mut script = vec![0x01 + (m as u8) - 1];

    for pub_key in &pub_keys {
        script.push(pub_key.key.len() as u8);
        script.extend(&pub_key.key);
    }

    script.push(0x01 + (pub_keys.len() as u8) - 1);
    script.push(0xae);

    Ok(swbg::to_value(&script)?)
}

#[wasm_bindgen]
pub fn estimate_multisig_length(m: usize) -> usize {
    1 + m * (71 + 1)
}

#[wasm_bindgen]
pub struct MultisigWasm {
    multisig: Multisig,
}

#[wasm_bindgen]
impl MultisigWasm {
    #[wasm_bindgen(constructor)]
    pub fn new(
        private_keys: JsValue,
        public_keys: JsValue,
        m: usize,
    ) -> std::result::Result<MultisigWasm, JsValue> {
        create_multisig(private_keys, public_keys, m)
    }

    pub fn lock(&self) -> std::result::Result<JsValue, JsValue> {
        let script = self
            .multisig
            .lock()
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(swbg::to_value(&script)?)
    }

    pub fn sign(
        &self,
        transaction: JsValue,
        input_index: usize,
    ) -> std::result::Result<JsValue, JsValue> {
        let tx: Transaction = swbg::from_value(transaction)?;
        let signatures = self
            .multisig
            .sign(&tx, input_index)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(swbg::to_value(&signatures)?)
    }

    pub fn sign_one(
        &self,
        transaction: JsValue,
        input_index: usize,
        private_key: JsValue,
    ) -> std::result::Result<JsValue, JsValue> {
        let tx: Transaction = swbg::from_value(transaction)?;
        let priv_key: PrivateKey = swbg::from_value(private_key)?;

        let signature = self
            .multisig
            .sign_one(&tx, input_index, &priv_key)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(swbg::to_value(&signature)?)
    }

    pub fn estimate_length(&self) -> usize {
        self.multisig.estimate_length()
    }

    pub fn create_fake_sign(&self) -> std::result::Result<JsValue, JsValue> {
        let script = self
            .multisig
            .create_fake_sign()
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(swbg::to_value(&script)?)
    }

    pub fn build_sign_script(&self, signatures: JsValue) -> std::result::Result<JsValue, JsValue> {
        let sigs: Vec<Vec<u8>> = swbg::from_value(signatures)?;
        let script = self
            .multisig
            .build_sign_script(&sigs)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(swbg::to_value(&script)?)
    }

    pub fn get_m(&self) -> usize {
        self.multisig.get_m()
    }

    pub fn get_n(&self) -> usize {
        self.multisig.get_n()
    }

    pub fn get_sig_hash_type(&self) -> u8 {
        self.multisig.get_sig_hash_type()
    }
}

#[cfg(not(feature = "wasm-test"))]
#[wasm_bindgen(start)]
pub fn main() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn error(s: &str);
}
