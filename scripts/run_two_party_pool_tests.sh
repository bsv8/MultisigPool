#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

go test ./pkg/two_party_pool -v
npx jest tests/two_party_pool --runInBand
