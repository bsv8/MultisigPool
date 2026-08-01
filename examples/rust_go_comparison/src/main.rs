use bsv::{
    address::P2PKHAddress, Hash, PrivateKey, PublicKey, Script, SigHash, SighashSignature,
    SigningHash, Transaction, TxIn, TxOut, ECDSA,
};
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
    protocol: String,
    version: u32,
    #[serde(rename = "buyerPrivHex")]
    buyer_priv_hex: String,
    #[serde(rename = "sellerPrivHex")]
    seller_priv_hex: String,
    #[serde(rename = "buyerUtxos")]
    buyer_utxos: Vec<FixtureUtxo>,
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
    if fixture.protocol != "bitfs.pool.v3" || fixture.version != 3 {
        return Err("unsupported pool protocol: expected bitfs.pool.v3 v3".into());
    }
    let buyer_priv = PrivateKey::from_hex(&fixture.buyer_priv_hex)?;
    let seller_priv = PrivateKey::from_hex(&fixture.seller_priv_hex)?;
    let buyer_pub = buyer_priv.to_public_key()?;
    let seller_pub = seller_priv.to_public_key()?;
    let buyer_address = P2PKHAddress::from_pubkey(&buyer_pub)?;
    let seller_address = P2PKHAddress::from_pubkey(&seller_pub)?;
    let buyer_locking_script = buyer_address.get_locking_script()?;
    let seller_locking_script = seller_address.get_locking_script()?;
    let multisig_script = create_two_party_pool_multisig_script(&buyer_pub, &seller_pub)?;
    let base_amount = compute_feepool_amount(&fixture.buyer_utxos);

    let base_tx = build_two_party_pool_base_tx(
        &fixture,
        &buyer_priv,
        &buyer_pub,
        &buyer_address,
        &buyer_locking_script,
        &multisig_script,
        base_amount,
    )?;
    println!("Step1Hex {}", base_tx.to_hex()?);

    let (mut spend_tx, buyer_signature) = build_two_party_pool_spend_tx(
        &fixture,
        &buyer_priv,
        &multisig_script,
        &seller_locking_script,
        &buyer_locking_script,
        &base_tx,
        base_amount,
    )?;

    println!("Step2Hex {}", hex::encode(buyer_signature.to_bytes()?));

    let seller_signature = sign_multisig_input(
        &mut spend_tx,
        0,
        &seller_priv,
        &multisig_script,
        base_amount,
    )?;
    println!("Step3Hex {}", hex::encode(seller_signature.to_bytes()?));

    let mut updated_tx = spend_tx.clone();
    update_spend_transaction(&mut updated_tx, 2, 150)?;

    let buyer_update_sig = sign_multisig_input(
        &mut updated_tx,
        0,
        &buyer_priv,
        &multisig_script,
        base_amount,
    )?;
    println!("Step4Hex {}", hex::encode(buyer_update_sig.to_bytes()?));

    let seller_update_sig = sign_multisig_input(
        &mut updated_tx,
        0,
        &seller_priv,
        &multisig_script,
        base_amount,
    )?;
    println!("Step5Hex {}", hex::encode(seller_update_sig.to_bytes()?));

    println!("\n=== Rust Runner Complete ===");
    Ok(())
}

fn build_two_party_pool_base_tx(
    fixture: &Fixture,
    buyer_priv: &PrivateKey,
    buyer_pub: &PublicKey,
    buyer_address: &P2PKHAddress,
    buyer_locking_script: &Script,
    multisig_script: &Script,
    feepool_amount: u64,
) -> AnyResult<Transaction> {
    let total: u64 = fixture.buyer_utxos.iter().map(|u| u.satoshis).sum();
    if total < feepool_amount {
        return Err("insufficient balance for fee pool target".into());
    }

    let initial_change = total.saturating_sub(feepool_amount);
    let (mut estimate_tx, mut estimate_inputs) = build_base_tx_structure(
        &fixture.buyer_utxos,
        buyer_locking_script,
        multisig_script,
        feepool_amount,
        initial_change,
    )?;
    sign_p2pkh_inputs(
        &mut estimate_tx,
        &mut estimate_inputs,
        buyer_priv,
        buyer_pub,
        buyer_address,
        buyer_locking_script,
    )?;

    let fee = compute_fee(estimate_tx.get_size()?, fixture.fee_rate);
    if total < feepool_amount + fee {
        return Err("insufficient balance after including fee".into());
    }

    let final_change = total - feepool_amount - fee;
    let (mut final_tx, mut final_inputs) = build_base_tx_structure(
        &fixture.buyer_utxos,
        buyer_locking_script,
        multisig_script,
        feepool_amount,
        final_change,
    )?;
    sign_p2pkh_inputs(
        &mut final_tx,
        &mut final_inputs,
        buyer_priv,
        buyer_pub,
        buyer_address,
        buyer_locking_script,
    )?;

    Ok(final_tx)
}

