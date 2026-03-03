// MultisigPool TypeScript SDK
// 多签池 TypeScript 实现

// ============================================================================
// 类型定义导出
// ============================================================================
export * from './types';

// ============================================================================
// 加密工具导出
// ============================================================================
export * from './crypto/go_rfc6979';

// ============================================================================
// 脚本库导出
// ============================================================================
export { default as MultiSig } from './libs/MULTISIG';
export { default as P2PK } from './libs/P2PK';
export { default as P2PKH } from './libs/P2PKH';

// ============================================================================
// 双端点模块导出
// ============================================================================
export * from './dual_endpoint';

// ============================================================================
// 三端点模块导出
// ============================================================================
export * from './triple_endpoint';

// ============================================================================
// 兼容性接口（保持向后兼容）
// ============================================================================
export interface MultisigPool {
  id: string;
  name: string;
  threshold: number;
  participants: string[];
  status: 'active' | 'inactive' | 'suspended';
}

export interface Transaction {
  id: string;
  poolId: string;
  amount: bigint;
  recipient: string;
  signatures: Map<string, string>;
  status: 'pending' | 'signed' | 'executed' | 'rejected';
  createdAt: Date;
}

export class MultisigPoolClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:8080') {
    this.baseUrl = baseUrl;
  }

  /**
   * 创建多签池
   */
  async createPool(name: string, threshold: number, participants: string[]): Promise<MultisigPool> {
    const response = await fetch(`${this.baseUrl}/api/pools`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        threshold,
        participants,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create pool: ${response.statusText}`);
    }

    return response.json() as Promise<MultisigPool>;
  }

  /**
   * 获取多签池信息
   */
  async getPool(poolId: string): Promise<MultisigPool> {
    const response = await fetch(`${this.baseUrl}/api/pools/${poolId}`);

    if (!response.ok) {
      throw new Error(`Failed to get pool: ${response.statusText}`);
    }

    return response.json() as Promise<MultisigPool>;
  }

  /**
   * 创建交易
   */
  async createTransaction(poolId: string, amount: bigint, recipient: string): Promise<Transaction> {
    const response = await fetch(`${this.baseUrl}/api/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        poolId,
        amount: amount.toString(),
        recipient,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create transaction: ${response.statusText}`);
    }

    return response.json() as Promise<Transaction>;
  }

  /**
   * 签署交易
   */
  async signTransaction(txId: string, participantId: string, signature: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/transactions/${txId}/sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        participantId,
        signature,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to sign transaction: ${response.statusText}`);
    }
  }
}

// 默认导出
export default MultisigPoolClient; 