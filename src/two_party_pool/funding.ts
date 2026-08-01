import { PrivateKey } from '@bsv/sdk/primitives';
import Transaction from '@bsv/sdk/transaction/Transaction';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';
import P2PKH from '../libs/P2PKH';
import { estimateSerializedTxSize } from '../libs/TX_SIZE';
import { Protocol, Version, type FundingTxResult, type TwoPartyPoolRoles, type UTXO } from '../types';
import { buildTwoPartyPoolLock, validateTwoPartyPoolRoles } from './script';

export async function buildTwoPartyPoolFundingTx(
  utxos: readonly UTXO[], poolAmount: number, buyerPrivateKey: PrivateKey,
  roles: TwoPartyPoolRoles, feeRate: number,
): Promise<FundingTxResult> {
  validateTwoPartyPoolRoles(roles);
  if (!utxos.length) throw new Error('buyer UTXOs are required');
  if (!Number.isSafeInteger(poolAmount) || poolAmount <= 0) throw new Error('pool amount must be positive');
  if (feeRate < 0) throw new Error('fee rate must not be negative');
  if (Buffer.from(buyerPrivateKey.toPublicKey().encode(true) as number[]).toString('hex') !== Buffer.from(roles.buyer.encode(true) as number[]).toString('hex')) throw new Error('buyer private key does not match buyer public key');
  const tx = new Transaction();
  const sourceScript = new P2PKH().lock(roles.buyer);
  const sigHash = TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID;
  let total = 0;
  for (const utxo of utxos) {
    if (!Number.isSafeInteger(utxo.satoshis) || utxo.satoshis < 0) throw new Error('invalid buyer UTXO amount');
    if (!Number.isSafeInteger(total + utxo.satoshis)) throw new Error('buyer UTXO total exceeds safe integer range');
    total += utxo.satoshis;
    tx.addInput({ sourceTXID: utxo.txid, sourceOutputIndex: utxo.vout, unlockingScriptTemplate: new P2PKH().unlock(buyerPrivateKey, sigHash, utxo.satoshis, sourceScript), sequence: 0xffffffff });
  }
  if (total < poolAmount) throw new Error('buyer balance is insufficient for pool amount');
  tx.addOutput({ lockingScript: buildTwoPartyPoolLock(roles), satoshis: poolAmount });
  tx.addOutput({ lockingScript: sourceScript, satoshis: total - poolAmount });
  for (let i = 0; i < tx.inputs.length; i += 1) tx.inputs[i].unlockingScript = await tx.inputs[i].unlockingScriptTemplate!.sign(tx, i);
  let fee = Math.floor((estimateSerializedTxSize(tx) / 1000) * feeRate);
  if (fee === 0) fee = 1;
  if (total < poolAmount + fee) throw new Error('buyer balance is insufficient for pool amount and fee');
  tx.outputs[1].satoshis = total - poolAmount - fee;
  for (let i = 0; i < tx.inputs.length; i += 1) tx.inputs[i].unlockingScript = await tx.inputs[i].unlockingScriptTemplate!.sign(tx, i);
  return { tx, poolAmount, poolOutputIndex: 0, fee, protocol: Protocol, version: Version };
}
