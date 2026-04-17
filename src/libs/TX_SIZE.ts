import Transaction from '@bsv/sdk/transaction/Transaction';

// estimateSerializedTxSize 只用于估算手续费，不污染业务交易对象内部缓存。
// 这里复制一份交易壳对象做序列化，避免先 toBinary() 再改输出导致 txid/hex 失真。
export function estimateSerializedTxSize(tx: Transaction): number {
  const txForEstimate = new Transaction(tx.version, [...tx.inputs], [...tx.outputs], tx.lockTime);
  return txForEstimate.toBinary().length;
}
