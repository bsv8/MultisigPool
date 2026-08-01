# Rust v3 实现说明

## 定位

`rust/` 是面向 WebAssembly 和原生测试的 Rust 多签核心库，协议版本为 `bitfs.pool.v3` / `3`。npm、Go module 与 Rust crate 发布版本统一为 `3.0.0`；发布版本不参与交易协议校验。Rust 核心库负责 P2MS 锁定脚本、假签名脚本、签名脚本组合以及 ECDSA 预哈希签名等核心能力。

Rust 的协议与 crate 版本常量由 `rust/src/version.rs` 生成，版本事实源为 `release/versions.json`。该文件与 Go、TypeScript 的生成版本文件一样禁止手工修改。

Rust 核心库不代替 Go/TypeScript 的完整交易池 API。完整交易字节交叉验证由仓库中的对照程序负责：

- `examples/rust_go_comparison/` 验证 2-of-2 Buyer/Seller 交易步骤。
- `examples/two_party_pool_compare/` 验证 Go/TypeScript 2-of-2 字节。
- `examples/arbitrated_pool_compare/` 验证 Go/TypeScript 2-of-3 及三种两两签名合并字节。

## v3 角色与顺序

v3 的角色名称和顺序是协议的一部分：

- 2-of-2 锁定脚本：`[Buyer, Seller]`。
- 2-of-2 状态资金输出：`[Buyer, Seller]`。
- 2-of-3 锁定脚本：`[Buyer, Seller, Arbiter]`。
- 2-of-3 状态资金输出：`[Buyer, Seller]`；Arbiter 不获得资金输出。

签名使用 Bitcoin SV 的 `SIGHASH_ALL | SIGHASH_FORKID` 语义。多签解锁脚本保留 Bitcoin 的 `OP_0` 占位，并按照锁定脚本中的公钥顺序放置签名。

## 目录

```text
rust/
├── Cargo.toml
├── src/
│   ├── lib.rs
│   ├── error.rs
│   ├── types.rs
│   ├── multisig.rs
│   └── version.rs
├── tests/
├── examples/cross_validation.rs
└── examples/cross_validation_comparison.rs
```

## 构建与检查

在仓库根目录执行完整发布门禁：

```bash
PATH=/home/david/.cargo/bin:$PATH bash scripts/run_all_tests.sh
```

Rust 主 crate 的独立检查命令：

```bash
cargo fmt --manifest-path rust/Cargo.toml -- --check
cargo test --manifest-path rust/Cargo.toml --locked
cargo clippy --manifest-path rust/Cargo.toml --all-targets --all-features -- --deny warnings
```

Rust/Go 交易对照程序的检查命令：

```bash
cargo fmt --manifest-path examples/rust_go_comparison/Cargo.toml -- --check
cargo test --manifest-path examples/rust_go_comparison/Cargo.toml --locked
cargo clippy --manifest-path examples/rust_go_comparison/Cargo.toml --all-targets --all-features -- --deny warnings
bash examples/rust_go_comparison/run_cross_validation.sh
```

交叉验证脚本会比较 Step1–Step5 的实际交易十六进制字节；任一步不一致都会以非零退出码结束。

## Rust API 概览

核心 API 位于 `rust/src/multisig.rs`，包括：

- 根据公钥和 `m` 生成 M-of-N P2MS 锁定脚本。
- 生成确定长度的假签名脚本，用于交易大小和手续费计算。
- 使用私钥对预哈希进行 ECDSA 签名。
- 按公钥索引构建多签解锁脚本。
- 通过 `wasm-bindgen` 暴露 WASM 接口，并将错误转换为 `JsValue`。

依赖包括 `k256`、`sha2`、`serde`、`serde-wasm-bindgen`、`wasm-bindgen`、`thiserror` 和 `hex`。当前实现不依赖可选的 `bsv-wasm`，也不存在占位签名实现的发布声明。

## 兼容性边界

Rust 核心脚本和签名行为通过 Rust 单元测试及 Rust/Go 对照程序验证。完整三语言交易协议的发布判定由 `scripts/run_all_tests.sh` 统一执行，不能仅根据 Rust 核心库的单元测试宣称全部交易 API 已互相等价。
