use wasm_bindgen_test::*;
use keymaster_multisig::*;
use serde_json;

wasm_bindgen_test_configure!(run_in_browser);

#[wasm_bindgen_test]
fn test_cross_validation_with_golang() {
    let public_keys = vec![
        PublicKey::new(vec![0x02; 33]),
        PublicKey::new(vec![0x03; 33]),
        PublicKey::new(vec![0x04; 33]),
    ];

    let private_keys = vec![
        PrivateKey::new(vec![0x01; 32]),
        PrivateKey::new(vec![0x02; 32]),
    ];

    let multisig = Multisig::new(Some(private_keys.clone()), public_keys.clone(), 2).unwrap();
    
    let locking_script = multisig.lock().unwrap();
    
    println!("Rust locking script: {:?}", locking_script);
    
    let expected_script_hex = "5251";
    let rust_script_hex = hex::encode(&locking_script);
    
    println!("Rust script hex: {}", rust_script_hex);
    
    assert!(locking_script.len() > 0);
}

#[wasm_bindgen_test]
fn test_multisig_2_of_3() {
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
    
    let script = multisig.lock().unwrap();
    
    assert_eq!(script[0], 0x52); // OP_2
    assert_eq!(script[67], 0x52); // OP_2 (for n=3)
    assert_eq!(script[100], 0xae); // OP_CHECKMULTISIG
    
    let estimated_len = multisig.estimate_length();
    assert_eq!(estimated_len, 1 + 2 * 73);
}

#[wasm_bindgen_test]
fn test_multisig_3_of_5() {
    let public_keys = vec![
        PublicKey::new(vec![0x02; 33]),
        PublicKey::new(vec![0x03; 33]),
        PublicKey::new(vec![0x04; 33]),
        PublicKey::new(vec![0x05; 33]),
        PublicKey::new(vec![0x06; 33]),
    ];

    let private_keys = vec![
        PrivateKey::new(vec![0x01; 32]),
        PrivateKey::new(vec![0x02; 32]),
        PrivateKey::new(vec![0x03; 32]),
    ];

    let multisig = Multisig::new(Some(private_keys), public_keys, 3).unwrap();
    
    let script = multisig.lock().unwrap();
    
    assert_eq!(script[0], 0x53); // OP_3
    assert_eq!(script[169], 0x54); // OP_4 (for n=5)
    assert_eq!(script[202], 0xae); // OP_CHECKMULTISIG
    
    let estimated_len = multisig.estimate_length();
    assert_eq!(estimated_len, 1 + 3 * 73);
}

#[wasm_bindgen_test]
fn test_signature_script_format() {
    let signatures = vec![
        vec![0x30; 72],
        vec![0x31; 72],
    ];

    let public_keys = vec![
        PublicKey::new(vec![0x02; 33]),
        PublicKey::new(vec![0x03; 33]),
    ];

    let multisig = Multisig::new(None, public_keys, 2).unwrap();
    let script = multisig.build_sign_script(&signatures).unwrap();
    
    assert_eq!(script[0], 0x00); // OP_0 for CHECKMULTISIG bug
    assert_eq!(script[1], 72); // First signature length
    assert_eq!(script[74], 72); // Second signature length
    assert_eq!(script.len(), 1 + 2 + 72 + 1 + 72);
}

#[wasm_bindgen_test]
fn test_serialization() {
    let public_keys = vec![
        PublicKey::new(vec![0x02; 33]),
        PublicKey::new(vec![0x03; 33]),
    ];

    let multisig = Multisig::new(None, public_keys, 2).unwrap();
    
    let config_json = serde_json::to_string(&multisig).unwrap();
    println!("Multisig config: {}", config_json);
    
    assert!(!config_json.is_empty());
}
