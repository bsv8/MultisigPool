import { PrivateKey, PublicKey } from '@bsv/sdk/primitives';
import Transaction from '@bsv/sdk/transaction/Transaction';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';
import Script from '@bsv/sdk/script/Script';
import LockingScript from '@bsv/sdk/script/LockingScript';
import { createDualMultisigScript } from './1base_tx';
import MultiSig from '../libs/MULTISIG';

/**
 * 服务器端为双端费用池花费交易回签
 * 对应 Go 实现：SpendTXServerSign
 *
 * @param tx               需要签名的交易对象
 * @param targetAmount     输入的 satoshi 金额（即 multisig UTXO 的数额）
 * @param serverPrivateKey 服务器私钥
 * @param clientPublicKey  客户端公钥
 * @returns 服务器签名字节（DER + sighash flag）
 */
export function spendTXServerSign(
  tx: Transaction,
  targetAmount: number,
  serverPrivateKey: PrivateKey,
  clientPublicKey: PublicKey,
): number[] {
  const serverPublicKey = serverPrivateKey.toPublicKey();

  // 构造 2-of-2 优先级脚本
  const priorityScript: Script = createDualMultisigScript([serverPublicKey, clientPublicKey]);

  // 确保 sourceTransaction 信息存在
  if (!tx.inputs[0].sourceTransaction) {
    tx.inputs[0].sourceTransaction = new Transaction();
    tx.inputs[0].sourceTransaction.outputs = [];
  }

  // 设置源输出（index 固定为 0）
  const priorityLocking = new LockingScript();
  priorityLocking.chunks = priorityScript.chunks;
  tx.inputs[0].sourceTransaction.outputs[0] = {
    satoshis: targetAmount,
    lockingScript: priorityLocking,
  };

  const serverSignBytes = new MultiSig().signOne(
    tx,
    0,
    serverPrivateKey,
    TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID,
  );

  return Array.from(serverSignBytes);
}
