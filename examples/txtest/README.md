# 基础对比测试

对比 Go 和 TypeScript 实现的双端费用池 5 个步骤。

## 运行方式

```bash
go run examples/txtest/compare.go
```

## 说明

- `compare.go` - 主要对比程序
- `go_runner/main.go` - Go 版本实现
- `ts_runner.ts` - TypeScript 版本实现  
- `fixture.json` - 测试数据

测试通过时显示 "PASS: Go and TS transactions are identical"