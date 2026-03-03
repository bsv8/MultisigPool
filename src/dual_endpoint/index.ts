/**
 * Dual Endpoint Pool 模块
 * 
 * 这个模块包含了双端多签交易的相关功能：
 * 1. 创建双端多签基础交易（资金池）
 * 
 * 对应 Go 代码中的：
 * - dual_endpoint_pool_1base_tx.go
 */


// 重新导出函数和类型定义
export {
  createDualMultisigScript,
  createP2PKHScript,
  buildDualFeePoolBaseTx,
  validateTransaction,
  getTransactionSummary,
} from './1base_tx';


export {  
  createFakeDualMultisigUnlockScript,
  subBuildDualFeePoolSpendTX,
  spendTXDualFeePoolClientSign,
  buildDualFeePoolSpendTX,
} from './2client_spend_tx';

export {
  spendTXServerSign,
} from './3server_sign';

export {
  loadTx as loadDualFeePoolTx,
  clientDualFeePoolSpendTXUpdateSign,
  FINAL_LOCKTIME,
} from './4client_spend_tx_update';

export {
  serverDualFeePoolSpendTXUpdateSign,
} from './5server_sign_update';

// Verification helpers (non-breaking additions)
export {
  serverVerifyClientSpendSig,
  clientVerifyServerSpendSig,
  serverVerifyClientUpdateSig,
  clientVerifyServerUpdateSig,
} from './6verify';
