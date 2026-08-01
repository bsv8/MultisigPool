# v3 测试

TypeScript 测试位于 `tests/two_party_pool` 和 `tests/arbitrated_pool`，分别验证 2-of-2 的 `[Buyer, Seller]`、2-of-3 的 `[Buyer, Seller, Arbiter]`、固定输出顺序、三种签名组合和不可变输入。

```bash
npm test -- --runInBand
go test ./...
```

重复公钥、错误角色私钥、错误源输出、重复签名、错误签名和非递增 sequence 都必须直接失败。
