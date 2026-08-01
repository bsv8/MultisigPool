import { PrivateKey } from '@bsv/sdk/primitives';
import Transaction from '@bsv/sdk/transaction/Transaction';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';
import P2PKH from '../libs/P2PKH';
import { estimateSerializedTxSize } from '../libs/TX_SIZE';
import { Protocol, Version, type FundingTxResult, type ArbitratedPoolRoles, type UTXO } from '../types';
import { buildArbitratedPoolLock, validateArbitratedPoolRoles } from './script';

export async function buildArbitratedPoolFundingTx(utxos: readonly UTXO[], poolAmount: number, buyerPrivateKey: PrivateKey, roles: ArbitratedPoolRoles, feeRate: number): Promise<FundingTxResult> {
  validateArbitratedPoolRoles(roles); if (!utxos.length) throw new Error('buyer UTXOs are required'); if (!Number.isSafeInteger(poolAmount) || poolAmount <= 0) throw new Error('pool amount must be positive'); if (feeRate < 0) throw new Error('fee rate must not be negative');
  if (buyerPrivateKey.toPublicKey().toString() !== roles.buyer.toString()) throw new Error('buyer private key does not match buyer public key');
  const tx = new Transaction(); const sourceScript = new P2PKH().lock(roles.buyer); const sigHash = TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID; let total = 0;
  for (const utxo of utxos) { if (!Number.isSafeInteger(utxo.satoshis) || utxo.satoshis < 0 || !Number.isSafeInteger(total + utxo.satoshis)) throw new Error('invalid buyer UTXO amount'); total += utxo.satoshis; tx.addInput({ sourceTXID: utxo.txid, sourceOutputIndex: utxo.vout, unlockingScriptTemplate: new P2PKH().unlock(buyerPrivateKey, sigHash, utxo.satoshis, sourceScript), sequence: 0xffffffff }); }
  if (total < poolAmount) throw new Error('buyer balance is insufficient for pool amount'); tx.addOutput({ lockingScript: buildArbitratedPoolLock(roles), satoshis: poolAmount }); tx.addOutput({ lockingScript: sourceScript, satoshis: total - poolAmount });
  for (let i = 0; i < tx.inputs.length; i += 1) tx.inputs[i].unlockingScript = await tx.inputs[i].unlockingScriptTemplate!.sign(tx, i); let fee = Math.ceil((estimateSerializedTxSize(tx) * feeRate) / 1000); if (fee === 0) fee = 1; if (total < poolAmount + fee) throw new Error('buyer balance is insufficient for pool amount and fee'); tx.outputs[1].satoshis = total - poolAmount - fee;
  for (let i = 0; i < tx.inputs.length; i += 1) tx.inputs[i].unlockingScript = await tx.inputs[i].unlockingScriptTemplate!.sign(tx, i); return { tx, poolAmount, poolOutputIndex: 0, fee, protocol: Protocol, version: Version };
}
