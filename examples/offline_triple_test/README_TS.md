# TypeScript 版本 - 离线三方多签测试

这是 Go 版本 `main.go` 的 TypeScript 实现，用于测试三方多签交易的完整流程。

## 功能说明

这个测试演示了三方多签交易的完整生命周期：

1. **基础交易创建** - 将客户端 UTXO 转换为 2-of-3 多签输出
2. **花费交易构建** - 从多签地址创建花费交易
3. **签名流程** - Client1 和 Server 签名
4. **交易更新** - 调整 Client1 和 Client2 的资金分配
5. **协商签名** - Client1 和 Client2 重新签名确认新分配
6. **费用池关闭** - 最终关闭交易，可立即广播

## 运行方式

### 前提条件

确保已安装项目依赖：

```bash
npm install
```

### 运行测试

```bash
# 使用 ts-node 直接运行
npx ts-node examples/offline_triple_test/main.ts

# 或者先编译再运行
npm run build
node dist/examples/offline_triple_test/main.js
```

## 测试数据

测试使用固定的私钥和 UTXO 数据，确保结果的可重现性：

- **Client1 私钥**: `2796e78fad7d383fa5236607eba52d9a1904325daf9b4da3d77be5ad15ab1dae`
- **Client2 私钥**: `a682814ac246ca65543197e593aa3b2633b891959c183416f54e2c63a8de1d8c`
- **Server 私钥**: `e6d4d7685894d2644d1f4bf31c0b87f3f6aa8a3d7d4091eaa375e81d6c9f9091`
- **固定 UTXO**: `95911b4d18002cd89aa04692ff59ecc62902c481c5cc5fa659370cb6a91752e6:1` (55603 satoshis)

## 预期输出

测试会验证每个步骤的输出是否与预期值匹配，包括：

- 基础交易 hex
- 各种签名值
- 完整交易 hex
- 更新后的交易
- 最终关闭交易

## 与 Go 版本的对应关系

| Go 函数 | TypeScript 函数 |
|---------|----------------|
| `BuildTripleFeePoolBaseTx` | `tripleBuildFeePoolBaseTx` |
| `BuildTripleFeePoolSpendTX` | `tripleBuildFeePoolSpendTX` |
| `SpendTXTripleFeePoolBSign` | `tripleSpendTXFeePoolBSign` |
| `TripleFeePoolLoadTx` | `tripleFeePoolLoadTx` |
| `ClientATripleFeePoolSpendTXUpdateSign` | `tripleClientAFeePoolSpendTXUpdateSign` |
| `ClientBTripleFeePoolSpendTXUpdateSign` | `tripleClientBFeePoolSpendTXUpdateSign` |
| `MergeTripleFeePoolSigForSpendTx` | `tripleMergeFeePoolSigForSpendTx` |

## 交易流程

1. **Step 1**: 创建基础交易 (Client1 UTXO → 2-of-3 多签)
2. **Step 2**: 构建花费交易 (多签 → Client1 + Client2 输出)
3. **Step 3**: Client1 签名
4. **Step 4**: Server 签名并合并
5. **Step 5**: Client1 更新签名 (调整分配)
6. **Step 6**: Client2 同意并签名
7. **Final**: 关闭费用池 (设置最终 locktime 和 sequence)

## 广播顺序

1. 首先广播基础交易 (Step 1)
2. 等待确认
3. 然后广播最终交易

## 测试网络

所有地址和交易都在 BSV 测试网络上，可以通过以下浏览器查看：
- https://test.whatsonchain.com/

## 注意事项

- 这是一个离线测试，不会实际广播交易到网络
- 所有签名和交易构建都在本地完成
- 测试验证了与 Go 版本的完全兼容性