#!/bin/bash

# 测试脚本
set -e

echo "🧪 运行测试..."

# 运行 TypeScript 测试
echo "📝 运行 TypeScript 测试..."
npm test

# 运行 Go 测试
echo "🚀 运行 Go 测试..."
go test ./pkg/... -v

# 运行 Go 测试覆盖率
echo "📊 生成 Go 测试覆盖率报告..."
go test ./pkg/... -coverprofile=coverage.out
go tool cover -html=coverage.out -o coverage.html

echo "✅ 所有测试完成!"
echo "📁 覆盖率报告: coverage.html" 