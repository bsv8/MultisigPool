> 历史施工单：本文关于 v3、仲裁池 `[Buyer, Seller]` 输出和协议字节不变的结论已被施工单 003 取代，仅供审计。

# Buyer / Seller / Arbiter 角色硬切换施工单

## 1. 施工结论

本次迭代采用一次性、破坏式硬切换，不分阶段发布，不保留旧角色 API，不提供兼容别名、自动识别、降级或兜底逻辑。

版本事实源、三语言版本镜像、统一发布入口、恢复规则和发布前门禁统一以 [`施工单/002-统一版本清单与三语言发布施工单.md`](./002-统一版本清单与三语言发布施工单.md) 为准；本施工单只定义角色与协议行为。

角色统一定义为：

- `Buyer`：买方、出资方。负责提供创建资金池所需的 UTXO；结算手续费从 Buyer 的池内余额扣除。
- `Seller`：卖方、收款方。按状态交易中的结算金额收款。
- `Arbiter`：仲裁方。只存在于 2-of-3 仲裁池，不参与资金输出。

统一使用标准阈值名称：

- 双方池：`2-of-2`
- 仲裁池：`2-of-3`
- 禁止再使用 `3-of-2` 表达 2-of-3 多签。

新协议的公钥槽位顺序固定为：

```text
2-of-2: [Buyer, Seller]
2-of-3: [Buyer, Seller, Arbiter]
```

新协议的状态交易输出顺序固定为：

```text
output[0] = Buyer 的剩余资金
output[1] = Seller 的结算资金
```

`Arbiter` 永远没有资金输出。输出顺序不得根据金额、签名到达顺序或调用方身份动态变化。

2-of-3 链上脚本允许以下三种签名组合，SDK 必须全部显式支持：

```text
Buyer + Seller
Buyer + Arbiter
Seller + Arbiter
```

如果业务希望禁止其中某一种组合，必须重新设计锁定脚本并另立协议版本；不能靠少提供一个 SDK 合并函数来声称链上已经禁止。

## 2. 简述缘由

当前实现混用了 `server`、`client`、`A`、`B`、`buyer`、`seller` 和 `arbiter`。同一个槽位在不同文件或示例中含义不同，调用方容易把业务身份、签名顺序和资金输出对应错。

这不是单纯的变量命名问题。当前链上脚本顺序实际为 `[server/卖方, A/买方, B/仲裁方]`，即 `[Seller, Buyer, Arbiter]`。切换为 `[Buyer, Seller, Arbiter]` 后，锁定脚本、地址、交易 ID、签名哈希及测试向量都会改变。因此必须按新协议整体切换，不能只做文本替换。

采用明确业务角色的目的，是让调用方无需了解项目历史即可回答三个问题：谁出资、谁收款、谁仲裁。代价是 API 面向交易托管场景，不再假装三个槽位完全对称；这是有意选择。

## 3. 本次迭代边界

### 3.1 必须同时完成

- Go、TypeScript、Rust 相关示例及三语言交叉验证同时切换。
- 所有公共类型、函数、参数、返回字段、文件名、目录名、测试名、fixture 字段、环境变量和文档术语同时切换。
- 公钥顺序、输出顺序、签名合并顺序、验签逻辑和共享测试向量同时切换。
- 协议标识从 `bitfs.pool.v2` 升级为 `bitfs.pool.v3`，协议版本改为 `3`。
- npm、Go module 与 Rust crate 发布版本统一为 `3.0.0`；Go module 使用 `/v3` 语义导入路径。
- 生成物只能由构建命令重新生成，禁止手工修改 `dist/`。

### 3.2 不在本次范围内

- 不迁移、重写或重新解释任何已经创建的旧池。
- 不改变签名算法、SIGHASH 策略、手续费公式或 OP_RETURN payment proof 的业务含义。
- 不引入服务端、数据库、角色注册中心或可变的全局角色状态。
- 不把 `Arbiter` 扩展成收款方；如需三方分账，应另立协议。

