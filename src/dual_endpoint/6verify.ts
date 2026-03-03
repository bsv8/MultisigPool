import { PublicKey } from '@bsv/sdk/primitives';
import Transaction from '@bsv/sdk/transaction/Transaction';
import Script from '@bsv/sdk/script/Script';
import LockingScript from '@bsv/sdk/script/LockingScript';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';
import { createDualMultisigScript } from './1base_tx';
import { verifyInputSignature } from '../libs/VERIFY';

/**
 * 验证客户端在双端花费交易（B-Tx）上的签名。
 * 需要传入多签 UTXO 的总金额以计算正确的 SigHash。
 */
export function serverVerifyClientSpendSig(
  tx: Transaction,
  totalAmount: number,
  serverPublicKey: PublicKey,
  clientPublicKey: PublicKey,
  clientSignBytes: number[],
): boolean {
  // 使用规范化公钥顺序重新构建多签赎回脚本。
  const redeem: Script = createDualMultisigScript([serverPublicKey, clientPublicKey]);

  // 构建临时 SourceTxOutput，上下文会在 verifyInputSignature 内部自行恢复。
  const locking = new LockingScript();
  locking.chunks = redeem.chunks;

  return verifyInputSignature({
    tx,
    inputIndex: 0,
    lockingScript: locking as unknown as Script,
    sourceSatoshis: totalAmount,
    publicKey: clientPublicKey,
    signatureBytes: clientSignBytes,
    expectedSigHashFlag: TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID,
  });
}

/**
 * 验证服务器在双端花费交易（B-Tx）上的签名。
 */
export function clientVerifyServerSpendSig(
  tx: Transaction,
  totalAmount: number,
  serverPublicKey: PublicKey,
  clientPublicKey: PublicKey,
  serverSignBytes: number[],
): boolean {
  const redeem: Script = createDualMultisigScript([serverPublicKey, clientPublicKey]);
  const locking = new LockingScript();
  locking.chunks = redeem.chunks;

  return verifyInputSignature({
    tx,
    inputIndex: 0,
    lockingScript: locking as unknown as Script,
    sourceSatoshis: totalAmount,
    publicKey: serverPublicKey,
    signatureBytes: serverSignBytes,
    expectedSigHashFlag: TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID,
  });
}

/**
 * 在加载上下文后验证客户端对更新版 B-Tx 的签名。
 * 交易必须已在 inputs[0].sourceTransaction.outputs[0] 中写入金额。
 */
export function serverVerifyClientUpdateSig(
  tx: Transaction,
  serverPublicKey: PublicKey,
  clientPublicKey: PublicKey,
  clientSignBytes: number[],
): boolean {
  const srcValue = tx.inputs[0].sourceTransaction?.outputs[0].satoshis || 0;
  if (!srcValue) return false;
  const redeem: Script = createDualMultisigScript([serverPublicKey, clientPublicKey]);
  const locking = new LockingScript();
  locking.chunks = redeem.chunks;

  return verifyInputSignature({
    tx,
    inputIndex: 0,
    lockingScript: locking as unknown as Script,
    sourceSatoshis: srcValue,
    publicKey: clientPublicKey,
    signatureBytes: clientSignBytes,
    expectedSigHashFlag: TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID,
  });
}

/**
 * 验证服务器对更新版 B-Tx 的签名。
 */
export function clientVerifyServerUpdateSig(
  tx: Transaction,
  serverPublicKey: PublicKey,
  clientPublicKey: PublicKey,
  serverSignBytes: number[],
): boolean {
  const srcValue = tx.inputs[0].sourceTransaction?.outputs[0].satoshis || 0;
  if (!srcValue) return false;
  const redeem: Script = createDualMultisigScript([serverPublicKey, clientPublicKey]);
  const locking = new LockingScript();
  locking.chunks = redeem.chunks;

  return verifyInputSignature({
    tx,
    inputIndex: 0,
    lockingScript: locking as unknown as Script,
    sourceSatoshis: srcValue,
    publicKey: serverPublicKey,
    signatureBytes: serverSignBytes,
    expectedSigHashFlag: TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID,
  });
}
