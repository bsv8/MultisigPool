#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

npm test -- --runInBand
npm run lint
npm run build
go vet ./...
go test ./...
go run examples/two_party_pool_compare/compare.go
go run examples/arbitrated_pool_compare/compare.go
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
cargo clippy --manifest-path rust/Cargo.toml --all-targets --all-features -- --deny warnings
cargo fmt --manifest-path examples/rust_go_comparison/Cargo.toml -- --check
cargo test --manifest-path examples/rust_go_comparison/Cargo.toml --locked
cargo clippy --manifest-path examples/rust_go_comparison/Cargo.toml --all-targets --all-features -- --deny warnings
bash examples/rust_go_comparison/run_cross_validation.sh
