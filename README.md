# MultisigPool v3

MultisigPool v3 是 Buyer / Seller / Arbiter 角色明确的 BSV 多签池实现，提供 TypeScript、Go 和通用 Rust 多签能力。

角色和链上顺序固定如下：

- 2-of-2：`[Buyer, Seller]`
- 2-of-3：`[Buyer, Seller, Arbiter]`
- 状态交易：`output[0] = Buyer`，`output[1] = Seller`
- Buyer 提供建池 UTXO，并承担状态交易手续费；Arbiter 不占用资金输出。

协议标识是 `bitfs.pool.v3`，协议版本是 `3`。v3 是破坏性切换，不读取、迁移或兼容旧 v2 池。

## 版本与发布

版本事实源只有 [`release/versions.json`](release/versions.json)。协议版本与包发布版本含义不同：协议为 `bitfs.pool.v3` / `3`，npm 与 Go 为 `3.0.0`，Rust crate 为 `0.2.0`。

修改版本清单后执行 `node scripts/release-versions.mjs sync`，审查生成的 Go、TypeScript、Rust 版本文件及包锁文件。只读检查命令是 `node scripts/release-versions.mjs check`。

三语言发布只有 `scripts/release-all.sh` 入口；它不接受临时版本，不自动提交代码或修改版本清单。发布中断时只能使用同一入口显式恢复：`--resume-from rust`、`--resume-from tags` 或 `--resume-from verify`。

## TypeScript

```ts
import { PrivateKey } from '@bsv/sdk/primitives'
import { buildArbitratedPoolLock, type ArbitratedPoolRoles } from 'keymaster-multisig-pool'

const roles: ArbitratedPoolRoles = {
  buyer: PrivateKey.fromHex('01'.padStart(64, '0')).toPublicKey(),
  seller: PrivateKey.fromHex('02'.padStart(64, '0')).toPublicKey(),
  arbiter: PrivateKey.fromHex('03'.padStart(64, '0')).toPublicKey(),
}
const lockingScript = buildArbitratedPoolLock(roles)
```

公共签名合并函数显式覆盖 Buyer+Seller、Buyer+Arbiter、Seller+Arbiter 三种合法组合。

## Go

Go module 路径是 `github.com/bsv8/MultisigPool/v3`。角色值对象位于 `pkg/two_party_pool` 和 `pkg/arbitrated_pool`，根包只重新导出 v3 API，不保留旧函数别名。

```go
roles := arbitrated_pool.ArbitratedPoolRoles{
    Buyer: buyer.PubKey(), Seller: seller.PubKey(), Arbiter: arbiter.PubKey(),
}
lock, err := arbitrated_pool.BuildArbitratedPoolLock(roles)
```

## 验证

```bash
npm run build
npm test -- --runInBand
go test ./...
```

Rust 目录只保留通用 `m-of-n` 数学和脚本能力；涉及池角色的交叉验证使用同一套 v3 角色顺序。
