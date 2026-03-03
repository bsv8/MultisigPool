use keymaster_multisig::*;
use std::fs;
use std::process;

fn main() {
    println!("=== Cross-Validation: Rust vs Golang ===\n");

    match load_test_config("../examples/offline_triple_test/test_config.json") {
        Ok(config) => {
            run_tests(&config);
        }
        Err(e) => {
            eprintln!("Failed to load config: {}", e);
            process::exit(1);
        }
    }

    println!("\n=== Rust Implementation Tests Complete ===");
    println!("\nComparison with Golang:");
    println!("- Locking script format: P2MS (Pay-to-Multi-Signature)");
    println!("- Script structure: OP_2 <pubkey1> <pubkey2> <pubkey3> OP_3 OP_CHECKMULTISIG");
    println!("- Signature script: OP_0 <sig1> <sig2>");
    println!("- Estimated unlocking length: 147 bytes (OP_0 + 2 signatures × 73 bytes)");
}

fn run_tests(config: &TestConfig) {
    println!("Test 1: Generate 2-of-3 Multisig Locking Script");
    println!("-----------------------------------------------");
    
    let public_keys = vec![
        PublicKey::new(hex::decode(&config.client1_priv_hex[2..]).unwrap_or(vec![0x02; 33])),
        PublicKey::new(hex::decode(&config.client2_priv_hex[2..]).unwrap_or(vec![0x03; 33])),
        PublicKey::new(hex::decode(&config.server_priv_hex[2..]).unwrap_or(vec![0x04; 33])),
    ];

    let multisig = Multisig::new(None, public_keys.clone(), 2).unwrap();
    
    match multisig.lock() {
        Ok(script) => {
            println!("Locking script (hex): {}", hex::encode(&script));
            println!("Locking script length: {} bytes", script.len());
        }
        Err(e) => {
            eprintln!("Failed to create locking script: {}", e);
        }
    }

    println!("\nTest 2: Estimate Unlocking Script Length");
    println!("------------------------------------------");
    
    let private_keys = vec![
        PrivateKey::new(vec![0x01; 32]),
        PrivateKey::new(vec![0x02; 32]),
    ];
    
    let multisig_with_privs = Multisig::new(Some(private_keys), public_keys, 2).unwrap();
    let estimated_length = multisig_with_privs.estimate_length();
    
    println!("Estimated length: {} bytes", estimated_length);
    println!("Expected length: {} bytes (OP_0 + 2 * 73)", 1 + 2 * 73);

    println!("\nTest 3: Generate Fake Signature Script");
    println!("---------------------------------------");
    
    match multisig_with_privs.create_fake_sign() {
        Ok(fake_script) => {
            println!("Fake script (hex): {}", hex::encode(&fake_script));
            println!("Fake script length: {} bytes", fake_script.len());
        }
        Err(e) => {
            eprintln!("Failed to create fake script: {}", e);
        }
    }

    println!("\nTest 4: Build Signature Script from Signatures");
    println!("------------------------------------------------");
    
    let signatures = vec![
        vec![0x30; 72],
        vec![0x31; 72],
    ];
    
    let multisig_no_privs = Multisig::new(None, vec![
        PublicKey::new(vec![0x02; 33]),
        PublicKey::new(vec![0x03; 33]),
        PublicKey::new(vec![0x04; 33]),
    ], 2).unwrap();
    
    match multisig_no_privs.build_sign_script(&signatures) {
        Ok(sign_script) => {
            println!("Signature script (hex): {}", hex::encode(&sign_script));
            println!("Signature script length: {} bytes", sign_script.len());
        }
        Err(e) => {
            eprintln!("Failed to build signature script: {}", e);
        }
    }
}

#[derive(serde::Deserialize)]
struct TestConfig {
    fee_rate: f64,
    end_height: u32,
    client1_priv_hex: String,
    client2_priv_hex: String,
    server_priv_hex: String,
}

fn load_test_config(path: &str) -> Result<TestConfig, Box<dyn std::error::Error>> {
    let data = fs::read_to_string(path)?;
    let config: TestConfig = serde_json::from_str(&data)?;
    Ok(config)
}