## 4. 实施规则

### 4.1 API 设计

使用不可变的角色值对象承载公钥，避免长参数列表导致位置传错：

```go
type TwoPartyPoolRoles struct {
    Buyer  *ec.PublicKey
    Seller *ec.PublicKey
}

type ArbitratedPoolRoles struct {
    Buyer   *ec.PublicKey
    Seller  *ec.PublicKey
    Arbiter *ec.PublicKey
}
```

TypeScript 使用对应的只读结构：

```ts
export interface TwoPartyPoolRoles {
  readonly buyer: PublicKey
  readonly seller: PublicKey
}

export interface ArbitratedPoolRoles {
  readonly buyer: PublicKey
  readonly seller: PublicKey
  readonly arbiter: PublicKey
}
```

构建、签名、合并和验证函数接收显式输入并返回新结果。不得创建一个中心对象，再通过多个方法修改其中共享的交易或角色状态。对于调用方传入的交易，先复制再修改，不能产生未声明的原地副作用。

公共命名采用以下词汇：

```text
Buyer / buyer
Seller / seller
Arbiter / arbiter
TwoPartyPool / twoPartyPool
ArbitratedPool / arbitratedPool
```

建议的新公共函数族：

```text
BuildTwoPartyPoolLock
BuildTwoPartyPoolFundingTx
BuildTwoPartyPoolState
SignTwoPartyPoolAsBuyer
SignTwoPartyPoolAsSeller
VerifyTwoPartyPoolBuyerSignature
VerifyTwoPartyPoolSellerSignature
MergeTwoPartyPoolBuyerSellerSignatures

BuildArbitratedPoolLock
BuildArbitratedPoolFundingTx
BuildArbitratedPoolOpeningState
BuildArbitratedPoolState
BuildArbitratedPoolFinalState
SignArbitratedPoolAsBuyer
SignArbitratedPoolAsSeller
SignArbitratedPoolAsArbiter
VerifyArbitratedPoolBuyerSignature
VerifyArbitratedPoolSellerSignature
VerifyArbitratedPoolArbiterSignature
MergeArbitratedPoolBuyerSellerSignatures
MergeArbitratedPoolBuyerArbiterSignatures
MergeArbitratedPoolSellerArbiterSignatures
```

TypeScript 使用相同语义的 camelCase 名称。

### 4.2 数据与协议约束

- Buyer、Seller、Arbiter 公钥必须全部非空且互不相同，不满足时立即返回英文错误。
- 2-of-2 不接受 Arbiter 字段；2-of-3 必须提供 Arbiter，不能用 Buyer 或 Seller 代替。
- 创建资金池时，UTXO 所有者必须是 Buyer，Buyer 私钥必须与 `roles.Buyer` 一致。
- 状态金额必须使用 `buyerAmount`、`sellerAmount`，禁止使用 `serverAmount`、`clientAmount`、`aAmount`、`bAmount`。
- 费用继续由 Buyer 的剩余资金承担；余额不足时直接失败。
- 签名必须先针对同一份未签名交易逐个验签，再按锁定脚本中的公钥顺序组装解锁脚本。
- 合并函数必须通过明确的角色公钥验证签名来源，禁止只检查签名字节形状。
- 协议版本不匹配、源输出脚本不匹配、角色错位、重复签名、重复公钥、非递增 sequence、金额不守恒均直接失败。
- 所有新增或修改的错误消息使用英文；文档和代码注释使用中文。

## 5. 明确禁止的做法

