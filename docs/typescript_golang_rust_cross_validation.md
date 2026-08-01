# TypeScript / Go / Rust v3 交叉验证

共享 fixture 的协议字段必须是 `protocol: bitfs.pool.v3` 和 `version: 3`，并保存 Buyer、Seller、Arbiter 公钥、锁定脚本、池 outpoint 和池金额。

三种实现消费相同的角色顺序：2-of-2 为 `[Buyer, Seller]`，2-of-3 为 `[Buyer, Seller, Arbiter]`；状态资金输出为 `[Buyer, Seller]`。Go 和 TypeScript 比较锁定脚本、状态交易、txid、签名和三种两两合并结果的字节。Rust 交叉验证通用多签算法，不将 `public_keys` 等数学概念改写为业务角色。

```bash
npm run build
npm test -- --runInBand
go test ./...
cd rust && cargo test
```

任一比较失败都直接退出，禁止按 v2 顺序重试。
