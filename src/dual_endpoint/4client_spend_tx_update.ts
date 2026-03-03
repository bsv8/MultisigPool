import { PrivateKey, PublicKey } from '@bsv/sdk/primitives';
import Transaction from '@bsv/sdk/transaction/Transaction';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';
import Script from '@bsv/sdk/script/Script';
import LockingScript from '@bsv/sdk/script/LockingScript';
import { hash256 } from '@bsv/sdk/primitives/Hash';
import * as ECDSA from '@bsv/sdk/primitives/ECDSA';
import BigNumber from '@bsv/sdk/primitives/BigNumber';
import { createDualMultisigScript } from './1base_tx';

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

  const priorityScript = createDualMultisigScript([serverPublicKey, clientPublicKey]);

  const sighashData = TransactionSignature.format({
    sourceTXID: tx.inputs[0].sourceTXID || '',
    sourceOutputIndex: tx.inputs[0].sourceOutputIndex,
    sourceSatoshis: tx.inputs[0].sourceTransaction?.outputs[0].satoshis || 0,
    transactionVersion: tx.version,
    otherInputs: [],
    outputs: tx.outputs,
    inputIndex: 0,
    subscript: priorityScript,
    inputSequence: tx.inputs[0].sequence || 1,
    lockTime: tx.lockTime,
    scope: TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID,
  });

  // 客户端确定性签名（RFC6979）
  const msgHash = hash256(sighashData);
  const signature = ECDSA.sign(new BigNumber(msgHash, 16), clientPrivateKey, true);
  const signatureDER = signature.toDER() as number[];

  return [
    ...signatureDER,
    TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID,
  ];
}
