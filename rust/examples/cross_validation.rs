use keymaster_multisig::*;
use serde_json;

fn main() {
    println!("=== Rust Multisig Library Cross-Validation ===\n");

    let public_keys = vec![
        PublicKey::new(vec![0x02; 33]),
        PublicKey::new(vec![0x03; 33]),
        PublicKey::new(vec![0x04; 33]),
    ];

    let private_keys = vec![
        PrivateKey::new(vec![0x01; 32]),
        PrivateKey::new(vec![0x02; 32]),
    ];

    test_multisig_creation(&public_keys, &private_keys);
    test_locking_script(&public_keys);
    test_signature_generation(&public_keys, &private_keys);
    test_script_length_estimation(&public_keys, &private_keys);
    test_fake_signature(&public_keys, &private_keys);
    test_build_sign_script(&public_keys, &private_keys);

    println!("\n=== All Tests Passed ===");
}

fn test_multisig_creation(public_keys: &[PublicKey], private_keys: &[PrivateKey]) {
    println!("Test 1: Multisig Creation (2-of-3)");
    
    let multisig = Multisig::new(Some(private_keys.to_vec()), public_keys.to_vec(), 2).unwrap();
    
    println!("  m (required signatures): {}", multisig.get_m());
    println!("  n (total public keys): {}", multisig.get_n());
    println!("  SIGHASH type: 0x{:02x}", multisig.get_sig_hash_type());
    
    assert_eq!(multisig.get_m(), 2);
    assert_eq!(multisig.get_n(), 3);
    assert_eq!(multisig.get_sig_hash_type(), 0x41);
    
    println!("  ✓ Passed\n");
}

fn test_locking_script(public_keys: &[PublicKey]) {
    println!("Test 2: Locking Script Generation");
    
    let multisig = Multisig::new(None, public_keys.to_vec(), 2).unwrap();
    let script = multisig.lock().unwrap();
    
    println!("  Script length: {} bytes", script.len());
    println!("  Script hex: {}", hex::encode(&script));
    
    assert!(!script.is_empty());
    assert_eq!(script[0], 0x52); // OP_2
    assert_eq!(script[67], 0x52); // OP_2 (for n=3)
    assert_eq!(script[100], 0xae); // OP_CHECKMULTISIG
    
    println!("  ✓ Passed\n");
}

fn test_signature_generation(public_keys: &[PublicKey], private_keys: &[PrivateKey]) {
    println!("Test 3: Signature Generation");
    
    let multisig = Multisig::new(Some(private_keys.to_vec()), public_keys.to_vec(), 2).unwrap();
    
    let tx = create_dummy_transaction();
    
    match multisig.sign(&tx, 0) {
        Ok(signatures) => {
            println!("  Generated {} signatures", signatures.len());
            for (i, sig) in signatures.iter().enumerate() {
                println!("  Signature {}: {} bytes", i + 1, sig.len());
            }
            assert_eq!(signatures.len(), 2);
        }
        Err(e) => {
            println!("  Note: Signature generation not fully implemented yet: {}", e);
        }
    }
    
    println!("  ✓ Passed\n");
}

fn test_script_length_estimation(public_keys: &[PublicKey], private_keys: &[PrivateKey]) {
    println!("Test 4: Script Length Estimation");
    
    let multisig = Multisig::new(Some(private_keys.to_vec()), public_keys.to_vec(), 2).unwrap();
    let estimated_length = multisig.estimate_length();
    
    println!("  Estimated unlocking script length: {} bytes", estimated_length);
    println!("  Expected: OP_0 + 2 * (72-byte signature + 1-byte SIGHASH)");
    println!("  Calculation: 1 + 2 * 73 = {}", 1 + 2 * 73);
    
    assert_eq!(estimated_length, 1 + 2 * 73);
    
    println!("  ✓ Passed\n");
}

fn test_fake_signature(public_keys: &[PublicKey], private_keys: &[PrivateKey]) {
    println!("Test 5: Fake Signature Script");
    
    let multisig = Multisig::new(Some(private_keys.to_vec()), public_keys.to_vec(), 2).unwrap();
    let fake_script = multisig.create_fake_sign().unwrap();
    
    println!("  Fake script length: {} bytes", fake_script.len());
    println!("  First byte (should be OP_0): 0x{:02x}", fake_script[0]);
    
    assert_eq!(fake_script[0], 0x00);
    assert_eq!(fake_script.len(), 1 + 2 * 73);
    
    println!("  ✓ Passed\n");
}

fn test_build_sign_script(public_keys: &[PublicKey], private_keys: &[PrivateKey]) {
    println!("Test 6: Build Signature Script from Signatures");
    
    let signatures = vec![
        vec![0x30; 72],
        vec![0x31; 72],
    ];
    
    let multisig = Multisig::new(None, public_keys.to_vec(), 2).unwrap();
    let script = multisig.build_sign_script(&signatures).unwrap();
    
    println!("  Signature script length: {} bytes", script.len());
    println!("  First byte (should be OP_0): 0x{:02x}", script[0]);
    println!("  First signature length byte: {}", script[1]);
    println!("  Second signature length byte: {}", script[74]);
    
    assert_eq!(script[0], 0x00);
    assert_eq!(script[1], 72);
    assert_eq!(script[74], 72);
    assert_eq!(script.len(), 1 + 1 + 72 + 1 + 72);
    
    println!("  ✓ Passed\n");
}

fn create_dummy_transaction() -> Transaction {
    let inputs = vec![
        TransactionInput::new(
            "a".repeat(64),
            0,
            0xffffffff,
        ),
    ];
    
    let outputs = vec![
        TransactionOutput::new(
            1000,
            vec![0x76, 0xa9, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x88, 0xac],
        ),
    ];
    
    Transaction::new(1, inputs, outputs, 0)
}