- 禁止只把 `server/client/A/B` 文本替换成新名字而不改变链上公钥顺序。
- 禁止在新 API 内部继续偷偷使用 `[Seller, Buyer, Arbiter]` 的旧顺序。
- 禁止保留旧导出函数、旧类型别名、deprecated 包装器或同名转发变量。
- 禁止运行时猜测一笔交易属于 v2 还是 v3，也禁止验新失败后自动按旧协议重试。
- 禁止让调用方通过布尔值、数字槽位或字符串自由指定签名者角色。
- 禁止根据“谁先签名”决定签名在解锁脚本中的位置。
- 禁止根据输出金额大小推断 Buyer 或 Seller。
- 禁止静默交换传错位置的公钥、签名或输出。
- 禁止吞掉错误并返回 `false`、空交易、空签名或默认角色作为兜底。
- 禁止只更新 Go 或 TypeScript 其中一端后发布；三语言测试向量必须在同一次合并中一致。
- 禁止手工编辑构建产物来伪造 API 已更新。

## 6. 特殊情况处理

### 6.1 历史 v2 池

历史池的锁定脚本已经固化，不能原地升级。处理方式只有两种：

1. 在切换前使用锁定版本的 v2 工具链完成并关闭旧池；或
2. 继续由独立保存的 v2 工具链处理该池，直到资金退出。

新版本不得读取后把旧槽位重新解释为 Buyer/Seller，也不得提供自动迁移。发布前必须保存 v2 tag、依赖锁文件和可复现构建说明。

### 6.2 在途未完成交易或已交换的签名

任何基于 v2 锁定脚本生成的未签名交易、部分签名和待合并交易必须继续全程使用 v2。不得把 v2 签名送入 v3 合并函数，也不得在同一池内切换公钥顺序。若不能继续完成，则作废候选交易，并由原池允许的合法签名组合重新处置旧池资金。

### 6.3 外部持久化数据

持久化记录必须保存：

```text
protocol
version
buyerPublicKey
sellerPublicKey
arbiterPublicKey（仅 2-of-3）
lockingScript
poolOutpoint
poolAmount
```

读取缺字段、旧字段或版本不匹配的数据时直接返回英文错误。不得用字段存在性猜版本。

### 6.4 仲裁签名组合

裸 2-of-3 脚本在链上允许任意两把有效密钥。SDK 因此必须覆盖三种组合并分别验签、排序和合并。如果产品规则要求 Arbiter 只能和某一方联合签名，应暂停施工，先设计能在链上执行该限制的新脚本；只在 API 层隐藏一种组合没有安全意义。

### 6.5 零金额状态

允许某一资金输出为零的场景必须由具体构建函数明确规定，例如初始状态 Seller 金额为零。除明确规定的状态外，零金额不得被当作角色判断依据。任何 dust、最小输出或手续费规则仍按现有协议规则执行，不增加自动调账。

### 6.6 `server` 和 `client` 的非角色语义

真实的 HTTP server、RPC client、网络错误或第三方依赖中的通用技术术语可以保留。角色相关的源码标识、注释、测试和示例中不得再使用 `server/client`。验收搜索时必须人工区分这两种语义。

### 6.7 第三方接入尚未同步

第三方未完成 v3 改造时不得向其发送 v3 池或 v3 待签名交易，也不得由本库为其降级。接入双方必须先确认协议版本和锁定脚本，再开始建池。无法确认时直接停止建池。

## 7. 文件级施工清单

以下改动必须在同一个迭代、同一个合并窗口完成。允许按依赖关系编写代码，但不允许形成可发布的中间兼容状态。

### 7.1 Go 公共实现