fn build_two_party_pool_spend_tx(
    fixture: &Fixture,
    buyer_priv: &PrivateKey,
    multisig_script: &Script,
    seller_locking_script: &Script,
    buyer_locking_script: &Script,
    base_tx: &Transaction,
    base_amount: u64,
) -> AnyResult<(Transaction, SighashSignature)> {
    const SELLER_AMOUNT: u64 = 100;
    let base_txid = base_tx.get_id_bytes()?;

    let mut estimate_tx = build_spend_tx_structure(SpendTxParams {
        lock_time: fixture.end_height,
        base_txid: &base_txid,
        base_amount,
        seller_amount: SELLER_AMOUNT,
        buyer_amount: base_amount - SELLER_AMOUNT,
        multisig_script,
        seller_locking_script,
        buyer_locking_script,
    })?;
    let fake_script = fake_multisig_unlock_script(2)?;
    let mut estimate_input = estimate_tx
        .get_input(0)
        .ok_or("missing multisig input for estimation")?;
    estimate_input.set_unlocking_script(&fake_script);
    estimate_tx.set_input(0, &estimate_input);

    let fee = compute_fee(estimate_tx.get_size()? as usize, fixture.fee_rate);
    if base_amount < SELLER_AMOUNT + fee {
        return Err("not enough balance for seller amount and fee".into());
    }

    let buyer_amount = base_amount - SELLER_AMOUNT - fee;
    let final_tx = build_spend_tx_structure(SpendTxParams {
        lock_time: fixture.end_height,
        base_txid: &base_txid,
        base_amount,
        seller_amount: SELLER_AMOUNT,
        buyer_amount,
        multisig_script,
        seller_locking_script,
        buyer_locking_script,
    })?;

    let sig = sign_multisig_bip143(&final_tx, 0, buyer_priv, multisig_script, base_amount)?;
    Ok((final_tx, sig))
}

fn update_spend_transaction(
    tx: &mut Transaction,
    new_sequence: u32,
    new_seller_amount: u64,
) -> AnyResult<()> {
    let mut input = tx.get_input(0).ok_or("missing multisig input for update")?;
    input.set_sequence(new_sequence);
    tx.set_input(0, &input);

    let buyer_output = tx.get_output(0).ok_or("missing buyer output")?;
    let seller_output = tx.get_output(1).ok_or("missing seller output")?;
    let total = seller_output.get_satoshis() + buyer_output.get_satoshis();
    if new_seller_amount > total {
        return Err("new seller amount exceeds total outputs".into());
    }
    let new_buyer_amount = total - new_seller_amount;
    tx.set_output(
        0,
        &TxOut::new(new_buyer_amount, &buyer_output.get_script_pub_key()),
    );
    tx.set_output(
        1,
        &TxOut::new(new_seller_amount, &seller_output.get_script_pub_key()),
    );
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
    let signature =
        ECDSA::sign_with_deterministic_k(priv_key, &preimage, SigningHash::Sha256d, reverse_k)?;
    Ok(SighashSignature::new(
        &signature,
        SigHash::InputsOutputs,
        &preimage,
    ))
}

fn create_two_party_pool_multisig_script(
    buyer_pub: &PublicKey,
    seller_pub: &PublicKey,
) -> AnyResult<Script> {
    let mut script = Vec::new();
    script.push(0x52);
    script.extend(push_data(&buyer_pub.to_bytes()?));
    script.extend(push_data(&seller_pub.to_bytes()?));
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
    buyer_locking_script: &Script,
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
        input.set_locking_script(buyer_locking_script);
        input.set_satoshis(utxo.satoshis);
        tx.add_input(&input);
        inputs.push(input);
    }

    tx.add_output(&TxOut::new(feepool_amount, multisig_script));
    tx.add_output(&TxOut::new(change_amount, buyer_locking_script));

    Ok((tx, inputs))
}

struct SpendTxParams<'a> {
    lock_time: u32,
    base_txid: &'a [u8],
    base_amount: u64,
    seller_amount: u64,
    buyer_amount: u64,
    multisig_script: &'a Script,
    seller_locking_script: &'a Script,
    buyer_locking_script: &'a Script,
}

fn build_spend_tx_structure(params: SpendTxParams<'_>) -> AnyResult<Transaction> {
    let empty_script = Script::from_bytes(&[])?;
    let mut tx = Transaction::new(1, params.lock_time);
    let mut input = TxIn::new(params.base_txid, 0, &empty_script, Some(1));
    input.set_locking_script(params.multisig_script);
    input.set_satoshis(params.base_amount);
    tx.add_input(&input);

    tx.add_output(&TxOut::new(
        params.buyer_amount,
        params.buyer_locking_script,
    ));
    tx.add_output(&TxOut::new(
        params.seller_amount,
        params.seller_locking_script,
    ));
    Ok(tx)
}

fn calc_bip143_preimage(
    tx: &Transaction,
    index: usize,
    script: &Script,
    value: u64,
) -> AnyResult<Vec<u8>> {
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
    let signature =
        ECDSA::sign_with_deterministic_k(priv_key, &preimage, SigningHash::Sha256d, false)?;
    Ok(SighashSignature::new(
        &signature,
        SigHash::InputsOutputs,
        &preimage,
    ))
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
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../two_party_pool_compare/fixture.json"),
        PathBuf::from("fixture.json"),
        PathBuf::from("../two_party_pool_compare/fixture.json"),
        PathBuf::from("../examples/two_party_pool_compare/fixture.json"),
        PathBuf::from("../../examples/two_party_pool_compare/fixture.json"),
    ];
    candidates.into_iter().find(|candidate| candidate.exists())
}

#[cfg(test)]
mod tests {
    use super::create_two_party_pool_multisig_script;
    use bsv::PrivateKey;

    #[test]
    fn uses_buyer_then_seller_key_order() {
        let buyer = PrivateKey::from_hex(
            "903b1b2c396f17203fa83444d72bf5c666119d9d681eb715520f99ae6f92322c",
        )
        .unwrap()
        .to_public_key()
        .unwrap();
        let seller = PrivateKey::from_hex(
            "a2d2ca4c19e3c560792ca751842c29b9da94be09f712a7f9ba7c66e64a354829",
        )
        .unwrap()
        .to_public_key()
        .unwrap();
        let script = create_two_party_pool_multisig_script(&buyer, &seller).unwrap();
        let bytes = script.to_bytes();
        assert_eq!(&bytes[2..35], buyer.to_bytes().unwrap().as_slice());
        assert_eq!(&bytes[36..69], seller.to_bytes().unwrap().as_slice());
    }
}
