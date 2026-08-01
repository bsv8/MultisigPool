#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

bash scripts/run_all_tests.sh

go test ./pkg/... -coverprofile=coverage.out
go tool cover -html=coverage.out -o coverage.html