| 当前文件 | 目标文件/处理 | 施工内容 |
| --- | --- | --- |
| `go.mod` | 原文件修改 | module 改为 `/v3`；仓库内自引用同步改为 `/v3`。 |
| `pkg/index.go` | 原文件重写 | 仅导出新的 TwoPartyPool 与 ArbitratedPool 类型和函数；删除全部旧导出别名。 |
| `pkg/types.go` | 原文件核对并修改 | 公共请求/响应字段如涉及角色，统一为 Buyer/Seller/Arbiter。 |
| `pkg/dual_endpoint/1base_tx.go` | `pkg/two_party_pool/funding.go` | 改为 Buyer UTXO 创建 2-of-2 池，锁定顺序 `[Buyer, Seller]`。 |
| `pkg/dual_endpoint/2client_spend_tx.go` | `pkg/two_party_pool/state.go` | 重写状态输出、金额字段和 Buyer 签名入口；输出固定 `[Buyer, Seller]`。 |
| `pkg/dual_endpoint/3server_sign.go` | `pkg/two_party_pool/sign.go` | 改为 Seller 签名；与更新签名共享纯签名辅助函数。 |
| `pkg/dual_endpoint/4client_spend_tx_update.go` | `pkg/two_party_pool/update.go` | 更新加载、sequence、payment proof 和 Buyer 更新签名命名。 |
| `pkg/dual_endpoint/5server_sign_update.go` | 合入 `pkg/two_party_pool/sign.go` | 改为 Seller 更新签名，不保留旧函数。 |
| `pkg/dual_endpoint/6verify.go` | `pkg/two_party_pool/verify.go` | 改为 Buyer/Seller 显式验签，错误信息使用英文。 |
| `pkg/dual_endpoint/script.go` | `pkg/two_party_pool/script.go` | 固定 `[Buyer, Seller]` 锁定及 Buyer+Seller 合并顺序。 |
| `pkg/triple_endpoint/1base_tx.go` | `pkg/arbitrated_pool/funding.go` | Buyer UTXO 创建 2-of-3 池，固定 `[Buyer, Seller, Arbiter]`。 |
| `pkg/triple_endpoint/2client_spend_tx.go` | `pkg/arbitrated_pool/settlement.go` | 重写结算状态与 Buyer 签名，移除 server/A/B 语义。 |
| `pkg/triple_endpoint/3server_sign.go` | 合入 `pkg/arbitrated_pool/sign.go` | 改为按明确角色签名；删除错误的旧弃用说明。 |
| `pkg/triple_endpoint/4client_spend_tx_update.go` | `pkg/arbitrated_pool/update.go` | 改为 Buyer/Seller 金额及 Buyer 更新签名。 |
| `pkg/triple_endpoint/5server_sign_update.go` | 合入 `pkg/arbitrated_pool/sign.go` | 提供 Buyer、Seller、Arbiter 三个显式签名入口。 |
| `pkg/triple_endpoint/6verify.go` | `pkg/arbitrated_pool/verify.go` | 提供三角色验签，绑定同一源输出与同一未签名状态。 |
| `pkg/triple_endpoint/script.go` | `pkg/arbitrated_pool/script.go` | 固定新锁定顺序，提供三种角色组合的验签后合并函数。 |
| `pkg/triple_endpoint/state.go` | `pkg/arbitrated_pool/state.go` | 输入结构字段改为 Buyer/Seller/Arbiter；输出改为 `[Buyer, Seller]`；构建过程不修改调用方对象。 |
| `pkg/triple_endpoint/fee.go` | `pkg/arbitrated_pool/fee.go` | 仅迁移包路径；确认公钥/输出换序不改变手续费公式。 |
| `pkg/libs/check_fee_pool.go` | 原文件修改 | 若包含 server/client 角色判断，改为显式 Buyer/Seller 输入；通用工具不得推断角色。 |
| `pkg/libs/standard_unspent.go` | 原文件修改 | 参数名和注释中的出资角色改为 Buyer。 |

旧目录 `pkg/dual_endpoint` 和 `pkg/triple_endpoint` 在合并前必须完全删除，不能留下转发包。

### 7.2 TypeScript 公共实现

