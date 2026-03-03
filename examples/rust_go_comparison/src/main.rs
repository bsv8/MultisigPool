use bsv::{
    address::P2PKHAddress, ECDSA, Hash, PrivateKey, PublicKey, Script, SigHash, SighashSignature, SigningHash, Transaction, TxIn, TxOut,
};
use hex;
use serde::Deserialize;
use std::{error::Error, fs, path::PathBuf};

type AnyResult<T> = Result<T, Box<dyn Error>>;

#[derive(Deserialize)]
struct FixtureUtxo {
    txid: String,
    vout: u32,
    satoshis: u64,
}

#[derive(Deserialize)]
struct Fixture {
    #[serde(rename = "clientPrivHex")]
    client_priv_hex: String,
    #[serde(rename = "serverPrivHex")]
    server_priv_hex: String,
    #[serde(rename = "clientUtxos")]
    client_utxos: Vec<FixtureUtxo>,
    #[serde(rename = "endHeight")]
    end_height: u32,
    #[serde(rename = "feeRate")]
    fee_rate: f64,
}

fn main() {
    if let Err(err) = run() {
        eprintln!("error: {err}");
        std::process::exit(1);
    }
}

fn run() -> AnyResult<()> {
    println!("=== Rust Cross-Validation Runner ===\n");

    let fixture = load_fixture()?;
    let client_priv = PrivateKey::from_hex(&fixture.client_priv_hex)?;
    let server_priv = PrivateKey::from_hex(&fixture.server_priv_hex)?;
    let client_pub = client_priv.to_public_key()?;
    let server_pub = server_priv.to_public_key()?;
    let client_address = P2PKHAddress::from_pubkey(&client_pub)?;
    let server_address = P2PKHAddress::from_pubkey(&server_pub)?;
    let client_locking_script = client_address.get_locking_script()?;
    let server_locking_script = server_address.get_locking_script()?;
    let multisig_script = create_dual_multisig_script(&server_pub, &client_pub)?;
    let base_amount = compute_feepool_amount(&fixture.client_utxos);

    let base_tx = build_dual_fee_pool_base_tx(
        &fixture,
        &client_priv,
        &client_pub,
        &client_address,
        &client_locking_script,
        &multisig_script,
        base_amount,
    )?;
    println!("Step1Hex {}", base_tx.to_hex()?);

    let (mut spend_tx, client_signature) = build_dual_fee_pool_spend_tx(
        &fixture,
        &client_priv,
        &multisig_script,
        &server_locking_script,
        &client_locking_script,
        &base_tx,
        base_amount,
    )?;

    println!("Step2Hex {}", hex::encode(client_signature.to_bytes()?));

    let server_signature = sign_multisig_input(&mut spend_tx, 0, &server_priv, &multisig_script, base_amount)?;
    println!("Step3Hex {}", hex::encode(server_signature.to_bytes()?));

    let mut updated_tx = spend_tx.clone();
    update_spend_transaction(&mut updated_tx, 2, 150)?;

    let client_update_sig = sign_multisig_input(&mut updated_tx, 0, &client_priv, &multisig_script, base_amount)?;
    println!("Step4Hex {}", hex::encode(client_update_sig.to_bytes()?));

    let server_update_sig = sign_multisig_input(&mut updated_tx, 0, &server_priv, &multisig_script, base_amount)?;
    println!("Step5Hex {}", hex::encode(server_update_sig.to_bytes()?));

    println!("\n=== Rust Runner Complete ===");
    Ok(())
}

