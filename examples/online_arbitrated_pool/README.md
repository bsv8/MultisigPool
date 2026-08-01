# Online ArbitratedPool

该示例连接 WhatsOnChain BSV testnet，读取 Buyer 地址的 UTXO 和当前区块高度，然后构建 Buyer/Seller/Arbiter v3 的 2-of-3 funding、opening state、三份签名和三种两两合并结果。

需要设置：

```bash
export FEEPOOL_BUYER_PRIV=<Buyer 的 testnet 私钥十六进制>
export FEEPOOL_SELLER_PRIV=<Seller 的私钥十六进制>
export FEEPOOL_ARBITER_PRIV=<Arbiter 的私钥十六进制>
go run ./examples/online_arbitrated_pool
```

锁定脚本顺序固定为 `[Buyer, Seller, Arbiter]`，状态资金输出顺序为 `[Buyer, Seller]`，Arbiter 不获得资金输出。示例不会自动广播交易，也不会打印私钥；请先为 Buyer 地址准备超过 500 satoshis 的 testnet UTXO。
