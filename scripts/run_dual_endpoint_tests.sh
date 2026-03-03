#!/usr/bin/env bash
# Unified runner for Dual Endpoint cross-language tests
# Usage:  ./scripts/run_dual_endpoint_tests.sh
# Exits non-zero on first failure.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[1/2] Go tests (dual_endpoint)"
GO111MODULE=on go test ./tests/dual_endpoint/...

echo "[2/2] TypeScript tests (dual_endpoint)"
# Assume npm/yarn workspace already bootstrapped and jest configured.
# You can change the command if using mocha or vitest.
if [ -f "package.json" ]; then
  npx jest tests/dual_endpoint/ts_dual_endpoint.test.ts --runInBand
else
  echo "package.json not found; skipping TS tests" && exit 1
fi

echo "[3/3] Cross-language structural validation"
cd tests/dual_endpoint
node structural_comparison.js

echo "All dual_endpoint tests and cross-language validation PASSED"
