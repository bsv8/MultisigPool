use wasm_bindgen_test::*;
use keymaster_multisig::*;
use serde_json;

wasm_bindgen_test_configure!(run_in_browser);

#[wasm_bindgen_test]
fn test_create_multisig() {
    let public_keys = vec![
        PublicKey::new(vec![0x02; 33]),
        PublicKey::new(vec![0x03; 33]),
        PublicKey::new(vec![0x04; 33]),
    ];

    let private_keys = vec![
        PrivateKey::new(vec![0x01; 32]),
        PrivateKey::new(vec![0x02; 32]),
    ];

    let multisig = Multisig::new(Some(private_keys), public_keys, 2).unwrap();
    
    assert_eq!(multisig.get_m(), 2);
    assert_eq!(multisig.get_n(), 3);
    assert_eq!(multisig.get_sig_hash_type(), 0x41);
}

#[wasm_bindgen_test]
fn test_lock_script() {
    let public_keys = vec![
        PublicKey::new(vec![0x02; 33]),
        PublicKey::new(vec![0x03; 33]),
    ];

    let multisig = Multisig::new(None, public_keys, 2).unwrap();
    let script = multisig.lock().unwrap();
    
    // OP_2 (0x52) + pubkey1 length + pubkey1 + pubkey2 length + pubkey2 + OP_2 (0x52) + OP_CHECKMULTISIG (0xae)
    assert_eq!(script[0], 0x52); // OP_2
    assert_eq!(script[34], 0x52); // OP_2
    assert_eq!(script[67], 0xae); // OP_CHECKMULTISIG
}

#[wasm_bindgen_test]
fn test_estimate_length() {
    let public_keys = vec![
        PublicKey::new(vec![0x02; 33]),
        PublicKey::new(vec![0x03; 33]),
    ];

    let multisig = Multisig::new(None, public_keys, 2).unwrap();
    let length = multisig.estimate_length();
    
    // OP_0 + 2 * (72 bytes signature + 1 byte SIGHASH)
    assert_eq!(length, 1 + 2 * 73);
}

#[wasm_bindgen_test]
fn test_fake_sign() {
    let public_keys = vec![
        PublicKey::new(vec![0x02; 33]),
        PublicKey::new(vec![0x03; 33]),
    ];

    let private_keys = vec![
        PrivateKey::new(vec![0x01; 32]),
        PrivateKey::new(vec![0x02; 32]),
    ];

    let multisig = Multisig::new(Some(private_keys), public_keys, 2).unwrap();
    let script = multisig.create_fake_sign().unwrap();
    
    assert_eq!(script[0], 0x00); // OP_0
    assert_eq!(script.len(), 1 + 2 * 73); // OP_0 + 2 fake signatures
}

#[wasm_bindgen_test]
fn test_build_sign_script() {
    let signatures = vec![
        vec![0x01; 72],
        vec![0x02; 72],
    ];

    let public_keys = vec![
        PublicKey::new(vec![0x02; 33]),
        PublicKey::new(vec![0x03; 33]),
    ];

    let multisig = Multisig::new(None, public_keys, 2).unwrap();
    let script = multisig.build_sign_script(&signatures).unwrap();
    
    assert_eq!(script[0], 0x00); // OP_0
    assert_eq!(script[1], 72); // First signature length
    assert_eq!(script[74], 72); // Second signature length
}

#[wasm_bindgen_test]
fn test_invalid_m() {
    let public_keys = vec![
        PublicKey::new(vec![0x02; 33]),
        PublicKey::new(vec![0x03; 33]),
    ];

    // m > n should fail
    let result = Multisig::new(None, public_keys.clone(), 3);
    assert!(result.is_err());

    // m = 0 should fail
    let result = Multisig::new(None, public_keys, 0);
    assert!(result.is_err());
}

#[wasm_bindgen_test]
fn test_too_many_public_keys() {
    let mut public_keys = Vec::new();
    for i in 0..21 {
        public_keys.push(PublicKey::new(vec![i; 33]));
    }

    let result = Multisig::new(None, public_keys, 2);
    assert!(result.is_err());
}
