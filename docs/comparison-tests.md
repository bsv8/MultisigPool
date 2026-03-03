# 跨语言对比测试总览

本文档汇总本仓库中所有“对比测试”（Compare/Diff）相关的用例、脚本与运行方式，重点记录如何在 Go 与 TypeScript 两种实现之间进行“比特级一致性”的交叉校验（expected vs actual），以及出现差异时如何定位问题。

## 1. 目录结构与文件清单

- examples/txtest/
  - 作用：双签（Dual Endpoint）跨语言对比的集成测试
  - 关键文件：
    - go_runner/main.go：使用 Go 实现构建 Step1/Step2 交易并打印十六进制
    - ts_runner.ts：使用 TypeScript 实现构建 Step1/Step2 交易并打印十六进制
    - compare.go：运行两端 runner，抓取输出中的 StepHex 并断言完全一致，打印 PASS/FAIL
    - fixture.json：共享输入（UTXO、密钥、费率等）
  - 参考文档：
    - examples/txtest/README.zh.md

- examples/triplextest/
  - 作用：三签（Triple Endpoint）跨语言对比的集成测试
  - 关键文件：
    - go_runner/main.go：使用 Go 实现构建 Step1/Step2/Step3 并打印十六进制
    - ts_runner_refactor.ts：使用 TypeScript 实现对应 3 步输出
    - compare.go：运行两端 runner，抓取 Step1Hex/Step2Hex/Step3Hex 字符串并断言一致性
    - fixture.json：共享输入（UTXO、密钥、费率等）

- examples/dual_endpoint/ts_dual_endpoint_main.ts
  - 作用：双签 TypeScript 端主程序，按步骤输出 TxID/Hex 等信息，便于结构化差异分析

- examples/dual_endpoint/analyze_differences.js
  - 作用：针对双签，提供一个“结构化”对比分析工具（非严格断言），逐字段对 Tx Hex 解析并输出差异（版本、输入/输出脚本、金额、Locktime 等）
  - 适合用于“对比失败后的定位”而非作为最终断言

- tests/dual_endpoint/dual_endpoint.test.ts
  - 作用：双签 TypeScript 单元测试，包含“与预期 hex 完全一致”的断言（严格字节级对比）

- tests/triple_endpoint/triple_endpoint.test.ts
  - 作用：三签 TypeScript 单元测试，包含“与预期 hex 完全一致”的断言，以及脚本结构/费率差异等行为断言

- scripts/run_all_tests.sh
  - 作用：顺序执行 examples/txtest/compare.go 与 examples/triplextest/compare.go 的一键脚本

- tests/README.md
  - 作用：统一的测试说明，列出如何运行 TS/Go 单测与集成对比测试


## 2. 双签（Dual Endpoint）对比测试

A) 集成对比（Go vs TS，字节级一致）
- 位置：examples/txtest/compare.go
- 关键实现：
  - 通过正则 `Step[12](?:\s*-)?\s*Hex[:\s]*([0-9a-fA-F]+)` 抓取两端的 Step1/Step2 Hex
  - 顺序比较两个步骤的 hex 字符串，若完全相等输出 PASS，否则输出 FAIL 并打印 Mismatch 步骤
- 输入来源：examples/txtest/fixture.json（共享 UTXO、密钥、费率等）
- 运行方式：
  - go run examples/txtest/compare.go
- 预期：
  - 成功时输出 PASS: Go and TS transactions are identical
  - 失败时打印差异步骤，便于后续分析

B) 差异定位辅助（结构化 diff）
- 位置：examples/dual_endpoint/analyze_differences.js
- 关键实现：
  - 分别运行 Go 与 TS 端构建交易的命令，解析输出中的 Step1/Step2 TxID 与 Hex
  - 自带 parseHex 简单解析器：解析 version、inputs（txid、vout、script/scriptLen、sequence）、outputs（金 额/脚本）、locktime
  - 对上述字段逐项比较并打印差异点
- 使用场景：
  - 当 compare.go 失败时，用本脚本进行“字段级”定位（脚本不同、金额不同、锁定时间不同等）
