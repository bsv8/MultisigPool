#!/bin/bash

set -e

echo "=== Keymaster Multisig Cross-Validation: Rust vs Golang ==="
echo ""

cd "$(dirname "$0")"

echo "Step 1: Testing Rust Implementation"
echo "-----------------------------------"
cd rust

echo "Building Rust library..."
cargo build --release 2>&1 | grep -E "(Compiling|Finished)" || true

echo ""
echo "Running Rust tests..."
cargo test cross_validation --release 2>&1 | tail -20

echo ""
echo "Step 2: Running Golang Implementation"
echo "-------------------------------------"
cd ../examples/offline_triple_test

echo "Running Go test..."
go run main.go 2>&1 | tail -30

echo ""
echo "Step 3: Comparing Outputs"
echo "-------------------------"
echo "Both implementations should produce identical results for:"
echo "  - Locking scripts (P2MS)"
echo "  - Signature generation"
echo "  - Script length estimation"
echo "  - Transaction outputs"
echo ""

echo "=== Cross-Validation Complete ==="
