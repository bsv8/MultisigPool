# Offline ArbitratedPool

该示例使用确定性 Buyer、Seller、Arbiter 密钥演示 v3 的 2-of-3 池。锁定脚本顺序是 `[Buyer, Seller, Arbiter]`，资金输出顺序是 `[Buyer, Seller]`。

Buyer+Seller、Buyer+Arbiter、Seller+Arbiter 三种签名组合都必须先验签，再按锁定脚本顺序合并。
