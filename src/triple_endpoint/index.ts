/**
 * Triple Endpoint Pool 模块
 * 
 * 这个模块包含了三方多签交易的相关功能：
 * 1. 创建三方多签基础交易（资金池）
 * 2. 从多签资金池中花费资金
 * 3. 服务器端签名处理
 * 4. 客户端交易更新和重新签名
 * 5. 服务器端更新签名处理
 * 6. 脚本工具和签名验证
 * 
 * 对应 Go 代码中的：
 * - triple_endpoint_pool_1base_tx.go
 * - triple_endpoint_pool_2client_spend_tx.go
 * - triple_endpoint_pool_3server_sign.go
 * - triple_endpoint_pool_4client_spend_tx_update.go
 * - triple_endpoint_pool_5server_sign_update.go
 * - triple_endpoint_pool_script.go
 */
// import {  } from './triple_endpoint_pool_5server_sign_update';

export * from './1base_tx';
export * from './2client_spend_tx';
export * from './3server_sign';
export * from './4client_spend_tx_update';
export * from './5server_sign_update';
export * from './0script';
// Verification helpers (non-breaking additions)
export * from './6verify';


// 重新导出类型定义
// export type {
//   BuildDualFeePoolBaseTxResponse
// } from '../tx/types';

// export class TripleEndpointPool extends TripleEndpointPool_5server_sign_update {
  
// }
