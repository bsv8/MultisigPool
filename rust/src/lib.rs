mod error;
mod types;
mod multisig;

pub use error::{MultisigError, Result};
pub use types::*;
pub use multisig::Multisig;

use wasm_bindgen::prelude::*;
use serde_wasm_bindgen as swbg;

#[wasm_bindgen]
pub fn create_multisig(
    private_keys: JsValue,
    public_keys: JsValue,
    m: usize,
) -> Result<MultisigWasm, JsValue> {
    let pub_keys: Vec<PublicKey> = swbg::from_value(public_keys)?;
    let priv_keys: Option<Vec<PrivateKey>> = swbg::from_value(private_keys).ok();

    let multisig = Multisig::new(priv_keys, pub_keys, m)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

    Ok(MultisigWasm { multisig })
}

#[wasm_bindgen]
pub fn create_locking_script(public_keys: JsValue, m: usize) -> Result<JsValue, JsValue> {
    let pub_keys: Vec<PublicKey> = swbg::from_value(public_keys)?;
    
    if m <= 0 || m > pub_keys.len() {
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
    ) -> Result<MultisigWasm, JsValue> {
        create_multisig(private_keys, public_keys, m)
    }

    pub fn lock(&self) -> Result<JsValue, JsValue> {
        let script = self.multisig.lock()
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(swbg::to_value(&script)?)
    }

    pub fn sign(&self, transaction: JsValue, input_index: usize) -> Result<JsValue, JsValue> {
        let tx: Transaction = swbg::from_value(transaction)?;
        let signatures = self.multisig.sign(&tx, input_index)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(swbg::to_value(&signatures)?)
    }

    pub fn sign_one(&self, transaction: JsValue, input_index: usize, private_key: JsValue) -> Result<JsValue, JsValue> {
        let tx: Transaction = swbg::from_value(transaction)?;
        let priv_key: PrivateKey = swbg::from_value(private_key)?;
        
        let signature = self.multisig.sign_one(&tx, input_index, &priv_key)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(swbg::to_value(&signature)?)
    }

    pub fn estimate_length(&self) -> usize {
        self.multisig.estimate_length()
    }

    pub fn create_fake_sign(&self) -> Result<JsValue, JsValue> {
        let script = self.multisig.create_fake_sign()
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(swbg::to_value(&script)?)
    }

    pub fn build_sign_script(&self, signatures: JsValue) -> Result<JsValue, JsValue> {
        let sigs: Vec<Vec<u8>> = swbg::from_value(signatures)?;
        let script = self.multisig.build_sign_script(&sigs)
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

#[wasm_bindgen(start)]
pub fn main() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn error(s: &str);
}
