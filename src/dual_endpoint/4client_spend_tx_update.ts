import { PrivateKey, PublicKey } from '@bsv/sdk/primitives';
import Transaction from '@bsv/sdk/transaction/Transaction';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';
import Script from '@bsv/sdk/script/Script';
import LockingScript from '@bsv/sdk/script/LockingScript';
import { createDualMultisigScript } from './1base_tx';
import MultiSig from '../libs/MULTISIG';

export const FINAL_LOCKTIME = 0xffffffff;

/**
 * 载入 B-Tx（hex）并修改金额 / sequence / locktime 等信息
 * 对应 Go: LoadTx
 */
export function loadTx(
  txHex: string,
  locktime: number | undefined,
  sequenceNumber: number,
  serverAmount: number,
  serverPublicKey: PublicKey,
  clientPublicKey: PublicKey,
  targetAmount: number,
): Transaction {
  const tx = Transaction.fromHex(txHex);

  if (locktime !== undefined) {
    tx.lockTime = locktime;
  }

  // 设置源输出信息
  const priorityScript: Script = createDualMultisigScript([serverPublicKey, clientPublicKey]);
  const priorityLocking = new LockingScript();
  priorityLocking.chunks = priorityScript.chunks;

  if (!tx.inputs[0].sourceTransaction) {
    tx.inputs[0].sourceTransaction = new Transaction();
    tx.inputs[0].sourceTransaction.outputs = [];
  }

  tx.inputs[0].sourceTransaction.outputs[0] = {
    satoshis: targetAmount,
    lockingScript: priorityLocking,
  };

  tx.inputs[0].sequence = sequenceNumber;

  // 更新输出金额（index 0 server, index 1 client）
  const total = (tx.outputs[0].satoshis || 0) + (tx.outputs[1].satoshis || 0);
  tx.outputs[0].satoshis = serverAmount;
  tx.outputs[1].satoshis = total - serverAmount;

  return tx;
}

/**
 * 客户端在更新后的 B-Tx 上重新签名
 * 对应 Go: ClientDualFeePoolSpendTXUpdateSign
 */
export function clientDualFeePoolSpendTXUpdateSign(
  tx: Transaction,
  clientPrivateKey: PrivateKey,
  serverPublicKey: PublicKey,
): number[] {
  const clientPublicKey = clientPrivateKey.toPublicKey();

  const clientSignBytes = new MultiSig().signOne(
    tx,
    0,
    clientPrivateKey,
    TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID,
  );

  return Array.from(clientSignBytes);
}