| 当前文件 | 目标文件/处理 | 施工内容 |
| --- | --- | --- |
| `src/index.ts` | 原文件重写 | 只导出新 API；删除旧 endpoint 导出和旧角色类型。 |
| `src/types.ts` | 原文件修改 | 新增只读角色输入类型；角色相关字段统一为 camelCase。 |
| `src/dual_endpoint/1base_tx.ts` | `src/two_party_pool/funding.ts` | Buyer UTXO 创建池，锁定顺序 `[buyer, seller]`。 |
| `src/dual_endpoint/2client_spend_tx.ts` | `src/two_party_pool/state.ts` | 输出固定 `[buyer, seller]`，重命名金额及 Buyer 签名。 |
| `src/dual_endpoint/3server_sign.ts` | `src/two_party_pool/sign.ts` | 改为 Seller 签名纯函数。 |
| `src/dual_endpoint/4client_spend_tx_update.ts` | `src/two_party_pool/update.ts` | 改为 Buyer 更新流程和显式数据输入。 |
| `src/dual_endpoint/5server_sign_update.ts` | 合入 `src/two_party_pool/sign.ts` | 改为 Seller 更新签名。 |
| `src/dual_endpoint/6verify.ts` | `src/two_party_pool/verify.ts` | 改为 Buyer/Seller 验签。 |
| `src/dual_endpoint/index.ts` | `src/two_party_pool/index.ts` | 仅导出新函数。 |
| `src/triple_endpoint/0script.ts` | `src/arbitrated_pool/script.ts` | 固定新顺序并实现三种签名组合的验证后合并。 |
| `src/triple_endpoint/1base_tx.ts` | `src/arbitrated_pool/funding.ts` | Buyer UTXO 创建 2-of-3 池。 |
| `src/triple_endpoint/2client_spend_tx.ts` | `src/arbitrated_pool/settlement.ts` | 重写 Buyer/Seller 状态金额和输出。 |
| `src/triple_endpoint/3server_sign.ts` | 合入 `src/arbitrated_pool/sign.ts` | 改为角色显式签名入口。 |
| `src/triple_endpoint/4client_spend_tx_update.ts` | `src/arbitrated_pool/update.ts` | 更新状态及 Buyer 更新签名。 |
| `src/triple_endpoint/5server_sign_update.ts` | 合入 `src/arbitrated_pool/sign.ts` | 提供 Buyer、Seller、Arbiter 三角色签名。 |
| `src/triple_endpoint/6verify.ts` | `src/arbitrated_pool/verify.ts` | 提供三角色验签。 |
| `src/triple_endpoint/index.ts` | `src/arbitrated_pool/index.ts` | 仅导出新 API。 |

旧目录 `src/dual_endpoint` 和 `src/triple_endpoint` 在合并前必须完全删除。`dist/` 由 `npm run build` 生成，不作为手工施工对象。

### 7.3 Go 与 TypeScript 测试

| 当前文件 | 目标文件/处理 | 施工内容 |
| --- | --- | --- |
| `pkg/dual_endpoint/dual_endpoint_test.go` | `pkg/two_party_pool/two_party_pool_test.go` | 覆盖 Buyer 出资、Seller 收款和固定输出顺序。 |
| `pkg/dual_endpoint/op_return_spend_test.go` | `pkg/two_party_pool/payment_proof_test.go` | 保持 proof 行为，角色命名全部切换。 |
| `pkg/dual_endpoint/verify_signatures_test.go` | `pkg/two_party_pool/verify_test.go` | 覆盖正确角色、换位公钥和换位签名。 |
| `pkg/triple_endpoint/state_test.go` | `pkg/arbitrated_pool/state_test.go` | 覆盖新公钥顺序、输出顺序、sequence、费用和不可变输入。 |
| `pkg/triple_endpoint/triple_endpoint_test.go` | `pkg/arbitrated_pool/arbitrated_pool_test.go` | 覆盖 2-of-3 基本流程。 |
| `pkg/triple_endpoint/verify_signatures_test.go` | `pkg/arbitrated_pool/verify_test.go` | 覆盖三个角色与三种两两签名组合。 |
| `tests/dual_endpoint/dual_endpoint.test.ts` | `tests/two_party_pool/two_party_pool.test.ts` | 与 Go 使用同一 fixture，断言精确交易字节。 |
| `tests/dual_endpoint/verify_signatures.test.ts` | `tests/two_party_pool/verify.test.ts` | 覆盖 Buyer/Seller 正反验签。 |
| `tests/triple_endpoint/shared_fixture.test.ts` | `tests/arbitrated_pool/shared_fixture.test.ts` | 使用 v3 共享向量。 |
| `tests/triple_endpoint/triple_endpoint.test.ts` | `tests/arbitrated_pool/arbitrated_pool.test.ts` | 覆盖建池、状态、三种合并组合。 |
| `tests/triple_endpoint/verify_signatures.test.ts` | `tests/arbitrated_pool/verify.test.ts` | 覆盖角色错位、重复签名和错误源输出。 |
| `tests/README.md` | 原文件修改 | 更新测试目录、角色定义和运行命令。 |

