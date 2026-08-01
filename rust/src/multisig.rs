use crate::error::{MultisigError, Result};
use crate::types::{PrivateKey, PublicKey, Transaction};
use k256::{
    ecdsa::{
        signature::{hazmat::PrehashSigner, SignatureEncoding},
        Signature as EcdsaSignature, SigningKey,
    },
    SecretKey,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const OP_0: u8 = 0x00;
const OP_CHECKMULTISIG: u8 = 0xae;
const SIGHASH_ALL_FORKID: u8 = 0x41;

/// Variable length integer encoding (Bitcoin style)
#[derive(Debug, Clone)]
struct VarInt(pub u64);

impl VarInt {
    pub fn serialize(&self) -> Vec<u8> {
        match self.0 {
            0x00..=0xFC => vec![self.0 as u8],
            0xFD..=0xFFFF => {
                let mut v = vec![0xFD];
                v.extend_from_slice(&(self.0 as u16).to_le_bytes());
                v
            }
            0x10000..=0xFFFFFFFF => {
                let mut v = vec![0xFE];
                v.extend_from_slice(&(self.0 as u32).to_le_bytes());
                v
            }
            _ => {
                let mut v = vec![0xFF];
                v.extend_from_slice(&self.0.to_le_bytes());
                v
            }
        }
    }
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Multisig {
    private_keys: Option<Vec<PrivateKey>>,
    public_keys: Vec<PublicKey>,
    m: usize,
    n: usize,
    sig_hash_type: u8,
}

impl Multisig {
    pub fn new(
        private_keys: Option<Vec<PrivateKey>>,
        public_keys: Vec<PublicKey>,
        m: usize,
    ) -> Result<Self> {
        if public_keys.is_empty() || public_keys.len() > 20 {
            return Err(MultisigError::InvalidPublicKeys);
        }

        if m == 0 || m > public_keys.len() {
            return Err(MultisigError::InvalidM(format!(
                "m={} must be between 1 and n={}",
                m,
                public_keys.len()
            )));
        }

        if let Some(ref keys) = private_keys {
            if keys.len() < m {
                return Err(MultisigError::NoPrivateKeys);
            }
        }

        let n = public_keys.len();
        Ok(Multisig {
            private_keys,
            public_keys,
            m,
            n,
            sig_hash_type: SIGHASH_ALL_FORKID,
        })
    }

    pub fn lock(&self) -> Result<Vec<u8>> {
        if self.m == 0 || self.m > self.n {
            return Err(MultisigError::InvalidM(format!(
                "m={} must be between 1 and n={}",
                self.m, self.n
            )));
        }
        if self.n == 0 || self.n > 20 {
            return Err(MultisigError::InvalidPublicKeys);
        }

        let mut script = Vec::new();

        script.push(0x01 + (self.m as u8) - 1);

        for pub_key in &self.public_keys {
            script.push(pub_key.key.len() as u8);
            script.extend(&pub_key.key);
        }

        script.push(0x01 + (self.n as u8) - 1);
        script.push(OP_CHECKMULTISIG);

        Ok(script)
    }

    pub fn sign(&self, tx: &Transaction, input_index: usize) -> Result<Vec<Vec<u8>>> {
        if let Some(ref priv_keys) = self.private_keys {
            if priv_keys.len() < self.m {
                return Err(MultisigError::NoPrivateKeys);
            }

            let mut signatures = Vec::new();

            for private_key in priv_keys.iter().take(self.m) {
                let sig = self.sign_one(tx, input_index, private_key)?;
                signatures.push(sig);
            }

            Ok(signatures)
        } else {
            Err(MultisigError::NoPrivateKeys)
        }
    }

    pub fn sign_one(
        &self,
        tx: &Transaction,
        input_index: usize,
        private_key: &PrivateKey,
    ) -> Result<Vec<u8>> {
        if input_index >= tx.inputs.len() {
            return Err(MultisigError::TransactionError(
                "Input index out of bounds".to_string(),
            ));
        }

        let sighash = self.calculate_signature_hash(tx, input_index)?;

        let signature = self.generate_signature(&sighash, private_key)?;

        Ok(signature)
    }

    fn calculate_signature_hash(&self, tx: &Transaction, input_index: usize) -> Result<Vec<u8>> {
        // Simplified signature hash calculation for Bitcoin SV
        let mut hash_input = Vec::new();
        hash_input.extend_from_slice(&tx.version.to_le_bytes());

        // Serialize inputs
        let inputs_count = VarInt(tx.inputs.len() as u64);
        hash_input.extend(inputs_count.serialize());

        for (i, input) in tx.inputs.iter().enumerate() {
            hash_input.extend_from_slice(
                &hex::decode(&input.source_txid).map_err(|_| {
                    MultisigError::TransactionError("Invalid source txid".to_string())
                })?,
            );
            hash_input.extend_from_slice(&input.source_output_index.to_le_bytes());

            if i == input_index {
                // For the input being signed, use empty unlocking script for SIGHASH calculation
                hash_input.extend(VarInt(0).serialize());
            } else {
                // For other inputs, use placeholder script
                hash_input.extend(VarInt(0).serialize());
            }

            hash_input.extend_from_slice(&input.sequence.to_le_bytes());
        }

        // Serialize outputs
        let outputs_count = VarInt(tx.outputs.len() as u64);
        hash_input.extend(outputs_count.serialize());

        for output in &tx.outputs {
            hash_input.extend_from_slice(&output.satoshis.to_le_bytes());
            let script_len = VarInt(output.locking_script.len() as u64);
            hash_input.extend(script_len.serialize());
            hash_input.extend(&output.locking_script);
        }

        hash_input.extend_from_slice(&tx.lock_time.to_le_bytes());
        hash_input.push(self.sig_hash_type);

        // Double SHA256 for Bitcoin
        let hash1 = Sha256::digest(&hash_input);
        let hash2 = Sha256::digest(hash1);
        Ok(hash2.to_vec())
    }

    fn generate_signature(&self, sighash: &[u8], private_key: &PrivateKey) -> Result<Vec<u8>> {
        // Convert private key bytes to SecretKey
        let secret_key = SecretKey::from_slice(&private_key.key)
            .map_err(|_| MultisigError::InvalidPrivateKey)?;

        let signing_key = SigningKey::from(secret_key);
        let signature: EcdsaSignature = signing_key
            .sign_prehash(sighash)
            .map_err(|_| MultisigError::SignatureError("Failed to create signature".to_string()))?;

        // Convert to DER format and add SIGHASH type
        let der_sig = signature.to_der();
        let mut sig_with_hash = der_sig.to_vec();
        sig_with_hash.push(self.sig_hash_type);

        Ok(sig_with_hash)
    }

    pub fn estimate_length(&self) -> usize {
        1 + self.m * (71 + 1)
    }

    pub fn create_fake_sign(&self) -> Result<Vec<u8>> {
        let mut script = vec![OP_0];

        for _ in 0..self.m {
            script.extend(vec![0u8; 72]);
            script.push(self.sig_hash_type);
        }

        Ok(script)
    }

    pub fn build_sign_script(&self, signatures: &[Vec<u8>]) -> Result<Vec<u8>> {
        let mut script = vec![OP_0];

        for sig in signatures {
            script.push(sig.len() as u8);
            script.extend(sig);
        }

        Ok(script)
    }

    pub fn get_m(&self) -> usize {
        self.m
    }

    pub fn get_n(&self) -> usize {
        self.n
    }

    pub fn get_sig_hash_type(&self) -> u8 {
        self.sig_hash_type
    }

    pub fn get_public_keys(&self) -> &[PublicKey] {
        &self.public_keys
    }
}

#[cfg(test)]
mod tests {
    use super::Multisig;
    use crate::types::{PrivateKey, PublicKey, Transaction, TransactionInput, TransactionOutput};

    #[test]
    fn supports_all_two_of_three_signature_pairs() {
        let public_keys = vec![
            PublicKey::new(vec![0x02; 33]),
            PublicKey::new(vec![0x03; 33]),
            PublicKey::new(vec![0x04; 33]),
        ];
        let transaction = Transaction::new(
            1,
            vec![TransactionInput::new("aa".repeat(32), 0, 1)],
            vec![TransactionOutput::new(1000, vec![0x51])],
            0,
        );
        let signer = Multisig::new(None, public_keys, 2).unwrap();
        let buyer = signer
            .sign_one(&transaction, 0, &PrivateKey::new(vec![1; 32]))
            .unwrap();
        let seller = signer
            .sign_one(&transaction, 0, &PrivateKey::new(vec![2; 32]))
            .unwrap();
        let arbiter = signer
            .sign_one(&transaction, 0, &PrivateKey::new(vec![3; 32]))
            .unwrap();

        let buyer_seller = signer
            .build_sign_script(&[buyer.clone(), seller.clone()])
            .unwrap();
        let buyer_arbiter = signer
            .build_sign_script(&[buyer.clone(), arbiter.clone()])
            .unwrap();
        let seller_arbiter = signer.build_sign_script(&[seller, arbiter]).unwrap();

        assert_eq!(buyer_seller[0], 0);
        assert_eq!(buyer_arbiter[0], 0);
        assert_eq!(seller_arbiter[0], 0);
        assert_ne!(buyer_seller, buyer_arbiter);
        assert_ne!(buyer_arbiter, seller_arbiter);
    }
}
