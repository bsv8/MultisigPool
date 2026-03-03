import { PrivateKey, PublicKey } from '@bsv/sdk/primitives';
// import Script from '@bsv/sdk/script/Script';
import Transaction from '@bsv/sdk/transaction/Transaction';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';
// import { BaseChain } from '../tx/BaseChain';
// import type { UTXO, BuildDualFeePoolBaseTxResponse } from '../tx/types';
// import { TripleEndpointPool_1base_tx } from './triple_endpoint_pool_1base_tx';
// import OP from '@bsv/sdk/script/OP';
// import LockingScript from '@bsv/sdk/script/LockingScript';
// import UnlockingScript from '@bsv/sdk/script/UnlockingScript';
// import { fromBase58Check } from '@bsv/sdk/primitives/utils';
import MultiSig from '../libs/MULTISIG';
import P2PKH from '../libs/P2PKH';
// import unlock from 'lucide-svelte/icons/unlock';

// 定义 SigHash 常量，与 Go SDK 保持一致
// const SigHash = {
//   SIGHASH_ALL: TransactionSignature.SIGHASH_ALL,
//   FORKID: TransactionSignature.SIGHASH_FORKID
// };

// 定义返回类型
// interface BuildTripleSpendTxResponse {
//   tx: Transaction;
//   clientSignBytes: Buffer;
//   amount: number;
// }

interface TripleSpendTxResponse {
  tx: Transaction;
  clientSignBytes: Buffer;
  amount: number;
}



  



  /**
   * 构建三方多签花费交易
   * @param aTx A方的基础交易
   * @param serverValue 服务器提供的金额
   * @param endHeight 锁定到的区块高度
   * @param serverPublicKey 服务器公钥
   * @param aPrivateKey A方私钥
   * @param bPublicKey B方公钥
   * @returns 完整的交易、客户端签名和金额
   */
  export async function tripleBuildFeePoolSpendTX(
    prevTxId: string,
    serverValue: number,
    endHeight: number,
    serverPublicKey: PublicKey,
    aPrivateKey: PrivateKey,
    bPublicKey: PublicKey,
    feeRate: number,
  ): Promise<TripleSpendTxResponse> {
    try {
      // const prevTxId = aTx.id('hex');
      const aPublicKey = aPrivateKey.toPublicKey();
      const aAddress = aPublicKey.toAddress();
      const bAddress = bPublicKey.toAddress();
      
      // 创建交易对象
      const tx = new Transaction();
      tx.lockTime = endHeight;
      
      // 创建前一个交易的多签锁定脚本
      const prevLockingScript = new MultiSig().lock([serverPublicKey, aPublicKey, bPublicKey], 2);
      const fakeUnlockScript = MultiSig.createFakeSign(2);
      
      // 添加输入（多签 UTXO）
      tx.addInput({
        sourceTXID: prevTxId,
        sourceOutputIndex: 0,
        unlockingScript: fakeUnlockScript,
        sequence: 1, // 设置序列号为1
      });

      tx.inputs[0].sourceTransaction = new Transaction();
      tx.inputs[0].sourceTransaction.outputs = [];
      tx.inputs[0].sourceTransaction.outputs[0] = {
        satoshis: serverValue,
        lockingScript: prevLockingScript
      };
      
      // 创建服务器找零脚本（P2PKH）
      const serverChangeScript = new P2PKH().lock(bPublicKey);
      
      // 添加服务器输出
      tx.addOutput({
        lockingScript: serverChangeScript,
        satoshis: 0, // 初始为0，后续会更新
      });
      
      // 创建客户端找零脚本（P2PKH）
      const clientChangeScript = new P2PKH().lock(aPublicKey);
      
      // 添加客户端输出
      tx.addOutput({
        lockingScript: clientChangeScript,
        satoshis: serverValue, // 初始设置为服务器提供的金额
      });
      
      // 计算交易大小和费用
      const txSize = tx.toBinary().length;
      let fee = Math.floor((txSize / 1000.0) * feeRate);
      
      if (serverValue < fee) {
        throw new Error(`余额不足，需要 ${fee}，拥有 ${serverValue}`);
      }
      
      if (fee === 0) {
        fee = 1; // 最低手续费为 1 satoshi
      }
      
      // 更新客户端输出金额（扣除手续费）
      tx.outputs[1].satoshis = serverValue - fee;

      console.log('------------------------------- BuildOneB success');
      console.log('交易:', tx.toHex());
      
      // 创建 A 方签名
      const SignOne = new MultiSig().signOne(
        tx, 
        0, 
        aPrivateKey, 
        TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID
      );

      console.log('A方签名字节:', SignOne.toString('hex'));
      
      return {
        tx: tx,
        clientSignBytes: SignOne,
        amount: serverValue - fee
      };
    } catch (error) {
      console.error('BuildTripleFeePoolSpendTX error:', error);
      throw error;
    }
  }
// }