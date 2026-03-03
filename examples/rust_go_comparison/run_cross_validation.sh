#!/bin/bash

set -e

echo "=== Rust vs Golang Cross-Validation ==="
echo ""

# Get current directory
DIR=$(cd "$(dirname "$0")" && pwd)
echo "Working directory: $DIR"
echo ""

# Change to script directory
cd "$DIR"

# Clean up any previous builds
rm -f rust_runner 2>/dev/null || true

# Compile Rust runner
echo "Step 1: Compiling Rust runner..."
cargo build --release
if [ $? -eq 0 ]; then
    echo "✅ Rust compilation successful"
else
    echo "❌ Rust compilation failed"
    exit 1
fi
echo ""

# Run Rust implementation
echo "Step 2: Running Rust implementation..."
RUST_OUTPUT=$(./target/release/rust-go-comparison)
echo "$RUST_OUTPUT"
echo ""

# Extract Rust results
RUST_STEP1=$(echo "$RUST_OUTPUT" | grep "Step1Hex" | awk '{print $2}')
RUST_STEP2=$(echo "$RUST_OUTPUT" | grep "Step2Hex" | awk '{print $2}')
RUST_STEP3=$(echo "$RUST_OUTPUT" | grep "Step3Hex" | awk '{print $2}')
RUST_STEP4=$(echo "$RUST_OUTPUT" | grep "Step4Hex" | awk '{print $2}')
RUST_STEP5=$(echo "$RUST_OUTPUT" | grep "Step5Hex" | awk '{print $2}')

# Run Golang implementation
echo "Step 3: Running Golang implementation..."
GO_OUTPUT=$(go run main.go)
echo "$GO_OUTPUT"
echo ""

# Extract Golang results
GO_STEP1=$(echo "$GO_OUTPUT" | grep "Step1Hex" | awk '{print $2}')
GO_STEP2=$(echo "$GO_OUTPUT" | grep "Step2Hex" | awk '{print $2}')
GO_STEP3=$(echo "$GO_OUTPUT" | grep "Step3Hex" | awk '{print $2}')
GO_STEP4=$(echo "$GO_OUTPUT" | grep "Step4Hex" | awk '{print $2}')
GO_STEP5=$(echo "$GO_OUTPUT" | grep "Step5Hex" | awk '{print $2}')

# Compare results
echo "=== Comparison Results ==="
PASS=true

echo "Step 1: Base Transaction"
if [ "$RUST_STEP1" = "$GO_STEP1" ]; then
    echo "✅ MATCH"
else
    echo "❌ MISMATCH"
    echo "   Rust: $RUST_STEP1"
    echo "   Go:   $GO_STEP1"
    PASS=false
fi

echo "Step 2: Client Sign"
if [ "$RUST_STEP2" = "$GO_STEP2" ]; then
    echo "✅ MATCH"
else
    echo "❌ MISMATCH"
    echo "   Rust: $RUST_STEP2"
    echo "   Go:   $GO_STEP2"
    PASS=false
fi

echo "Step 3: Server Sign"
if [ "$RUST_STEP3" = "$GO_STEP3" ]; then
    echo "✅ MATCH"
else
    echo "❌ MISMATCH"
    echo "   Rust: $RUST_STEP3"
    echo "   Go:   $GO_STEP3"
    PASS=false
fi

echo "Step 4: Client Update Sign"
if [ "$RUST_STEP4" = "$GO_STEP4" ]; then
    echo "✅ MATCH"
else
    echo "❌ MISMATCH"
    echo "   Rust: $RUST_STEP4"
    echo "   Go:   $GO_STEP4"
    PASS=false
fi

echo "Step 5: Server Update Sign"
if [ "$RUST_STEP5" = "$GO_STEP5" ]; then
    echo "✅ MATCH"
else
    echo "❌ MISMATCH"
    echo "   Rust: $RUST_STEP5"
    echo "   Go:   $GO_STEP5"
    PASS=false
fi

echo ""
if [ "$PASS" = true ]; then
    echo "🎉 PASS: Rust and Golang implementations produce identical results!"
else
    echo "❌ FAIL: Rust and Golang implementations differ"
fi

echo ""
echo "=== Cross-Validation Complete ==="