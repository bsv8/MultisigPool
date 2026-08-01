# TypeScript / Go / Rust v4 交叉验证

共享 fixture 的协议字段必须是 `protocol: bitfs.pool.v4` 和 `version: 4`，并保存 Buyer、Seller、Arbiter 公钥、锁定脚本、池 outpoint 和池金额。

三种实现消费相同的角色顺序 `[Buyer, Seller, Arbiter]` 和相同的绝对 `sellerAmount`、`arbiterAmount`。Rust 直接调用发布 crate 的仲裁池 API；三者比较锁定脚本、funding、状态、txid、签名和三种两两合并结果的字节。

```bash
npm run build
npm test -- --runInBand
go test ./...
cd rust && cargo test
```

任一比较失败都直接退出，禁止按 v2/v3 旧协议重试。