fn build_dual_fee_pool_base_tx(
    fixture: &Fixture,
    client_priv: &PrivateKey,
    client_pub: &PublicKey,
    client_address: &P2PKHAddress,
    client_locking_script: &Script,
    multisig_script: &Script,
    feepool_amount: u64,
) -> AnyResult<Transaction> {
    let total: u64 = fixture.client_utxos.iter().map(|u| u.satoshis).sum();
    if total < feepool_amount {
        return Err("insufficient balance for fee pool target".into());
    }

    let initial_change = total.saturating_sub(feepool_amount);
    let (mut estimate_tx, mut estimate_inputs) = build_base_tx_structure(
        &fixture.client_utxos,
        client_locking_script,
        multisig_script,
        feepool_amount,
        initial_change,
    )?;
    sign_p2pkh_inputs(
        &mut estimate_tx,
        &mut estimate_inputs,
        client_priv,
        client_pub,
        client_address,
        client_locking_script,
    )?;

    let fee = compute_fee(estimate_tx.get_size()? as usize, fixture.fee_rate);
    if total < feepool_amount + fee {
        return Err("insufficient balance after including fee".into());
    }

    let final_change = total - feepool_amount - fee;
    let (mut final_tx, mut final_inputs) = build_base_tx_structure(
        &fixture.client_utxos,
        client_locking_script,
        multisig_script,
        feepool_amount,
        final_change,
    )?;
    sign_p2pkh_inputs(
        &mut final_tx,
        &mut final_inputs,
        client_priv,
        client_pub,
        client_address,
        client_locking_script,
    )?;

    Ok(final_tx)
}

fn build_dual_fee_pool_spend_tx(
    fixture: &Fixture,
    client_priv: &PrivateKey,
    multisig_script: &Script,
    server_locking_script: &Script,
    client_locking_script: &Script,
    base_tx: &Transaction,
    base_amount: u64,
) -> AnyResult<(Transaction, SighashSignature)> {
    const SERVER_AMOUNT: u64 = 100;
    let base_txid = base_tx.get_id_bytes()?;

    let mut estimate_tx = build_spend_tx_structure(
        fixture.end_height,
        &base_txid,
        base_amount,
        SERVER_AMOUNT,
        base_amount - SERVER_AMOUNT,
        multisig_script,
        server_locking_script,
        client_locking_script,
    )?;
    let fake_script = fake_multisig_unlock_script(2)?;
    let mut estimate_input = estimate_tx
        .get_input(0)
        .ok_or("missing multisig input for estimation")?;
    estimate_input.set_unlocking_script(&fake_script);
    estimate_tx.set_input(0, &estimate_input);

    let fee = compute_fee(estimate_tx.get_size()? as usize, fixture.fee_rate);
    if base_amount < SERVER_AMOUNT + fee {
        return Err("not enough balance for server amount and fee".into());
    }

    let client_amount = base_amount - SERVER_AMOUNT - fee;
    let final_tx = build_spend_tx_structure(
        fixture.end_height,
        &base_txid,
        base_amount,
        SERVER_AMOUNT,
        client_amount,
        multisig_script,
        server_locking_script,
        client_locking_script,
    )?;

    let sig = sign_multisig_bip143(&final_tx, 0, client_priv, multisig_script, base_amount)?;
    Ok((final_tx, sig))
}

fn update_spend_transaction(tx: &mut Transaction, new_sequence: u32, new_server_amount: u64) -> AnyResult<()> {
    let mut input = tx
        .get_input(0)
        .ok_or("missing multisig input for update")?;
    input.set_sequence(new_sequence);
    tx.set_input(0, &input);

    let server_output = tx.get_output(0).ok_or("missing server output")?;
    let client_output = tx.get_output(1).ok_or("missing client output")?;
    let total = server_output.get_satoshis() + client_output.get_satoshis();
    if new_server_amount > total {
        return Err("new server amount exceeds total outputs".into());
    }
    let new_client_amount = total - new_server_amount;
    tx.set_output(0, &TxOut::new(new_server_amount, &server_output.get_script_pub_key()));
    tx.set_output(1, &TxOut::new(new_client_amount, &client_output.get_script_pub_key()));
    Ok(())
}

fn sign_multisig_input(
    tx: &mut Transaction,
    index: usize,
    private_key: &PrivateKey,
    locking_script: &Script,
    value: u64,
) -> AnyResult<SighashSignature> {
    sign_multisig_bip143(tx, index, private_key, locking_script, value)
}

fn sign_p2pkh_inputs(
    tx: &mut Transaction,
    inputs: &mut [TxIn],
    priv_key: &PrivateKey,
    pub_key: &PublicKey,
    address: &P2PKHAddress,
    locking_script: &Script,
) -> AnyResult<()> {
    for (index, input) in inputs.iter_mut().enumerate() {
        let value = input
            .get_satoshis()
            .ok_or("missing satoshi amount on input")?;
        let sig = sign_with_deterministic_k(tx, index, priv_key, locking_script, value, false)?;
        let unlock_script = address.get_unlocking_script(pub_key, &sig)?;
        input.set_unlocking_script(&unlock_script);
        tx.set_input(index, input);
    }
    Ok(())
}

