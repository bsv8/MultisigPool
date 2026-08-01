# v4 测试

TypeScript 测试位于 `tests/two_party_pool` 和 `tests/arbitrated_pool`，覆盖仲裁池的三资金输出、绝对仲裁费、付款证明索引、严格输出校验、金额守恒、手续费、三种签名组合和不可变输入。

```bash
npm test -- --runInBand
go test ./...
```

重复公钥、错误角色私钥、错误源输出、重复签名、错误签名和非递增 sequence 都必须直接失败。
