# 在线区块链测试 - 三方费用池

使用真实的测试网络进行三方费用池完整流程测试。

## 运行方式

```bash
FEEPOOL_CLIENT1_PRIV=2796e78fad7d383fa5236607eba52d9a1904325daf9b4da3d77be5ad15ab1dae \
FEEPOOL_CLIENT2_PRIV=a682814ac246ca65543197e593aa3b2633b891959c183416f54e2c63a8de1d8c \
FEEPOOL_SERVER_PRIV=e6d4d7685894d2644d1f4bf31c0b87f3f6aa8a3d7d4091eaa375e81d6c9f9091 \
go run examples/online_triple_test/main.go
```

## 功能

- 从 whatsonchain.com API 获取真实 UTXO
- 获取当前区块高度
- 广播交易到测试网络
- 完整的端到端三方费用池测试

## 三方费用池流程

1. **基础交易**: Client1 的 UTXO 转换为 2-of-3 多签输出
2. **花费交易**: 多签输出在 Client1 和 Client2 之间分配
3. **正常流程**: Client1 和 Client2 协商完成金额分配
4. **争议流程**: 如果 Client1 反悔，Client2 可申请 Server 仲裁
5. **更新签名**: 调整 Client1 和 Client2 之间的金额分配
6. **关闭费用池**: 设置最终的 locktime 和 sequence

## 参与方

- **Client1**: 资金提供者（发起方），提供初始资金
- **Client2**: 资金接收者，与 Client1 协商分配
- **Server**: 仲裁者，不参与金额分配，只在争议时仲裁

## 注意

- 需要 Client1 地址有足够的测试币才能运行
- 使用 2-of-3 多签方案，任意两方签名即可
- 支持动态修改金额分配