import { PrivateKey, PublicKey } from '@bsv/sdk/primitives';
// import Script from '@bsv/sdk/script/Script';
import Transaction from '@bsv/sdk/transaction/Transaction';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';
// import { BaseChain } from '../tx/BaseChain';
import type { UTXO, BuildDualFeePoolBaseTxResponse } from '../types';
// import { TripleEndpointPoolScript } from './triple_endpoint_pool_0script';
// import OP from '@bsv/sdk/script/OP';
// import LockingScript from '@bsv/sdk/script/LockingScript';
// import UnlockingScript from '@bsv/sdk/script/UnlockingScript';
import MultiSig from '../libs/MULTISIG';
import P2PKH from '../libs/P2PKH';
// import type { ApiConstructorParams } from '../2api/1base-api';
// import type { BaseService } from '../../services/base/BaseService';
// import type { APIService } from '../../services/api/APIService';
// import type { TripleEndpointService } from '../endpoints/TripleEndpointService';
// import type { TripleEndpointServiceConfig } from '../../services/types/configs';

// 定义 SigHash 常量，与 Go SDK 保持一致
// const SigHash = {
//   SIGHASH_ALL: TransactionSignature.SIGHASH_ALL,
//   FORKID: TransactionSignature.SIGHASH_FORKID
// };

// export interface TripleConstructorParams extends ApiConstructorParams {
//   feeRate: number;
// }

/**
 * TripleEndpointPool_1base_tx 类用于创建三方多签交易
 * 这是一个 2-of-3 多签实现，需要三方中的两方签名才能解锁资金
 */
// export class TripleEndpointPool_1base_tx extends TripleEndpointPoolScript {
//   protected feeRate: number;
//   protected baseService: BaseService;
//   protected apiService: APIService;
//   /**
//    * 构造函数
//    * @param isMainnet 是否使用主网
//    * @param feeRate 费率（sat/byte），默认为 0.5
//    */
//   constructor(
//     baseService: BaseService,
//     apiService: APIService,
//     config: TripleEndpointServiceConfig
//   ) {
//     super();
//     this.baseService = baseService;
//     this.apiService = apiService;
//     this.feeRate = config.feeRate; // 默认费率为 0.5 sat/byte
//   }

  /**
   * 构建三方多签基础交易
   * @param clientUtxos 客户端 UTXO 列表
   * @param clientPrivateKey 客户端私钥
   * @param serverPublicKey 服务器公钥
   * @param thirdPartyPublicKey 第三方公钥
   * @returns 交易对象、金额和输出索引
   */
  export async function tripleBuildFeePoolBaseTx(
    clientUtxos: UTXO[],
    serverPublicKey: PublicKey,
	  aPrivateKey: PrivateKey,
    bPublicKey: PublicKey,
    feeRate: number,
  ): Promise<BuildDualFeePoolBaseTxResponse> {
    // 检查输入参数
    if (!clientUtxos || clientUtxos.length === 0) {
      throw new Error('客户端 UTXO 列表不能为空');
    }
    
    const clientPublicKey = aPrivateKey.toPublicKey();
    const clientAddress = clientPublicKey.toAddress();

    // 创建解锁脚本模板
    const sigHashType = TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID;
    // 注意：我们不能在这里创建统一的解锁脚本模板，因为每个输入需要不同的 sourceSatoshis

    // 前序脚本 - 创建 P2PKH 锁定脚本，与 Go 代码中的 prevScript 对应
    const p2pkhLock = new P2PKH().lock(clientPublicKey);
    // 确保锁定脚本正确创建
    if (!p2pkhLock || !p2pkhLock.chunks) {
      throw new Error('P2PKH 锁定脚本创建失败');
    }
    
    // 创建交易对象
    const tx = new Transaction();
    
    // 添加客户端 UTXOs 作为输入
    let totalValue = 0;
    for (const utxo of clientUtxos) {
      // 为每个输入创建单独的解锁脚本模板，并提供 sourceSatoshis
      const sigHashType = TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID;

      // 使用前序脚本创建解锁脚本模板 - 与Go代码中的aUnlockingScriptTemplate对应
      const p2pkhUnlock = new P2PKH().unlock(
        aPrivateKey, 
        sigHashType, 
        utxo.satoshis, // 提供 UTXO 金额信息
        p2pkhLock // 使用前序锁定脚本，而不是从UTXO获取
      );
      
      // 添加输入 - 与Go代码中的AddInputFrom对应
      tx.addInput({
        sourceTXID: utxo.txid,
        sourceOutputIndex: utxo.vout,
        unlockingScriptTemplate: p2pkhUnlock,
        sequence: 0xffffffff, // 标准sequence值
      });
      
      // 如果需要，可以设置输入的源交易锁定脚本
      const inputIndex = tx.inputs.length - 1;
      if (tx.inputs[inputIndex]) {
        // 可以考虑在这里设置源交易锁定脚本，如果SDK支持的话
      }
      totalValue += utxo.satoshis;
    }
    
    // 创建 2-of-3 多签输出脚本 - 使用 MultiSig.createLockingScript 函数构建
    // 注意公钥顺序：服务器、客户端A、客户端B
    const lockingScript = new MultiSig().lock([serverPublicKey, clientPublicKey, bPublicKey], 2);
    
    // 添加多签输出
    tx.addOutput({
      lockingScript: lockingScript,
      satoshis: totalValue, // 初始设置为总金额，后续会减去手续费
    });
    
    // 为每个输入签名，以便正确估计交易大小
    for (let i = 0; i < tx.inputs.length; i++) {
      const unlockingScript = await tx.inputs[i].unlockingScriptTemplate!.sign(tx, i);
      tx.inputs[i].unlockingScript = unlockingScript;
    }
    
    // 计算交易大小（字节）和手续费
    const txSize = tx.toBinary().length;
    let fee = Math.floor((txSize / 1000.0) * feeRate);
    if (fee === 0) {
      fee = 1; // 最低手续费为 1 satoshi
    }
    
    console.debug(`计算手续费: ${fee} satoshis, 交易大小: ${txSize} bytes, 费率: ${feeRate} sat/byte`);
    
    // 更新输出金额，减去手续费
    tx.outputs[0].satoshis = totalValue - fee;
    
    // 重新签名所有输入
    for (let i = 0; i < tx.inputs.length; i++) {
      const unlockingScript = await tx.inputs[i].unlockingScriptTemplate!.sign(tx, i);
      tx.inputs[i].unlockingScript = unlockingScript;
    }
    
    return {
      tx,
      amount: totalValue - fee, // 返回扣除手续费后的金额
      index: 0, // 多签输出的索引
    };
  }
// }
