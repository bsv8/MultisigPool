#[derive(Error, Debug)]
pub enum MultisigError {
    #[error("Invalid public keys")]
    InvalidPublicKeys,
    #[error("Private keys not supplied")]
    NoPrivateKeys,
    #[error("Invalid m value: {0}")]
    InvalidM(String),
    #[error("Empty previous transaction")]
    EmptyPreviousTx,
    #[error("Signature error: {0}")]
    SignatureError(String),
    #[error("Transaction error: {0}")]
    TransactionError(String),
    #[error("Serialization error: {0}")]
    SerializationError(String),
    #[error("Invalid private key")]
    InvalidPrivateKey,
}

impl From<MultisigError> for JsValue {
    fn from(error: MultisigError) -> Self {
        JsValue::from_str(&error.to_string())
    }
}

pub type Result<T> = std::result::Result<T, MultisigError>;