fn sign_with_deterministic_k(
    tx: &mut Transaction,
    index: usize,
    priv_key: &PrivateKey,
    locking_script: &Script,
    value: u64,
    reverse_k: bool,
) -> AnyResult<SighashSignature> {
    let preimage = tx.sighash_preimage(SigHash::InputsOutputs, index, locking_script, value)?;
    let signature = ECDSA::sign_with_deterministic_k(priv_key, &preimage, SigningHash::Sha256d, reverse_k)?;
    Ok(SighashSignature::new(&signature, SigHash::InputsOutputs, &preimage))
}

fn create_dual_multisig_script(server_pub: &PublicKey, client_pub: &PublicKey) -> AnyResult<Script> {
    let mut script = Vec::new();
    script.push(0x52);
    script.extend(push_data(&server_pub.to_bytes()?));
    script.extend(push_data(&client_pub.to_bytes()?));
    script.push(0x52);
    script.push(0xae);
    Ok(Script::from_bytes(&script)?)
}

fn fake_multisig_unlock_script(m: usize) -> AnyResult<Script> {
    let mut bytes = Vec::new();
    bytes.push(0x00);
    for _ in 0..m {
        let mut fake_sig = vec![0u8; 72];
        fake_sig.push(0x00);
        bytes.extend(push_data(&fake_sig));
    }
    Ok(Script::from_bytes(&bytes)?)
}

fn push_data(data: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(1 + data.len());
    if data.len() < 0x4c {
        out.push(data.len() as u8);
    } else if data.len() <= 0xff {
        out.push(0x4c);
        out.push(data.len() as u8);
    } else if data.len() <= 0xffff {
        out.push(0x4d);
        out.extend_from_slice(&(data.len() as u16).to_le_bytes());
    } else {
        out.push(0x4e);
        out.extend_from_slice(&(data.len() as u32).to_le_bytes());
    }
    out.extend_from_slice(data);
    out
}

fn build_base_tx_structure(
    utxos: &[FixtureUtxo],
    client_locking_script: &Script,
    multisig_script: &Script,
    feepool_amount: u64,
    change_amount: u64,
) -> AnyResult<(Transaction, Vec<TxIn>)> {
    let mut tx = Transaction::new(1, 0);
    let mut inputs = Vec::with_capacity(utxos.len());
    let empty_script = Script::from_bytes(&[])?;

    for utxo in utxos {
        let prev_txid = hex::decode(&utxo.txid)?;
        let mut input = TxIn::new(&prev_txid, utxo.vout, &empty_script, Some(u32::MAX));
        input.set_locking_script(client_locking_script);
        input.set_satoshis(utxo.satoshis);
        tx.add_input(&input);
        inputs.push(input);
    }

    tx.add_output(&TxOut::new(feepool_amount, multisig_script));
    tx.add_output(&TxOut::new(change_amount, client_locking_script));

    Ok((tx, inputs))
}

fn build_spend_tx_structure(
    lock_time: u32,
    base_txid: &[u8],
    base_amount: u64,
    server_amount: u64,
    client_amount: u64,
    multisig_script: &Script,
    server_locking_script: &Script,
    client_locking_script: &Script,
) -> AnyResult<Transaction> {
    let empty_script = Script::from_bytes(&[])?;
    let mut tx = Transaction::new(1, lock_time);
    let mut input = TxIn::new(base_txid, 0, &empty_script, Some(1));
    input.set_locking_script(multisig_script);
    input.set_satoshis(base_amount);
    tx.add_input(&input);

    tx.add_output(&TxOut::new(server_amount, server_locking_script));
    tx.add_output(&TxOut::new(client_amount, client_locking_script));
    Ok(tx)
}

