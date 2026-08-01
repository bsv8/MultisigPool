use crate::error::{MultisigError, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct PublicKey {
    #[wasm_bindgen(skip)]
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
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct PrivateKey {
    #[wasm_bindgen(skip)]
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
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct TransactionOutput {
    pub satoshis: u64,
    #[wasm_bindgen(skip)]
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
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct TransactionInput {
    #[wasm_bindgen(skip)]
    pub source_txid: String,
    pub source_output_index: u32,
    #[wasm_bindgen(skip)]
    pub unlocking_script: Vec<u8>,
    pub sequence: u32,
    #[wasm_bindgen(skip)]
    pub source_output: Option<TransactionOutput>,
}

#[wasm_bindgen]
impl TransactionInput {
    #[wasm_bindgen(constructor)]
    pub fn new(source_txid: String, source_output_index: u32, sequence: u32) -> TransactionInput {
        TransactionInput {
            source_txid,
            source_output_index,
            unlocking_script: Vec::new(),
            sequence,
            source_output: None,
        }
    }
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Transaction {
    pub version: u32,
    #[wasm_bindgen(skip)]
    pub inputs: Vec<TransactionInput>,
    #[wasm_bindgen(skip)]
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

impl Transaction {
    pub fn serialize(&self) -> Result<Vec<u8>> {
        let mut result = Vec::new();
        result.extend_from_slice(&self.version.to_le_bytes());
        result.extend(encode_varint(self.inputs.len() as u64));
        for input in &self.inputs {
            let mut txid = hex::decode(&input.source_txid)
                .map_err(|_| MultisigError::TransactionError("Invalid source txid".to_string()))?;
            if txid.len() != 32 {
                return Err(MultisigError::TransactionError(
                    "Invalid source txid length".to_string(),
                ));
            }
            txid.reverse();
            result.extend(txid);
            result.extend_from_slice(&input.source_output_index.to_le_bytes());
            result.extend(encode_varint(input.unlocking_script.len() as u64));
            result.extend(&input.unlocking_script);
            result.extend_from_slice(&input.sequence.to_le_bytes());
        }
        result.extend(encode_varint(self.outputs.len() as u64));
        for output in &self.outputs {
            result.extend_from_slice(&output.satoshis.to_le_bytes());
            result.extend(encode_varint(output.locking_script.len() as u64));
            result.extend(&output.locking_script);
        }
        result.extend_from_slice(&self.lock_time.to_le_bytes());
        Ok(result)
    }

    pub fn to_hex(&self) -> Result<String> {
        Ok(hex::encode(self.serialize()?))
    }

    pub fn from_hex(value: &str) -> Result<Transaction> {
        let bytes = hex::decode(value).map_err(|_| {
            MultisigError::SerializationError("Invalid transaction hex".to_string())
        })?;
        let (transaction, offset) = Transaction::from_bytes(&bytes)?;
        if offset != bytes.len() {
            return Err(MultisigError::SerializationError(
                "Trailing transaction bytes".to_string(),
            ));
        }
        Ok(transaction)
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<(Transaction, usize)> {
        let mut cursor = Cursor { bytes, offset: 0 };
        let version = cursor.read_u32()?;
        let input_count = cursor.read_varint()? as usize;
        let mut inputs = Vec::with_capacity(input_count);
        for _ in 0..input_count {
            let mut txid = cursor.read_exact(32)?.to_vec();
            txid.reverse();
            let source_output_index = cursor.read_u32()?;
            let script_len = cursor.read_varint()? as usize;
            let unlocking_script = cursor.read_exact(script_len)?.to_vec();
            let sequence = cursor.read_u32()?;
            inputs.push(TransactionInput {
                source_txid: hex::encode(txid),
                source_output_index,
                unlocking_script,
                sequence,
                source_output: None,
            });
        }
        let output_count = cursor.read_varint()? as usize;
        let mut outputs = Vec::with_capacity(output_count);
        for _ in 0..output_count {
            let satoshis = cursor.read_u64()?;
            let script_len = cursor.read_varint()? as usize;
            let locking_script = cursor.read_exact(script_len)?.to_vec();
            outputs.push(TransactionOutput {
                satoshis,
                locking_script,
            });
        }
        let lock_time = cursor.read_u32()?;
        Ok((
            Transaction {
                version,
                inputs,
                outputs,
                lock_time,
            },
            cursor.offset,
        ))
    }

    pub fn txid(&self) -> Result<String> {
        let first = Sha256::digest(self.serialize()?);
        let second = Sha256::digest(first);
        Ok(hex::encode(
            second.iter().rev().copied().collect::<Vec<u8>>(),
        ))
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Utxo {
    pub txid: String,
    pub vout: u32,
    pub satoshis: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct MultisigConfig {
    pub public_keys: Vec<PublicKey>,
    pub m: usize,
    pub sig_hash_type: u8,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Signature {
    pub r: Vec<u8>,
    pub s: Vec<u8>,
    pub sighash_type: u8,
}

pub fn encode_varint(value: u64) -> Vec<u8> {
    match value {
        0..=0xfc => vec![value as u8],
        0xfd..=0xffff => {
            let mut v = vec![0xfd];
            v.extend_from_slice(&(value as u16).to_le_bytes());
            v
        }
        0x10000..=0xffff_ffff => {
            let mut v = vec![0xfe];
            v.extend_from_slice(&(value as u32).to_le_bytes());
            v
        }
        _ => {
            let mut v = vec![0xff];
            v.extend_from_slice(&value.to_le_bytes());
            v
        }
    }
}

struct Cursor<'a> {
    bytes: &'a [u8],
    offset: usize,
}
impl<'a> Cursor<'a> {
    fn read_exact(&mut self, length: usize) -> Result<&'a [u8]> {
        let end = self.offset.checked_add(length).ok_or_else(|| {
            MultisigError::SerializationError("Transaction length overflow".to_string())
        })?;
        if end > self.bytes.len() {
            return Err(MultisigError::SerializationError(
                "Unexpected end of transaction".to_string(),
            ));
        }
        let value = &self.bytes[self.offset..end];
        self.offset = end;
        Ok(value)
    }
    fn read_u32(&mut self) -> Result<u32> {
        Ok(u32::from_le_bytes(self.read_exact(4)?.try_into().unwrap()))
    }
    fn read_u64(&mut self) -> Result<u64> {
        Ok(u64::from_le_bytes(self.read_exact(8)?.try_into().unwrap()))
    }
    fn read_varint(&mut self) -> Result<u64> {
        let prefix = self.read_exact(1)?[0];
        match prefix {
            0xfd => Ok(u16::from_le_bytes(self.read_exact(2)?.try_into().unwrap()) as u64),
            0xfe => Ok(u32::from_le_bytes(self.read_exact(4)?.try_into().unwrap()) as u64),
            0xff => Ok(u64::from_le_bytes(self.read_exact(8)?.try_into().unwrap())),
            value => Ok(value as u64),
        }
    }
}
