#!/bin/bash

# 构建脚本
set -e

echo "🔨 开始构建项目..."

# 创建构建目录
mkdir -p dist

# 清理之前的构建
echo "🧹 清理之前的构建..."
rm -rf dist/*

# 构建 TypeScript
echo "📦 构建 TypeScript 项目..."
npm run build

# 验证 Go 项目编译
echo "🚀 验证 Go 项目编译..."
go build ./pkg/...

# 运行 Go 测试
echo "🧪 运行 Go 测试..."
go test ./pkg/...

# 整理 Go 依赖
echo "🧹 整理 Go 依赖..."
go mod tidy

echo "✅ 构建完成!"
echo "📁 TypeScript 输出: dist/"
echo "📦 Go 模块已验证编译和测试通过"