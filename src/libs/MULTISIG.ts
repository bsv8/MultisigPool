import { PrivateKey, PublicKey } from '@bsv/sdk/primitives';
import Script from '@bsv/sdk/script/Script';
import Transaction from '@bsv/sdk/transaction/Transaction';
import OP from '@bsv/sdk/script/OP';
// 引入需要的工具类
import { hash256 } from '@bsv/sdk/primitives/Hash';
import * as ECDSA from '@bsv/sdk/primitives/ECDSA';
import BigNumber from '@bsv/sdk/primitives/BigNumber';
import type ScriptChunk from '@bsv/sdk/script/ScriptChunk';
import type ScriptTemplate from '@bsv/sdk/script/ScriptTemplate';
import type ScriptTemplateUnlock from '@bsv/sdk/script/ScriptTemplateUnlock';
import LockingScript from '@bsv/sdk/script/LockingScript';
import UnlockingScript from '@bsv/sdk/script/UnlockingScript';
import { toHex } from '@bsv/sdk/primitives/utils';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';
import { generateKGoStyle, signGoCompatible } from '../crypto/go_rfc6979';

// 错误定义
const Errors = {
  INVALID_PUBLIC_KEYS: new Error('invalid public keys'),
  NO_PRIVATE_KEYS: new Error('private keys not supplied'),
  INVALID_M: new Error('invalid m value'),
  EMPTY_PREVIOUS_TX: new Error('empty previous tx')
};

/**
 * MultiSig 表示 M-of-N 多重签名模板
 */
export default class MultiSig implements ScriptTemplate {
  // private privateKeys: PrivateKey[];
  // public publicKeys: PublicKey[];
  // public m: number; // 需要的签名数量
  // public n: number; // 公钥总数
  // public sigHashType: number;

  /**
   * 创建一个用于解锁的 MultiSig 实例
   * @param privateKeys 用于签名的私钥数组
   * @param publicKeys 公钥数组
   * @param m 需要的签名数量 (m-of-n)
   * @param sigHashType SIGHASH 类型 (默认: SIGHASH_ALL | SIGHASH_FORKID = 0x41)
   */
  // constructor(
  //   privateKeys: PrivateKey[],
  //   publicKeys: PublicKey[],
  //   m: number,
  //   sigHashType: number = 0x41 // SIGHASH_ALL | SIGHASH_FORKID
  // ) {
  //   if (publicKeys.length === 0 || publicKeys.length > 20) {
  //     throw Errors.INVALID_PUBLIC_KEYS;
  //   }
  //   if (m <= 0 || m > publicKeys.length) {
  //     throw Errors.INVALID_M;
  //   }

  //   this.privateKeys = privateKeys;
  //   this.publicKeys = publicKeys;
  //   this.m = m;
  //   this.n = publicKeys.length;
  //   this.sigHashType = sigHashType;
  // }

  /**
   * 创建 P2MS (Pay to Multi-Signature) 锁定脚本
   * @param publicKeys 公钥数组
   * @param m 需要的签名数量 (m-of-n)
   */
  // public static createLockingScript(publicKeys: PublicKey[], m: number): Script {
  //   const n = publicKeys.length;
  //   if (m <= 0 || m > n) {
  //     throw Errors.INVALID_M;
  //   }
  //   if (n === 0 || n > 20) {
  //     throw Errors.INVALID_PUBLIC_KEYS;
  //   }

  //   // 创建空脚本并添加 OP_m
  //   const script = new Script([]);
  //   script.writeOpCode(OP.OP_1 + m - 1); // OP_1 + (m-1) = OP_m

  //   // 添加公钥
  //   for (const pubKey of publicKeys) {
  //     script.writeBin(pubKey.toDER() as number[]);
  //   }

  //   // 添加 N 值和 CHECKMULTISIG
  //   script.writeOpCode(OP.OP_1 + n - 1) // OP_1 + (n-1) = OP_n
  //     .writeOpCode(OP.OP_CHECKMULTISIG);

  //   return script;
  // }

  /**
   * 实现 ScriptTemplate 接口的 lock 方法
   * 创建锁定脚本
   * @param publicKeys 公钥数组
   * @param m 需要的签名数量 (m-of-n)
   */
  public lock(publicKeys: PublicKey[], m: number): LockingScript {
    // 直接在 lock 方法中创建多签锁定脚本，而不调用 createLockingScript
    const n = publicKeys.length;
    if (m <= 0 || m > n) {
      throw Errors.INVALID_M;
    }
    if (n === 0 || n > 20) {
      throw Errors.INVALID_PUBLIC_KEYS;
    }

    // 创建空脚本并添加 OP_m
    const script = new Script([]);
    script.writeOpCode(OP.OP_1 + m - 1); // OP_1 + (m-1) = OP_m

    // 添加公钥
    for (const pubKey of publicKeys) {
      script.writeBin(pubKey.toDER() as number[]);
    }

    // 添加 N 值和 CHECKMULTISIG
    script.writeOpCode(OP.OP_1 + n - 1) // OP_1 + (n-1) = OP_n
      .writeOpCode(OP.OP_CHECKMULTISIG);

    // 创建锁定脚本对象
    const lockingScript = new LockingScript();
    lockingScript.chunks = script.chunks;
    return lockingScript;
  }

