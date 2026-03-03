# 离线单元测试

使用固定输入和期望输出的确定性单元测试。

## 运行方式

```bash
# Go 版本
go run examples/offline_dual_test/main.go

# TypeScript 版本
npx tsx examples/offline_dual_test/main.ts
```

## 说明

- 使用固定的私钥和 UTXO
- 验证所有 5 个步骤的输出结果
- 确保 Go 和 TypeScript 版本产生相同结果
- 测试通过时显示 "🎉 ALL TESTS PASSED!"

## 测试数据

- 客户端私钥: `2796e78fad7d383fa5236607eba52d9a1904325daf9b4da3d77be5ad15ab1dae`
- 服务器私钥: `e6d4d7685894d2644d1f4bf31c0b87f3f6aa8a3d7d4091eaa375e81d6c9f9091`
- 测试 UTXO: `3bc591b12d1d356c80eec9628a626c2676c27e21fe8e0ef34d6dab2e425d9629:1`
