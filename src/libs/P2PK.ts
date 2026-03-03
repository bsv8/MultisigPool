/**
 * P2PK (Pay To Public Key) 脚本模板
 * 
 * 本类提供创建 Pay To Public Key 锁定和解锁脚本的方法，包括使用私钥解锁 P2PK UTXO。
 * 与 P2PKH 不同，P2PK 直接使用公钥而不是公钥哈希。
 */

import OP from '@bsv/sdk/script/OP'
import type ScriptTemplate from '@bsv/sdk/script/ScriptTemplate'
import LockingScript from '@bsv/sdk/script/LockingScript'
import UnlockingScript from '@bsv/sdk/script/UnlockingScript'
import Transaction from '@bsv/sdk/transaction/Transaction'
import PrivateKey from '@bsv/sdk/primitives/PrivateKey'
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature'
import { sha256 } from '@bsv/sdk/primitives/Hash'
import Script from '@bsv/sdk/script/Script'
import PublicKey from '@bsv/sdk/primitives/PublicKey'

function verifyTruthy<T>(v: T | undefined): T {
  if (v == null) throw new Error('must have value')
  return v
}

export default class P2PK implements ScriptTemplate {
  /**
   * 为给定的公钥创建 P2PK 锁定脚本
   *
   * @param {PublicKey} pubkey - 公钥对象
   * @returns {LockingScript} - P2PK 锁定脚本
   */
  lock(pubkey: PublicKey): LockingScript {
    // 获取公钥的压缩格式编码
    const data = pubkey.encode(true) as number[]
    
    return new LockingScript([
      { op: data.length, data },
      { op: OP.OP_CHECKSIG }
    ])
  }

  /**
   * 创建一个函数，用于生成 P2PK 解锁脚本及其签名和长度估计
   *
   * 返回的对象包含：
   * 1. `sign` - 一个函数，当使用交易和输入索引调用时，生成适用于 P2PK 锁定输出的解锁脚本
   * 2. `estimateLength` - 一个函数，返回解锁脚本的估计长度（字节）
   *
   * @param {PrivateKey} privateKey - 用于签名交易的私钥
   * @param {number} sigHashType - 签名哈希类型，默认为 SIGHASH_ALL | SIGHASH_FORKID
  //  * @param {boolean} anyoneCanPay - 标志，指示签名是否允许稍后添加其他输入
   * @param {number} sourceSatoshis - 可选。被解锁的金额。否则需要 input.sourceTransaction
   * @param {Script} lockingScript - 可选。锁定脚本。否则需要 input.sourceTransaction
   * @returns {Object} - 包含 `sign` 和 `estimateLength` 函数的对象
   */
  unlock(
    privateKey: PrivateKey,
    signatureScope: number = TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID,
    // anyoneCanPay: boolean = false,
    sourceSatoshis?: number,
    lockingScript?: Script
  ): {
    sign: (tx: Transaction, inputIndex: number) => Promise<UnlockingScript>
    estimateLength: () => Promise<74>
  } {
    return {
      sign: async (tx: Transaction, inputIndex: number) => {
        // let signatureScope = sigHashType
        // if (anyoneCanPay) {
        //   signatureScope |= TransactionSignature.SIGHASH_ANYONECANPAY
        // }

        const input = tx.inputs[inputIndex]

        const otherInputs = tx.inputs.filter(
          (_, index) => index !== inputIndex
        )

        const sourceTXID = input.sourceTXID ?? input.sourceTransaction?.id('hex')
        if (sourceTXID == null || sourceTXID === undefined) {
          throw new Error(
            'The input sourceTXID or sourceTransaction is required for transaction signing.'
          )
        }
        if (sourceTXID === '') {
          throw new Error(
            'The input sourceTXID or sourceTransaction is required for transaction signing.'
          )
        }
        sourceSatoshis ||=
          input.sourceTransaction?.outputs[input.sourceOutputIndex].satoshis
        if (sourceSatoshis == null || sourceSatoshis === undefined) {
          throw new Error(
            'The sourceSatoshis or input sourceTransaction is required for transaction signing.'
          )
        }
        lockingScript ||=
          input.sourceTransaction?.outputs[input.sourceOutputIndex]
            .lockingScript
        if (lockingScript == null) {
          throw new Error(
            'The lockingScript or input sourceTransaction is required for transaction signing.'
          )
        }

        const preimage = TransactionSignature.format({
          sourceTXID,
          sourceOutputIndex: verifyTruthy(input.sourceOutputIndex),
          sourceSatoshis,
          transactionVersion: tx.version,
          otherInputs,
          inputIndex,
          outputs: tx.outputs,
          inputSequence: verifyTruthy(input.sequence),
          subscript: lockingScript,
          lockTime: tx.lockTime,
          scope: signatureScope
        })

        const rawSignature = privateKey.sign(sha256(preimage))
        const sig = new TransactionSignature(
          rawSignature.r,
          rawSignature.s,
          signatureScope
        )
        const sigForScript = sig.toChecksigFormat()
        
        // P2PK 解锁脚本只需要签名，不需要公钥
        return new UnlockingScript([
          { op: sigForScript.length, data: sigForScript }
        ])
      },
      estimateLength: async () => {
        // 签名 (1+73)
        // 注意：我们为每个元素的长度添加 1，因为相关的 OP_PUSH
        return 74
      }
    }
  }
}
