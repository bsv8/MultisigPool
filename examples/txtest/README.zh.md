# 交易交叉测试 (`examples/txtest`)

该目录包含一个小型集成测试，用于确保 **Go** 和 **TypeScript** 实现的 Keymaster 多重签名池能够从相同的测试数据生成**比特级完全相同的交易**。

## 目录内容

| 文件 | 作用 |
| ---- | ---- |
| `fixture.json` | 输入数据（UTXO、密钥、金额），供两种实现共享使用。 |
| `go_runner/main.go` | 使用 Go SDK 构建**步骤1**（资金）和**步骤2**（支出）交易，并打印其十六进制表示。 |
| `ts_runner.ts` | 使用 `@bsv/sdk` 在 TypeScript 中执行相同操作。 |
| `compare.go` | 运行两个运行器，提取它们的十六进制字符串并断言它们完全相同。打印**通过/失败**结果。 |

## 前置条件

* Go 1.20+
* Node.js 18+（依赖内置 `tsx`，可通过 `npx tsx` 直接运行 TypeScript）
* 已安装 Node 依赖项（在项目根目录执行 `npm install`）

## 运行测试

从项目根目录执行：

```bash
# 1. 生成 TS 交易（可选 - 调试时很有用）
npx tsx examples/txtest/ts_runner.ts

# 2. 生成 Go 交易（可选）
go run examples/txtest/go_runner/main.go

# 3. 一次性比较（推荐）
go run examples/txtest/compare.go
```

成功时的预期输出：

```
PASS: Go and TS transactions are identical
```

如果看到 **FAIL**，程序将显示不同的步骤十六进制值，以便您可以进行差异比较并定位根本原因（签名哈希、脚本、费用等）。

## 调试技巧

* 两个运行器都会打印生成的签名哈希原像（`TS sighash:`）及其双 SHA256 摘要（`sighash32`）。当您不再需要详细输出时，可以注释掉这些 `console.log` / `fmt.Printf` 行，或使用环境变量进行控制。
* 将 `compare.go` 保留在您的 CI 流水线中，以确保未来的更改保持语言间的字节级一致性。
