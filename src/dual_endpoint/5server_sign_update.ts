import { PrivateKey, PublicKey } from '@bsv/sdk/primitives';
import Transaction from '@bsv/sdk/transaction/Transaction';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';
import MultiSig from '../libs/MULTISIG';

/**
 * 服务器在更新后的 B-Tx 上重新签名
 * 对应 Go: ServerDualFeePoolSpendTXUpdateSign
 */
export function serverDualFeePoolSpendTXUpdateSign(
  tx: Transaction,
  serverPrivateKey: PrivateKey,
  clientPublicKey: PublicKey,
): number[] {
  const serverSignBytes = new MultiSig().signOne(
    tx,
    0,
    serverPrivateKey,
    TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID,
  );

  return Array.from(serverSignBytes);
}