必须增加编译期/API 面负向检查：旧函数名和旧包路径不能继续被导入；这项检查不能通过保留别名来满足。

### 7.4 Fixture 与跨语言向量

| 当前文件 | 目标文件/处理 | 施工内容 |
| --- | --- | --- |
| `testdata/triple_pool_v2_fixture.json` | `testdata/arbitrated_pool_v3_fixture.json` | 协议改为 v3；字段改为 Buyer/Seller/Arbiter；按新公钥与输出顺序重新生成全部 hex、txid 和签名。 |
| `examples/dual_endpoint/fixture.json` | 随目录迁移 | 字段改为 Buyer/Seller，并重新生成向量。 |
| `examples/offline_triple_test/test_config.json` | 随目录迁移 | 字段与环境含义改为 Buyer/Seller/Arbiter。 |
| `examples/offline_triple_test/expected_outputs.json` | 随目录迁移 | 重新生成，不允许手改旧 hex 冒充新协议。 |
| `examples/payment_proof_compare/fixture.json` | 原文件修改 | 改为 Buyer/Seller 字段，保持 proof 字节语义。 |
| `examples/triplextest/fixture.json` | 随目录迁移 | 改为 v3 三角色共享向量。 |
| `examples/txtest/fixture.json` | 原文件修改 | 改为 Buyer/Seller 字段并重新生成。 |

fixture 必须由确定性私钥和构建程序生成。Go、TypeScript、Rust 必须消费同一份角色顺序定义，禁止各自维护不同映射。

### 7.5 示例目录与程序

| 当前路径 | 目标路径/处理 | 施工内容 |
| --- | --- | --- |
| `examples/dual_endpoint/` | `examples/two_party_pool/` | 文件名、变量、输出文字和导入路径全部切换。 |
| `examples/offline_dual_test/` | `examples/offline_two_party_pool/` | 演示 Buyer+Seller 的完整离线流程。 |
| `examples/online_dual_test/` | `examples/online_two_party_pool/` | 环境变量改为 `FEEPOOL_BUYER_PRIV`、`FEEPOOL_SELLER_PRIV`。 |
| `examples/offline_triple_test/` | `examples/offline_arbitrated_pool/` | 演示 Buyer+Seller 正常结算及两种 Arbiter 组合。 |
| `examples/online_triple_test/` | `examples/online_arbitrated_pool/` | 同步三角色环境变量、显示文字和错误消息。 |
| `examples/triplextest/` | `examples/arbitrated_pool_compare/` | 更新 Go/TS 对照入口及 fixture。 |
| `examples/txtest/` | `examples/two_party_pool_compare/` | 更新 Go/TS 对照入口及 fixture。 |
| `examples/payment_proof_compare/` | 原目录修改 | 更新角色名称及新包路径。 |
| `examples/rust_go_comparison/main.go` | 原文件修改 | 更新 Go v3 import、角色字段和新顺序。 |
| `examples/rust_go_comparison/src/main.rs` | 原文件修改 | 更新 Buyer/Seller 命名和共享向量。 |
| `examples/rust_go_comparison/run_cross_validation.sh` | 原文件修改 | 更新入口路径和输出说明。 |

示例中的用户可见说明使用中文；实际错误消息保持英文。

### 7.6 Rust

Rust 核心库目前主要提供通用多签能力，不应为了角色切换把通用数学概念强行改成业务角色。只修改实际承载池角色的文件：

