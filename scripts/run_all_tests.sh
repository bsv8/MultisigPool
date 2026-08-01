#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# 版本一致性是完整门禁的第一项。
node scripts/release-versions.mjs check
node --test scripts/release-versions.test.mjs scripts/release-plan.test.mjs
npm test -- --runInBand
npm run lint
npm run build
go vet ./...
go test ./...
npx tsx examples/offline_two_party_pool/main.ts
go run examples/two_party_pool_compare/compare.go
go run examples/arbitrated_pool_compare/compare.go
if rg -n 'bitfs\.pool\.v3|github\.com/bsv8/MultisigPool/v3|arbitrated_pool_v3_fixture|Arbiter 不参与资金输出|Arbiter 不占用输出|协议版本是 `3`|协议为 `bitfs\.pool\.v4` / `3`|^# v3 |共用的 v3|通用 Rust 多签能力|Rust 核心库不代替|Go .*`/v3`' \
  pkg src tests testdata examples docs README.md RUST_IMPLEMENTATION.md PACKAGING.md; then
  echo "legacy v3 protocol identifiers were found in the current source or documentation" >&2
  exit 1
fi
if rg -n -i '\b(server|client)\b|serverAmount|clientAmount|SignAsA|SignAsB|3-of-2' \
  pkg src tests testdata examples docs README.md RUST_IMPLEMENTATION.md PACKAGING.md; then
  echo "legacy role identifiers were found in the public source or documentation" >&2
  exit 1
fi
if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo is required for the Rust release gate" >&2
  exit 1
fi
cargo fmt --manifest-path rust/Cargo.toml -- --check
cargo test --manifest-path rust/Cargo.toml --locked
if ! command -v rustup >/dev/null 2>&1; then
  echo "rustup is required for the WASM release gate" >&2
  exit 1
fi
if ! rustup target list --installed | rg -qx 'wasm32-unknown-unknown'; then
  echo "wasm32-unknown-unknown target is required for the WASM release gate" >&2
  exit 1
fi
if ! command -v wasm-bindgen-test-runner >/dev/null 2>&1; then
  echo "wasm-bindgen-test-runner is required for the WASM release gate" >&2
  exit 1
fi
cargo test --manifest-path rust/Cargo.toml --target wasm32-unknown-unknown --test arbitrated_pool_wasm_test --features wasm-test --locked
cargo clippy --manifest-path rust/Cargo.toml --all-targets --all-features -- --deny warnings
cargo fmt --manifest-path examples/rust_go_comparison/Cargo.toml -- --check
cargo test --manifest-path examples/rust_go_comparison/Cargo.toml --locked
cargo clippy --manifest-path examples/rust_go_comparison/Cargo.toml --all-targets --all-features -- --deny warnings
bash examples/rust_go_comparison/run_cross_validation.sh
