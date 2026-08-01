#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo is required for Rust cross-validation" >&2
  exit 1
fi

rust_output="$(cargo run --manifest-path examples/rust_go_comparison/Cargo.toml --quiet)"
go_output="$(go run examples/rust_go_comparison/go_runner/main.go)"

for step in 1 2 3 4 5; do
  rust_value="$(printf '%s\n' "$rust_output" | awk -v step="$step" '$1 == "Step" step "Hex" {print $2}')"
  go_value="$(printf '%s\n' "$go_output" | awk -v step="$step" '$1 == "Step" step "Hex" {print $2}')"
  if [[ -z "$rust_value" || -z "$go_value" ]]; then
    echo "missing Step${step}Hex output" >&2
    exit 1
  fi
  if [[ "$rust_value" != "$go_value" ]]; then
    echo "Rust and Go mismatch at Step${step}Hex" >&2
    echo "Rust: $rust_value" >&2
    echo "Go:   $go_value" >&2
    exit 1
  fi
  echo "MATCH Step${step}Hex"
done

echo "PASS: Rust and Go bytes are identical"