- 运行方式：
  - node examples/dual_endpoint/analyze_differences.js
  - 或根据脚本中 spawn 的命令要求，确保 Node.js（可运行 `npx tsx`）与 Go 环境可执行

C) TypeScript 单测的“对比预期”断言
- 位置：tests/dual_endpoint/dual_endpoint.test.ts
- 特点：
  - 先调用 `buildDualFeePoolBaseTx` 构建 Step1，断言 toHex() === 内置 expectedOutputs.step1Hex（严格一致）
  - 再通过 `buildDualFeePoolSpendTX` 构建 Step2，手动补齐 sourceTransaction/output（用于正确 sighash），拼装两方签名后，断言 toHex() === expectedOutputs.step2Hex（严格一致）
  - 另包含费率变更下的行为性断言（higherFeeRate 导致金额减少或不增）
  - 也包含输入参数校验（空 UTXO、0 费率仍有最小费等）
- 作用：
  - 这是“单语言内对比预期”的单测，保障 TypeScript 输出稳定并与“既定金标 hex”一致
  - 金标 hex 来源于通过的集成测试（见 tests/README.md 说明）

D) 文档与运行指引
- 位置：examples/txtest/README.zh.md、tests/README.md
- 重点：
  - 如何一键运行 compare.go
  - 失败时会输出差异步骤，可配合 analyze_differences.js 进一步定位
  - 建议将 compare.go 纳入 CI，保障跨语言长期一致


## 3. 三签（Triple Endpoint）对比测试

A) 集成对比（Go vs TS，字节级一致）
- 位置：examples/triplextest/compare.go
- 关键实现：
  - 正则 `Step[123](?:\s*-)?\s*Hex[:\s]*([0-9a-fA-F]+)` 抓取 Step1/Step2/Step3 三步的十六进制
  - 逐步对比 goHex[i] 与 tsHex[i]，全部一致输出 PASS，否则 FAIL 并提示 Mismatch 步骤
- 输入来源：examples/triplextest/fixture.json
- 运行方式：
  - go run examples/triplextest/compare.go
- 预期：
  - 成功输出 PASS；失败则打印差异步骤，并在控制台先行回显每一步的 Go/TS Hex 便于手动 diff

B) TypeScript 端 runner
- 位置：examples/triplextest/ts_runner_refactor.ts
- 关键点：
  - Step1：tripleBuildFeePoolBaseTx 构建资金池交易，打印 Step1Hex
  - Step2：tripleBuildFeePoolSpendTX 构建部分签名交易，打印 Step2Hex
  - Step3：tripleSpendTXFeePoolBSign 由服务端补签，合并签名脚本，打印 Step3Hex
  - 输出格式固定为 StepNHex: ...，供 compare.go 正则抓取

C) TypeScript 单测的“对比预期”断言
- 位置：tests/triple_endpoint/triple_endpoint.test.ts
- 特点：
  - Step1：expect(baseTx.toHex()).toBe(expected.step1Hex)
  - Step2/Step3：完整构建并组合签名，最终 expect(spendTx.toHex()).toBe(expected.step3Hex)
  - 另包含：高费率导致金额不增（行为性）、空 UTXO/0 费率下的输入校验、多签脚本结构检查（起始 OP_2，结尾 OP_3 OP_CHECKMULTISIG）
- 作用：
  - 固化三签 TypeScript 输出与“金标 hex”一致，配合集成测试保证跨语言一致性

D) 运行与脚本
- 一键运行所有对比：
  - ./scripts/run_all_tests.sh
    - 执行 examples/txtest/compare.go
    - 执行 examples/triplextest/compare.go


## 4. 对比测试的断言与覆盖点

1) 字节级一致断言（最核心）
- compare.go（双签/三签）对 Go 与 TS 输出的 Hex 逐步严格相等校验
- tests/…*.test.ts 中 expect(toHex()).toBe(expectedHex) 的金标断言

2) 行为性断言（非严格字节，但保障逻辑单调性/边界）
- 费率提高时，输出金额不应增加（通常减少或受最小费约束）
- 空 UTXO/参数非法时报错
- 多签脚本结构满足 2-of-3 格式（起始/末尾 OP 码检查）

