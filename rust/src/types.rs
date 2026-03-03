use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PublicKey {
    pub key: Vec<u8>,
}

#[wasm_bindgen]
impl PublicKey {
    #[wasm_bindgen(constructor)]
    pub fn new(key: Vec<u8>) -> PublicKey {
        PublicKey { key }
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        self.key.clone()
    }
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PrivateKey {
    pub key: Vec<u8>,
}

#[wasm_bindgen]
impl PrivateKey {
    #[wasm_bindgen(constructor)]
    pub fn new(key: Vec<u8>) -> PrivateKey {
        PrivateKey { key }
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        self.key.clone()
    }
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug)]
pub struct TransactionInput {
    pub source_txid: String,
    pub source_output_index: u32,
    pub sequence: u32,
}

#[wasm_bindgen]
impl TransactionInput {
    #[wasm_bindgen(constructor)]
    pub fn new(source_txid: String, source_output_index: u32, sequence: u32) -> TransactionInput {
        TransactionInput {
            source_txid,
            source_output_index,
            sequence,
        }
    }
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug)]
pub struct TransactionOutput {
    pub satoshis: u64,
    pub locking_script: Vec<u8>,
}

#[wasm_bindgen]
impl TransactionOutput {
    #[wasm_bindgen(constructor)]
    pub fn new(satoshis: u64, locking_script: Vec<u8>) -> TransactionOutput {
        TransactionOutput {
            satoshis,
            locking_script,
        }
    }
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug)]
pub struct Transaction {
    pub version: u32,
    pub inputs: Vec<TransactionInput>,
    pub outputs: Vec<TransactionOutput>,
    pub lock_time: u32,
}

#[wasm_bindgen]
impl Transaction {
    #[wasm_bindgen(constructor)]
    pub fn new(
        version: u32,
        inputs: Vec<TransactionInput>,
        outputs: Vec<TransactionOutput>,
        lock_time: u32,
    ) -> Transaction {
        Transaction {
            version,
            inputs,
            outputs,
            lock_time,
        }
    }
}

#[derive(Serialize, Deserialize, Debug)]
pub struct MultisigConfig {
    pub public_keys: Vec<PublicKey>,
    pub m: usize,
    pub sig_hash_type: u8,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Signature {
    pub r: Vec<u8>,
    pub s: Vec<u8>,
    pub sighash_type: u8,
}