  /**
   * 实现 ScriptTemplate 接口的 unlock 方法
   * 创建一个用于解锁的 ScriptTemplateUnlock 对象
   * @param privateKeys 用于签名的私钥数组
   * @param publicKeys 公钥数组
   * @param m 需要的签名数量 (m-of-n)
   * @param sigHashType SIGHASH 类型 (默认: SIGHASH_ALL | SIGHASH_FORKID = 0x41)
   */
  public unlock(privateKeys: PrivateKey[], publicKeys: PublicKey[], m: number, sigHashType: number = 0x41): ScriptTemplateUnlock {
    // const multiSig = new MultiSig(privateKeys, publicKeys, m, sigHashType);

    return {
      sign: async (tx: Transaction, inputIndex: number): Promise<UnlockingScript> => {
        const script = this.sign(tx, inputIndex, privateKeys, publicKeys, m, sigHashType);
        return new UnlockingScript(script.toBinary() as unknown as ScriptChunk[]);
      },
      estimateLength: async (tx: Transaction, inputIndex: number): Promise<number> => {
        return this.estimateLength(m);
      },
    };
  }

  /**
   * 创建一个用于解锁的 MultiSig 实例
   * @param privateKeys 用于签名的私钥数组
   * @param publicKeys 公钥数组
   * @param m 需要的签名数量 (m-of-n)
   * @param sigHashType SIGHASH 类型 (默认: SIGHASH_ALL | SIGHASH_FORKID = 0x41)
   */
  // public static createUnlocker(
  //   privateKeys: PrivateKey[],
  //   publicKeys: PublicKey[],
  //   m: number,
  //   sigHashType: number = 0x41 // SIGHASH_ALL | SIGHASH_FORKID
  // ): MultiSig {
  //   // 注释掉的检查，与原始 Go 代码保持一致
  //   // if (privateKeys.length < m) {
  //   //   throw Errors.NO_PRIVATE_KEYS;
  //   // }

  //   return new MultiSig(privateKeys, publicKeys, m, sigHashType);
  // }

  /**
   * 为多重签名创建解锁脚本
   * @param tx 要签名的交易
   * @param inputIndex 要签名的输入索引
   */
  public sign(tx: Transaction, inputIndex: number, privateKeys: PrivateKey[], publicKeys: PublicKey[], m: number, sigHashType: number = 0x41): Script {
    // 检查输入的源交易输出是否存在
    if (!tx.inputs[inputIndex].sourceTXID) {
      throw Errors.EMPTY_PREVIOUS_TX;
    }

    // 获取输入的源交易输出信息


    // 创建解锁脚本
    const script = new Script([]);
    script.writeOpCode(OP.OP_0); // OP_0 for CHECKMULTISIG bug

    // 使用所需数量的私钥进行签名
    for (let i = 0; i < m; i++) {
      const input = tx.inputs[i];
      const sourceSatoshis = input.sourceTransaction?.outputs[input.sourceOutputIndex]?.satoshis;
      // 创建多签锁定脚本
      const lockingScript = input.sourceTransaction?.outputs[input.sourceOutputIndex]?.lockingScript;
      // 使用 TransactionSignature.format 计算签名哈希
      const sighashData = TransactionSignature.format({
        sourceTXID: input.sourceTXID || '',
        sourceOutputIndex: input.sourceOutputIndex,
        sourceSatoshis: sourceSatoshis as number,
        transactionVersion: tx.version,
        otherInputs: tx.inputs.filter((_, idx) => idx !== inputIndex),
        outputs: tx.outputs,
        inputIndex: inputIndex,
        subscript: lockingScript as Script,
        inputSequence: input.sequence || 0xffffffff,
        lockTime: tx.lockTime,
        scope: sigHashType
      });

      // 对 sighashData 进行双重哈希 (Sha256d)，然后签名
      const hashBuf2 = hash256(sighashData);
      // Go-compatible deterministic k
      const kGo = generateKGoStyle(Buffer.from(privateKeys[i].toString(16).padStart(64,'0'), 'hex'), Buffer.from(hashBuf2));
      const sigObj = privateKeys[i].sign(
        Array.from(hashBuf2),
        undefined,
        true,
        () => new BigNumber(kGo.toString(16), 16)
      );

      // 添加带有 SIGHASH 类型的签名
      const signature = Buffer.concat([
        Buffer.from(sigObj.toDER()),
        Buffer.from([sigHashType])
      ]);

      // 将签名数据写入脚本
      script.writeBin([...new Uint8Array(signature)]);
    }

    return script;
  }

