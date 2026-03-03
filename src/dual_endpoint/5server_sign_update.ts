import { PrivateKey, PublicKey } from '@bsv/sdk/primitives';
import Transaction from '@bsv/sdk/transaction/Transaction';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';
import { hash256 } from '@bsv/sdk/primitives/Hash';
import * as ECDSA from '@bsv/sdk/primitives/ECDSA';
import BigNumber from '@bsv/sdk/primitives/BigNumber';
import { createDualMultisigScript } from './1base_tx';

/**
 * 服务器在更新后的 B-Tx 上重新签名
 * 对应 Go: ServerDualFeePoolSpendTXUpdateSign
 */
export function serverDualFeePoolSpendTXUpdateSign(
  tx: Transaction,
  serverPrivateKey: PrivateKey,
  clientPublicKey: PublicKey,
): number[] {
  const serverPublicKey = serverPrivateKey.toPublicKey();

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

  // 服务器确定性签名（RFC6979）
  const msgHash = hash256(sighashData);
  const signature = ECDSA.sign(new BigNumber(msgHash, 16), serverPrivateKey, true);
  const signatureDER = signature.toDER() as number[];

  return [
    ...signatureDER,
    TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID,
  ];
}
