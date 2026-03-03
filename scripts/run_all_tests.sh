#!/bin/bash

echo "=== Running All Tests ==="
echo

echo "1. Running TypeScript Tests..."
echo "================================"
npm test tests/

echo
echo "2. Running Go Tests..."
echo "======================"
go test ./pkg/... -v

echo
echo "3. Running Integration Tests..."
echo "==============================="
echo "Running dual endpoint comparison test..."
go run examples/txtest/compare.go

echo
echo "Running triple endpoint comparison test..."
go run examples/triplextest/compare.go

echo
echo "=== All Tests Completed ==="