  /**
   * 为多重签名创建单个签名（部分签名）
   * @param tx 要签名的交易
   * @param inputIndex 要签名的输入索引
   * @param privateKey 用于签名的私钥
   */
  public signOne(tx: Transaction, inputIndex: number, privateKey: PrivateKey, sigHashType: number = 0x41): Buffer {
    // 检查输入的源交易输出是否存在
    if (!tx.inputs[inputIndex].sourceTXID) {
      throw Errors.EMPTY_PREVIOUS_TX;
    }

    // 获取输入的源交易输出信息
    const input = tx.inputs[inputIndex];
    const sourceSatoshis = input.sourceTransaction?.outputs[input.sourceOutputIndex]?.satoshis;

    // 创建多签锁定脚本 - 这里需要获取正确的锁定脚本
    // 假设已经设置在 input.unlockingScript 中
    const lockingScript = input.sourceTransaction?.outputs[input.sourceOutputIndex]?.lockingScript;

    if (!lockingScript) {
      throw new Error('锁定脚本未设置，无法生成签名');
    }

    // 确保 sourceSatoshis 不为 undefined
    if (sourceSatoshis === undefined) {
      throw new Error('源交易输出的 satoshis 值未设置，无法生成签名');
    }

    // 使用 TransactionSignature.format 计算签名哈希
    const params = {
      sourceTXID: input.sourceTXID || '',
      sourceOutputIndex: input.sourceOutputIndex,
      sourceSatoshis: sourceSatoshis as number, // 类型断言为 number，因为我们已经检查过它不是 undefined
      transactionVersion: tx.version,
      otherInputs: tx.inputs.filter((_, idx) => idx !== inputIndex),
      outputs: tx.outputs,
      inputIndex: inputIndex,
      subscript: lockingScript,
      inputSequence: input.sequence as number,
      lockTime: tx.lockTime,
      scope: sigHashType
    };

    const sighashData = TransactionSignature.format(params);

    // 对 sighashData 进行双重哈希 (Sha256d)，然后签名
    const hashBuf2 = hash256(sighashData);
    
    // Use our Go-compatible signature function
    const privateKeyHex = privateKey.toString(16).padStart(64, '0');
    const sighashHex = Buffer.from(hashBuf2).toString('hex');
    
    const goCompatibleSig = signGoCompatible(privateKeyHex, sighashHex);
    
    // Create TransactionSignature object from our Go-compatible signature
    const sigObj = new TransactionSignature(
      new BigNumber(goCompatibleSig.r, 16),
      new BigNumber(goCompatibleSig.s, 16),
      sigHashType
    );
    
    const sigDER = sigObj.toDER() as number[];

    // 返回带有 SIGHASH 类型的签名
    const signature = Buffer.concat([
      Buffer.from(sigDER),
      Buffer.from([sigHashType])
    ]);
    return signature;
  }

  /**
   * 估算解锁脚本的大小（字节）
   */
  public estimateLength(m: number): number {
    // OP_0 + M * (signature + sighash flag)
    return 1 + m * (71 + 1); // 71 bytes for DER signature + 1 byte for SIGHASH
  }

  /**
   * 创建假签名脚本，用于估算大小
   * @param m 需要的签名数量
   */
  public static createFakeSign(m: number): Script {
    // 创建空脚本
    const script = new Script([]);
    script.writeOpCode(OP.OP_0);

    // 添加假签名（72字节每个 + 1字节 SIGHASH）
    for (let i = 0; i < m; i++) {
      // 假签名数据：使用72字节的空数据模拟签名（最大DER签名长度）+ 1字节的空SigHashFlag
      const fakeSig = Buffer.alloc(72);
      const fakeSigWithType = Buffer.concat([fakeSig, Buffer.from([0])]);
      script.writeBin([...new Uint8Array(fakeSigWithType)]);
    }

    return script;
  }

  /**
   * 从多个签名构建脚本
   * @param signatures 签名缓冲区数组
   */
  public static buildSignScript(signatures: Buffer[]): Script {
    // 创建空脚本
    const script = new Script([]);
    script.writeOpCode(OP.OP_0);

    for (const sig of signatures) {
      script.writeBin([...new Uint8Array(sig)]);
    }

    return script;
  }

  /**
   * 获取此多重签名的锁定脚本
   */
  // public getLockingScript(): Script {
  //   return MultiSig.createLockingScript(this.publicKeys, this.m);
  // }
}