| 文件 | 施工内容 |
| --- | --- |
| `rust/Cargo.toml`、`rust/Cargo.lock` | crate 版本与 npm、Go 统一为 `3.0.0`；同步依赖锁。 |
| `rust/README.md` | 使用 Buyer/Seller/Arbiter 示例和标准 2-of-2、2-of-3 表达。 |
| `rust/examples/cross_validation.rs` | 使用新公钥顺序和 v3 fixture。 |
| `rust/examples/cross_validation_comparison.rs` | 更新角色字段、输出顺序和预期 hex。 |
| `rust/tests/cross_validation_test.rs` | 断言与 Go、TypeScript 字节级一致。 |
| `rust/tests/lib_test.rs` | 保留通用多签测试；仅修改确实具有角色含义的变量。 |

`rust/src/multisig.rs`、`rust/src/types.rs`、`rust/src/lib.rs` 中纯通用的 `public_keys`、`m-of-n` 等术语保留，不替换成 Buyer/Seller/Arbiter。

### 7.7 文档、脚本与发布配置

| 文件 | 施工内容 |
| --- | --- |
| `README.md` | 重写实际项目结构、角色定义、2-of-2/2-of-3 快速示例和 v3 破坏性说明；删除不存在的 server 目录描述。 |
| `docs/dual_endpoint_spec.md` | 重命名为 `docs/two_party_pool_spec.md`，按 Buyer/Seller 和新顺序重写。 |
| `docs/comparison-tests.md` | 更新目录、fixture、顺序及三种 2-of-3 组合。 |
| `docs/typescript_golang_rust_cross_validation.md` | 更新三语言 v3 向量和运行命令。 |
| `RUST_IMPLEMENTATION.md` | 更新角色映射与协议版本。 |
| `PACKAGING.md` | 记录三语言统一 `3.x`、Go `/v3` 和禁止混用规则。 |
| `package.json`、`package-lock.json` | npm 版本提升至 `3.0.0`，描述和关键词更新。 |
| `Makefile` | 测试目标和提示文字使用新目录名。 |
| `scripts/build.sh` | 更新 Go `/v3` 与新源码目录检查。 |
| `scripts/test.sh` | 纳入新 Go/TS 测试目录及静态旧角色扫描。 |
| `scripts/run_all_tests.sh` | 更新新示例路径，并启用 `set -e`，任何失败立即退出。 |
| `scripts/run_dual_endpoint_tests.sh` | 重命名为 `scripts/run_two_party_pool_tests.sh` 并更新路径。 |
| `scripts/run_rust_go_cross_validation.sh` | 更新新示例路径和术语。 |
| `scripts/cross_validate_rust_go.sh` | 更新新 fixture 与输出说明。 |
| `scripts/run_everything.js` | 更新目录、命令和结果标签。 |
| `scripts/release-all.sh`、`release/versions.json` | 发布入口、版本事实源和三语言发布前置条件统一按施工单 002 执行。 |

## 8. 一次性施工顺序

以下是同一迭代内部的依赖顺序，不代表分阶段交付：

1. 冻结 v2 tag、锁文件和历史池操作说明。
2. 建立 v3 共享协议常量、角色类型和确定性 fixture 生成入口。
3. 同时重写 Go 与 TypeScript 的锁定、构建、签名、合并和验证 API。
4. 更新 Rust 对照程序，使三语言消费同一份 v3 fixture。
5. 删除旧公共 API、旧目录和旧 fixture，不保留转发层。
6. 更新全部测试、示例、脚本、文档与发布版本。
7. 执行完整验收；全部通过后一次性合并和发布，任何一项失败均不得发布。

## 9. 最终验收清单

### 9.1 协议与角色

