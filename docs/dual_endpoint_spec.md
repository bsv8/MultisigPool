# 双端点费用池 - 跨语言规范

本文档描述了 *双端点* 费用池实现的规范行为。`pkg/dual_endpoint` 下的 Go 代码和 `src/dual_endpoint` 下的 TypeScript 代码 **必须** 逐字节遵循此规范，以便任一语言产生的交易都是相同的。

---

## 1. 术语

| 术语 | 含义 |
|------|---------|
| **客户端** | 发起资金池的一方（提供初始 UTXOs）。 |
| **服务端** | 共同签署多重签名并支付花费费用的服务。 |
| **A-Tx** | 第1步产生的基础交易 (`1base_tx`)。 |
| **B-Tx** | 第2步产生的花费交易 (`2client_spend_tx`)。 |

---

## 2. 多重签名脚本

所有资金池输出都使用 **2-of-2** 多重签名脚本。

```
OP_2 <serverPub> <clientPub> OP_2 OP_CHECKMULTISIG
```

公钥的 *顺序* **必须** 是 `[serverPub, clientPub]`。

---

## 3. 网络参数

所有函数都接受
```
isMain: boolean  // true → 主网；false → 测试网
```
当 `isMain` 被省略时（TS 最初情况），默认为 `true`。两个 SDK 必须以相同方式编码地址。

---

## 4. 步骤1 - buildDualFeePoolBaseTx / BuildDualFeePoolBaseTx

```
输入:
    clientUtxos     []UTXO      // 消耗全部价值
    clientPrivKey   PrivateKey
    serverPubKey    PublicKey
    isMain          bool
    feeRate         float64     // sat/字节
返回 (结构体):
    tx      Transaction
    amount  uint64   // 多重签名输出值 (= Σutxo - 费用)
    index   int      // 始终为 0
```

算法（两种语言相同）：
1. 从 `clientPrivKey` 派生 `clientAddress`。
2. 为每个 UTXO 生成带有临时解锁脚本的 P2PKH 输入。
3. 创建价值为 `Σ(utxo)` 的多重签名输出。
4. 对每个输入应用假签名 → 测量 `txSize`。
5. `fee = max(1, floor(txSize/1000 * feeRate))`。
6. `output[0].satoshis = Σ(utxo) - fee`。
7. 重新签署每个输入。

---

## 5. 步骤2 - buildDualFeePoolSpendTX / BuildDualFeePoolSpendTX

```
输入:
    aTx             Transaction  // 第1步的输出
    serverValue     uint64       // 与 aTx.outputs[0].satoshis 相同
    endHeight       uint32       // 锁定高度
    clientPrivKey   PrivateKey
    serverPubKey    PublicKey
    isMain          bool
    feeRate         float64
返回 (结构体):
    tx              Transaction // B-Tx
    clientSignBytes []byte      // DER + 签名哈希字节
    amount          uint64      // 转移到客户端的金额 (= serverValue - 费用)
```

子步骤：
1. **SubBuildDualFeePoolSpendTX** - 产生未签名的 B-Tx，使用假解锁进行大小计算。
2. **SpendTXDualFeePoolClientSign** - 生成客户端的签名字节。
3. **BuildDualFeePoolSpendTX** - 包装上述步骤。

费用计算与步骤1相同，由 `serverValue` 支付。

---

## 6. 占位符/假签名

用于大小估计时适用以下规则：
* 解锁脚本以 `OP_0` 开始（由于差一错误）。
* 每个假签名是 **73字节**（72个虚拟字节 + 1个签名哈希）。
* 因此脚本结构为：
  `OP_0 <fakeSig> <fakeSig>`。

两种语言必须使用相同的假签名例程以避免大小漂移。

---

## 7. 返回类型

Go 和 TS 都应该公开具有相同字段名（`tx`、`amount`、`index`、`clientSignBytes`）的小结构体/对象。这简化了跨语言测试。

---

## 8. 日志记录

生产版本默认不得输出日志。提供可选的调试标志。

---

## 9. 未来步骤 - 服务端签名与更新

Go 实现包括文件 `3server_sign.go`、`4client_spend_tx_update.go`、`5server_sign_update.go`，它们完成了协议。TypeScript 必须实现具有字节级相同行为的相同 API。移植完成后将在此处添加详细信息。

---

## 10. 签名验证（新增）
为提升安全性，双方在回签或接收更新前应提供“对对方签名进行验证”的能力。验证应与签名完全一致的 sighash 规则：

- 作用域：`SIGHASH_ALL | SIGHASH_FORKID`
- 子脚本：使用规范的赎回脚本，公钥顺序严格为 `[serverPub, clientPub]`
- 源金额：资金池输出金额（步骤2），或更新流中的 `inputs[0].sourceTransaction.outputs[0].satoshis`
- 交易字段（version/locktime/sequence）必须与签名时一致

推荐的 TS 接口：`serverVerifyClientSpendSig`、`clientVerifyServerSpendSig`、`serverVerifyClientUpdateSig`、`clientVerifyServerUpdateSig`

这些函数不修改交易，直接返回布尔值；若末尾 sighash 标志字节与预期不符，必须判定为失败。

---

## 11. 测试向量

一组共享的 JSON 测试用例将放置在 `tests/dual_endpoint/*.json` 中，涵盖：
1. 步骤1的确定性密钥和 UTXOs。
2. A-Tx 的预期十六进制。
3. 客户端签名后 B-Tx 的预期十六进制。

两个运行时都必须通过这些测试。此外，增加正/负向的验证用例（篡改旗标、金额/脚本/公钥顺序/locktime/sequence 变动），并断言 Go/TS 结果一致。

---

*最后更新*：2025-07-09
