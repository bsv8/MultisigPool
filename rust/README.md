# Keymaster Multisig Rust Library

Rust implementation of the Keymaster Multisig library using bsv-wasm for cryptographic operations.

## Features

- **Multi-signature Support**: Create M-of-N multi-signature scripts
- **Script Generation**: Generate P2MS (Pay-to-Multi-Signature) locking scripts
- **Signature Creation**: Generate individual and combined signatures
- **Cross-Validation**: Compatible with TypeScript and Golang implementations
- **WASM Support**: Can be compiled to WebAssembly for browser usage

## Usage

### Basic Multisig Creation

```rust
use keymaster_multisig::*;

// Create public keys
let public_keys = vec![
    PublicKey::new(vec![0x02; 33]),
    PublicKey::new(vec![0x03; 33]),
    PublicKey::new(vec![0x04; 33]),
];

// Create private keys
let private_keys = vec![
    PrivateKey::new(vec![0x01; 32]),
    PrivateKey::new(vec![0x02; 32]),
];

// Create 2-of-3 multisig
let multisig = Multisig::new(
    Some(private_keys),
    public_keys,
    2
).unwrap();
```

### Generate Locking Script

```rust
// Generate the multi-signature locking script
let script = multisig.lock().unwrap();
println!("Locking script: {}", hex::encode(&script));
```

### Sign Transactions

```rust
// Create a transaction
let tx = Transaction::new(
    1,
    vec![TransactionInput::new("a".repeat(64), 0, 0xffffffff)],
    vec![TransactionOutput::new(1000, vec![...])],
    0,
);

// Sign the transaction
let signatures = multisig.sign(&tx, 0).unwrap();
```

### Generate Single Signature

```rust
let signature = multisig.sign_one(&tx, 0, &private_keys[0]).unwrap();
```

### Estimate Script Length

```rust
let estimated_length = multisig.estimate_length();
println!("Estimated unlocking script length: {} bytes", estimated_length);
```

### Build Signature Script

```rust
let signatures = vec![sig1, sig2];
let script = multisig.build_sign_script(&signatures).unwrap();
```

## WebAssembly Usage

The library can be compiled to WebAssembly for use in browsers:

```javascript
import init, { MultisigWasm, create_locking_script } from './pkg/keymaster_multisig.js';

await init();

const publicKeys = [
    new Uint8Array([0x02, 0x02, 0x02, ...]),
    new Uint8Array([0x03, 0x03, 0x03, ...]),
];

const privateKeys = [
    new Uint8Array([0x01, 0x01, 0x01, ...]),
    new Uint8Array([0x02, 0x02, 0x02, ...]),
];

const multisig = new MultisigWasm(privateKeys, publicKeys, 2);
const lockingScript = multisig.lock();
```

## Cross-Validation

This Rust implementation is designed to be fully compatible with the TypeScript and Golang implementations. The library produces identical outputs for:

- Locking scripts (P2MS format)
- Signature generation
- Script length estimation
- Signature script construction

### Running Cross-Validation Tests

```bash
cargo test cross_validation
```

## Building

### Native Rust

```bash
cargo build
```

### WebAssembly

```bash
wasm-pack build --target web
```

## Testing

Run all tests:

```bash
cargo test
```

Run specific test suites:

```bash
cargo test lib_test
cargo test cross_validation
```

## API Reference

### Multisig

The main struct for creating and managing multi-signature operations.

#### Constructor

```rust
Multisig::new(
    private_keys: Option<Vec<PrivateKey>>,
    public_keys: Vec<PublicKey>,
    m: usize
) -> Result<Self, MultisigError>
```

#### Methods

- `lock() -> Result<Vec<u8>, MultisigError>`: Generate locking script
- `sign(tx: &Transaction, input_index: usize) -> Result<Vec<Vec<u8>>, MultisigError>`: Sign transaction
- `sign_one(tx: &Transaction, input_index: usize, private_key: &PrivateKey) -> Result<Vec<u8>, MultisigError>`: Generate single signature
- `estimate_length() -> usize`: Estimate unlocking script length
- `create_fake_sign() -> Result<Vec<u8>, MultisigError>`: Create fake signature for estimation
- `build_sign_script(signatures: &[Vec<u8>]) -> Result<Vec<u8>, MultisigError>`: Build signature script
- `get_m() -> usize`: Get required signature count
- `get_n() -> usize`: Get total public key count
- `get_sig_hash_type() -> u8`: Get signature hash type

## Error Types

- `InvalidPublicKeys`: Invalid number of public keys
- `NoPrivateKeys`: Private keys not supplied when required
- `InvalidM`: Invalid m value (must be between 1 and n)
- `EmptyPreviousTx`: Previous transaction is empty
- `SignatureError`: Error during signature generation
- `TransactionError`: Invalid transaction data

## Dependencies

- `wasm-bindgen`: For WebAssembly support
- `serde`: For serialization/deserialization
- `serde-wasm-bindgen`: For WASM-specific serde integration
- `thiserror`: For error handling
- `hex`: For hexadecimal encoding/decoding

## License

MIT License

## Contributing

Contributions are welcome! Please ensure all tests pass before submitting pull requests.
