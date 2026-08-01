#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

bash examples/rust_go_comparison/run_cross_validation.sh
go run examples/two_party_pool_compare/compare.go
go run examples/arbitrated_pool_compare/compare.go