- [ ] 2-of-2 锁定脚本公钥顺序严格为 `[Buyer, Seller]`。
- [ ] 2-of-3 锁定脚本公钥顺序严格为 `[Buyer, Seller, Arbiter]`。
- [ ] 状态输出严格为 `output[0]=Buyer`、`output[1]=Seller`。
- [ ] Buyer 是唯一建池 UTXO 所有者，Seller 是结算收款方，Arbiter 没有资金输出。
- [ ] 协议标识为 `bitfs.pool.v3`，版本字段为 `3`。
- [ ] 代码和文档统一写作 2-of-2、2-of-3，不再使用 3-of-2。
- [ ] 2-of-3 的 Buyer+Seller、Buyer+Arbiter、Seller+Arbiter 三种组合均有正向测试。

### 9.2 错误暴露与负向测试

- [ ] Buyer/Seller 换位会明确失败，不会被静默纠正。
- [ ] 任意重复公钥会明确失败。
- [ ] 错误角色签名、重复签名、签名顺序错误会明确失败。
- [ ] v2 fixture、v2 锁定脚本和旧字段输入会明确失败。
- [ ] 版本缺失或不匹配会明确失败。
- [ ] 源输出脚本、pool amount、sequence、手续费或输出金额不一致会明确失败。
- [ ] 所有错误消息为英文，不存在空值或默认值兜底。
- [ ] 构建、更新、签名和合并函数不会意外修改调用方传入对象。

### 9.3 API 与静态扫描

- [ ] `pkg/dual_endpoint`、`pkg/triple_endpoint`、`src/dual_endpoint`、`src/triple_endpoint` 已删除。
- [ ] 新公共代码中不存在角色含义的 `server`、`client`、`A`、`B` 标识。
- [ ] 旧公共函数、类型、变量和 import path 均已删除，旧调用代码无法编译。
- [ ] 实际网络层的 HTTP server/RPC client 术语经人工检查后保留。
- [ ] Go 与 TypeScript 公共 API 的角色、顺序和行为逐项对应。
- [ ] 没有手工编辑或提交不一致的生成物。

建议静态检查命令如下；命中后必须逐条人工判断，不能通过扩大忽略规则掩盖角色残留：

```bash
rg -n -i 'server|client|serverAmount|clientAmount|SignAsA|SignAsB|3-of-2' \
  pkg src tests testdata examples docs README.md RUST_IMPLEMENTATION.md PACKAGING.md
```

### 9.4 自动化验证

- [ ] `gofmt` 已执行且无差异。
- [ ] `go vet ./...` 通过。
- [ ] `go test ./...` 通过。
- [ ] `npm run lint` 通过。
- [ ] `npm test -- --runInBand` 通过。
- [ ] `npm run build` 通过，ESM、CJS、`.d.ts` 均只暴露新 API。
- [ ] `cargo fmt --check` 通过。
- [ ] `cargo clippy --all-targets --all-features -- -D warnings` 通过。
- [ ] `cargo test` 通过。
- [ ] 三语言交叉验证通过，锁定脚本、状态交易 hex、txid、签名和合并结果字节级一致。
- [ ] 所有 example 可编译；离线 example 可完整运行。
- [ ] 发布脚本在任一验收失败时立即停止。

### 9.5 发布与接入

- [ ] npm、Go 与 Rust 发布版本统一为 `3.0.0`，Go module/import 为 `/v3`。
- [ ] v2 tag、构建说明和依赖锁已确认可用，供历史池继续退出资金。
- [ ] 发布说明明确写出：这是破坏性协议变更，不支持旧池原地升级。
- [ ] 第三方接入文档包含角色表、公钥顺序、输出顺序和三种签名组合。
- [ ] 第三方已确认不会把 v2 部分签名、交易或持久化记录传给 v3。
- [ ] 新版本仅在所有语言包、fixture、文档和示例同时就绪后发布。

## 10. 完工判定

只有当第 9 节全部勾选，且仓库中不存在旧角色 API、旧角色目录、旧协议 fixture 或隐式兼容路径时，本次硬切换才算完成。

任何“新接口已完成但旧接口暂留”“先改一门语言”“先保持旧公钥顺序以后再改”“识别失败时尝试旧协议”的状态，都不属于本施工单认可的完成状态。