3) 辅助差异分析（结构化 diff）
- analyze_differences.js 解析 Tx 字段，并打印 version/inputs/outputs/locktime 差异
- 有助于定位“签名哈希标志字节、脚本 pushdata、金额/找零、锁定时间”等细粒度问题

4) 打印与日志
- 例：examples/txtest/README.zh.md 指南提示可打印 sighash 原像和 hash32 以进一步调试
- Go/TS runner 控制台输出的 StepNHex 用作 compare.go 的正则抓取点


## 5. 常见差异来源与定位建议

- 签名哈希后缀字节（SIGHASH_ALL | FORKID）不一致
  - 代码中有显式检查：src/triple_endpoint/0script.ts 和 5server_sign_update.ts 的日志“期望 vs 实际”
  - 排查：确保 unlockScript、subscript、sourceTransaction、scope 的拼装与 Go 保持一致

- 多签脚本顺序与公钥顺序
  - 双签/三签 API 明确 server 公钥先于 client（或 escrow），顺序变动会导致脚本与签名校验不一致

- 输入/输出脚本长度（scriptLen）与 pushdata
  - analyze_differences.js 会打印脚本与长度的差异，方便定位编码/长度计算问题

- 费用与找零
  - 费率/最小费策略差异会直接影响 outputs 的 satoshis。对照 fixture 与费率策略，确认实现一致

- locktime/sequence
  - Tx 版本、Locktime、输入序列号不同将导致 Hex 全量变化。用结构化 diff 快速比对


## 6. 如何运行与复现

- 运行双签集成对比（推荐）
  - go run examples/txtest/compare.go

- 运行三签集成对比（推荐）
  - go run examples/triplextest/compare.go

- 若失败，进行结构化差异分析（双签）
  - node examples/dual_endpoint/analyze_differences.js
  - 或直接阅读 compare.go 打印的 Go/TS StepNHex，使用通用十六进制差异工具对比

- 运行 TypeScript 单元测试（校验对金标的稳定性）
  - npm test tests/dual_endpoint/dual_endpoint.test.ts
  - npm test tests/triple_endpoint/triple_endpoint.test.ts

- 一键所有对比
  - ./scripts/run_all_tests.sh


## 7. 维护建议（CI 与金标）

- 建议将 examples/txtest/compare.go 与 examples/triplextest/compare.go 纳入 CI，保护跨语言一致性
- 当算法/费用策略/脚本编码有意更新时：
  1) 先更新 runner 输出，确认新行为正确
  2) 更新 tests/* 中的 expectedOutputs 金标 hex
  3) 确保 compare.go 在新 fixture 下仍 PASS
- 对于非确定性因素（如随机化 k 值签名），项目已使用 RFC6979 确定性签名或在测试中固定输入，确保输出可重复


## 8. 附：关键实现片段定位

- 双签集成对比入口
  - examples/txtest/compare.go

- 三签集成对比入口
  - examples/triplextest/compare.go

- 双签结构化差异分析
  - examples/dual_endpoint/analyze_differences.js

- 双签 TS 单测（含期望 hex）
  - tests/dual_endpoint/dual_endpoint.test.ts

- 三签 TS 单测（含期望 hex 与脚本结构断言）
  - tests/triple_endpoint/triple_endpoint.test.ts

- 双签 TS 主程序（用于差异分析脚本调用）
  - examples/dual_endpoint/ts_dual_endpoint_main.ts

5) 签名验证一致性（新增）
- 新增 TS 单测：`tests/dual_endpoint/verify_signatures.test.ts`、`tests/triple_endpoint/verify_signatures.test.ts`
  - 正向：使用现有流程生成 client/server 签名，分别调用 `serverVerifyClient*` 与 `clientVerifyServer*` 断言为 true
  - 负向：篡改 sighash 标志，或修改 locktime/sequence，断言为 false
- 建议 Go 侧补充对等的验证单测（待补），确保 Go/TS 验证结果一致
