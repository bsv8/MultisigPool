import Transaction from '@bsv/sdk/transaction/Transaction';

/**
 * UTXO 类型定义
 * 与 Go 代码中的 pkg.UTXO 保持一致
 */
export interface UTXO {
  txid: string;
  vout: number;
  satoshis: number;
}

/**
 * 双端费用池基础交易响应类型
 * 与 Go 代码中的 BuildStep1Response 保持一致
 */
export interface BuildDualFeePoolBaseTxResponse {
  tx: Transaction;
  amount: number;
  index: number;
} 