fn calc_bip143_preimage(tx: &Transaction, index: usize, script: &Script, value: u64) -> AnyResult<Vec<u8>> {
    let input = tx.get_input(index).ok_or("missing input for sighash")?;
    let mut buffer = Vec::new();

    buffer.extend_from_slice(&tx.get_version().to_le_bytes());
    buffer.extend_from_slice(&hash_prevouts(tx)?);
    buffer.extend_from_slice(&hash_sequence(tx)?);

    buffer.extend_from_slice(&input.get_prev_tx_id(Some(true)));
    buffer.extend_from_slice(&input.get_vout().to_le_bytes());

    let script_bytes = script.to_bytes();
    buffer.extend_from_slice(&encode_varint_u64(script_bytes.len() as u64));
    buffer.extend_from_slice(&script_bytes);

    buffer.extend_from_slice(&value.to_le_bytes());
    buffer.extend_from_slice(&input.get_sequence().to_le_bytes());
    buffer.extend_from_slice(&hash_outputs(tx)?);
    buffer.extend_from_slice(&tx.get_n_locktime().to_le_bytes());

    let sighash_flag: u32 = 0x41;
    buffer.extend_from_slice(&sighash_flag.to_le_bytes());

    Ok(buffer)
}

fn hash_prevouts(tx: &Transaction) -> AnyResult<Vec<u8>> {
    let mut data = Vec::new();
    for i in 0..tx.get_ninputs() {
        let input = tx.get_input(i).ok_or("missing input for prevouts hash")?;
        data.extend_from_slice(&input.get_prev_tx_id(Some(true)));
        data.extend_from_slice(&input.get_vout().to_le_bytes());
    }
    Ok(Hash::sha_256d(&data).to_bytes())
}

fn hash_sequence(tx: &Transaction) -> AnyResult<Vec<u8>> {
    let mut data = Vec::new();
    for i in 0..tx.get_ninputs() {
        let input = tx.get_input(i).ok_or("missing input for sequence hash")?;
        data.extend_from_slice(&input.get_sequence().to_le_bytes());
    }
    Ok(Hash::sha_256d(&data).to_bytes())
}

fn hash_outputs(tx: &Transaction) -> AnyResult<Vec<u8>> {
    let mut data = Vec::new();
    for i in 0..tx.get_noutputs() {
        let output = tx.get_output(i).ok_or("missing output for hash")?;
        data.extend_from_slice(&output.get_satoshis().to_le_bytes());
        let script = output.get_script_pub_key();
        let script_bytes = script.to_bytes();
        data.extend_from_slice(&encode_varint_u64(script_bytes.len() as u64));
        data.extend_from_slice(&script_bytes);
    }
    Ok(Hash::sha_256d(&data).to_bytes())
}

fn encode_varint_u64(value: u64) -> Vec<u8> {
    match value {
        0..=0xfc => vec![value as u8],
        0xfd..=0xffff => {
            let mut out = vec![0xfd];
            out.extend_from_slice(&(value as u16).to_le_bytes());
            out
        }
        0x10000..=0xffff_ffff => {
            let mut out = vec![0xfe];
            out.extend_from_slice(&(value as u32).to_le_bytes());
            out
        }
        _ => {
            let mut out = vec![0xff];
            out.extend_from_slice(&value.to_le_bytes());
            out
        }
    }
}

fn sign_multisig_bip143(
    tx: &Transaction,
    index: usize,
    priv_key: &PrivateKey,
    locking_script: &Script,
    value: u64,
) -> AnyResult<SighashSignature> {
    let preimage = calc_bip143_preimage(tx, index, locking_script, value)?;
    let signature = ECDSA::sign_with_deterministic_k(priv_key, &preimage, SigningHash::Sha256d, false)?;
    Ok(SighashSignature::new(&signature, SigHash::InputsOutputs, &preimage))
}

fn compute_feepool_amount(utxos: &[FixtureUtxo]) -> u64 {
    let total: u64 = utxos.iter().map(|u| u.satoshis).sum();
    if total > 500 {
        total - 500
    } else {
        total
    }
}

fn compute_fee(size: usize, fee_rate: f64) -> u64 {
    let mut fee = ((size as f64) / 1000.0 * fee_rate) as u64;
    if fee == 0 {
        fee = 1;
    }
    fee
}

fn load_fixture() -> AnyResult<Fixture> {
    let path = find_fixture_path().ok_or("fixture.json not found")?;
    let data = fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&data)?)
}

fn find_fixture_path() -> Option<PathBuf> {
    let candidates = [
        PathBuf::from("fixture.json"),
        PathBuf::from("../txtest/fixture.json"),
        PathBuf::from("../examples/txtest/fixture.json"),
        PathBuf::from("../../examples/txtest/fixture.json"),
    ];
    for candidate in candidates {
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}
