use crate::error::{MultisigError, Result};
use crate::types::{encode_varint, PrivateKey, PublicKey, Transaction};
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
        if input_index >= tx.inputs.len() {
            return Err(MultisigError::TransactionError(
                "Input index out of bounds".to_string(),
            ));
        }
        let source = tx.inputs[input_index]
            .source_output
            .as_ref()
            .ok_or_else(|| {
                MultisigError::TransactionError("Source output is required".to_string())
            })?;
        let hash256 = |value: &[u8]| -> [u8; 32] {
            let first = Sha256::digest(value);
            Sha256::digest(first).into()
        };
        let mut prevouts = Vec::new();
        let mut sequences = Vec::new();
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
            sequences.extend_from_slice(&input.sequence.to_le_bytes());
        }
        let mut outputs = Vec::new();
        for output in &tx.outputs {
            outputs.extend_from_slice(&output.satoshis.to_le_bytes());
            outputs.extend(encode_varint(output.locking_script.len() as u64));
            outputs.extend(&output.locking_script);
        }
        let input = &tx.inputs[input_index];
        let mut outpoint_txid = hex::decode(&input.source_txid)
            .map_err(|_| MultisigError::TransactionError("Invalid source txid".to_string()))?;
        outpoint_txid.reverse();
        let mut preimage = Vec::new();
        preimage.extend_from_slice(&tx.version.to_le_bytes());
        preimage.extend(hash256(&prevouts));
        preimage.extend(hash256(&sequences));
        preimage.extend(outpoint_txid);
        preimage.extend_from_slice(&input.source_output_index.to_le_bytes());
        preimage.extend(encode_varint(source.locking_script.len() as u64));
        preimage.extend(&source.locking_script);
        preimage.extend_from_slice(&source.satoshis.to_le_bytes());
        preimage.extend_from_slice(&input.sequence.to_le_bytes());
        preimage.extend(hash256(&outputs));
        preimage.extend_from_slice(&tx.lock_time.to_le_bytes());
        preimage.extend_from_slice(&(self.sig_hash_type as u32).to_le_bytes());
        Ok(hash256(&preimage).to_vec())
    }

    fn generate_signature(&self, sighash: &[u8], private_key: &PrivateKey) -> Result<Vec<u8>> {
        // Convert private key bytes to SecretKey
        let secret_key = SecretKey::from_slice(&private_key.key)
            .map_err(|_| MultisigError::InvalidPrivateKey)?;

        let signing_key = SigningKey::from(secret_key);
        let mut signature: EcdsaSignature = signing_key
            .sign_prehash(sighash)
            .map_err(|_| MultisigError::SignatureError("Failed to create signature".to_string()))?;
        if let Some(normalized) = signature.normalize_s() {
            signature = normalized;
        }

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
            vec![TransactionInput {
                source_txid: "aa".repeat(32),
                source_output_index: 0,
                unlocking_script: Vec::new(),
                sequence: 1,
                source_output: Some(TransactionOutput::new(1000, vec![0x51])),
            }],
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
