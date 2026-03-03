import { PublicKey } from '@bsv/sdk/primitives';
import Script from '@bsv/sdk/script/Script';
import Transaction from '@bsv/sdk/transaction/Transaction';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';
import { hash256 } from '@bsv/sdk/primitives/Hash';
import * as ECDSA from '@bsv/sdk/primitives/ECDSA';
import BigNumber from '@bsv/sdk/primitives/BigNumber';

/**
 * 轻量级 DER 解析器，用于提取 ECDSA 签名的 r、s。
 * 期望输入为 DER 序列：0x30 len 0x02 rlen r 0x02 slen s。
 */
function parseDERSignature(derBytes: Uint8Array): { r: BigNumber; s: BigNumber } {
  if (derBytes.length < 8 || derBytes[0] !== 0x30) {
    throw new Error('Invalid DER signature');
  }
  let idx = 2; // 跳过 0x30 与总长度字段。
  if (derBytes[idx] !== 0x02) {
    throw new Error('Invalid DER: missing R integer');
  }
  idx++;
  const rlen = derBytes[idx++];
  const rBytes = derBytes.slice(idx, idx + rlen);
  idx += rlen;
  if (derBytes[idx] !== 0x02) {
    throw new Error('Invalid DER: missing S integer');
  }
  idx++;
  const slen = derBytes[idx++];
  const sBytes = derBytes.slice(idx, idx + slen);

  // 若存在前导 0 字节则移除，保持与 Go 实现一致。
  const rHex = Buffer.from(rBytes).toString('hex').replace(/^00+/, '') || '0';
  const sHex = Buffer.from(sBytes).toString('hex').replace(/^00+/, '') || '0';
  return {
    r: new BigNumber(rHex, 16),
    s: new BigNumber(sHex, 16),
  };
}

export interface VerifyParams {
  tx: Transaction;
  inputIndex: number; // 本仓库内通常取 0。
  lockingScript: Script; // 对应多签的赎回脚本。
  sourceSatoshis: number;
  publicKey: PublicKey; // 签名者公钥。
  signatureBytes: number[]; // DER 编码签名 + SigHash 标志。
  expectedSigHashFlag?: number; // 默认值为 ALL|FORKID。
}

/**
 * 在既定交易上下文中验证单个输入的签名。
 * 过程不会修改原始交易，返回布尔结果。
 */
export function verifyInputSignature(params: VerifyParams): boolean {
  const {
    tx,
    inputIndex,
    lockingScript,
    sourceSatoshis,
    publicKey,
    signatureBytes,
    expectedSigHashFlag = TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID,
  } = params;

  if (!signatureBytes || signatureBytes.length < 10) return false;
  const flag = signatureBytes[signatureBytes.length - 1];
  if (flag !== expectedSigHashFlag) return false;

  const derOnly = Uint8Array.from(signatureBytes.slice(0, -1));
  let sig: TransactionSignature;
  try {
    const { r, s } = parseDERSignature(derOnly);
    sig = new TransactionSignature(r, s, flag);
  } catch (_e) {
    return false;
  }

  // 以与签名路径相同的方式构建 SigHash 输入。
  const input = tx.inputs[inputIndex];
  if (!input) return false;

  const sighashData = TransactionSignature.format({
    sourceTXID: input.sourceTXID || '',
    sourceOutputIndex: input.sourceOutputIndex,
    sourceSatoshis,
    transactionVersion: tx.version,
    otherInputs: [],
    outputs: tx.outputs,
    inputIndex,
    subscript: lockingScript,
    inputSequence: input.sequence || 1,
    lockTime: tx.lockTime,
    scope: expectedSigHashFlag,
  });

  const msgHashHex = hash256(sighashData);
  try {
    return ECDSA.verify(new BigNumber(msgHashHex, 16), sig, publicKey);
  } catch (_err) {
    return false;
  }
}
