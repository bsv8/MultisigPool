#!/bin/bash

# Go 模块发布脚本
set -e

echo "🚀 发布 Go 模块..."

# 检查是否有未提交的更改
if ! git diff --quiet; then
    echo "❌ 有未提交的更改，请先提交代码"
    exit 1
fi

# 检查是否在正确的分支
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "master" ]; then
    echo "⚠️  当前不在主分支，当前分支: $CURRENT_BRANCH"
    read -p "是否继续发布? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 运行测试
echo "🧪 运行测试..."
go test ./pkg/...

# 运行 go mod tidy
echo "🧹 整理依赖..."
go mod tidy

# 获取当前版本
CURRENT_VERSION=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
echo "当前版本: $CURRENT_VERSION"

# 询问新版本
read -p "输入新版本号 (例如 v1.0.0): " NEW_VERSION

if [ -z "$NEW_VERSION" ]; then
    echo "❌ 版本号不能为空"
    exit 1
fi

# 验证版本号格式
if ! [[ $NEW_VERSION =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "❌ 版本号格式不正确，应该是 vX.Y.Z 格式"
    exit 1
fi

# 构建项目确保没有编译错误
echo "🔨 构建项目..."
go build ./...

# 创建 git tag
echo "🏷️  创建 git tag: $NEW_VERSION"
git tag $NEW_VERSION

# 推送 tag
echo "📤 推送 tag 到远程仓库..."
git push origin $NEW_VERSION

# 创建 GitHub release（如果安装了 gh CLI）
if command -v gh &> /dev/null; then
    echo "📝 创建 GitHub release..."
    gh release create $NEW_VERSION \
        --generate-notes \
        --title "Release $NEW_VERSION"
else
    echo "💡 提示: 安装 GitHub CLI (gh) 可以自动创建 release"
fi

# 通知 Go 模块代理
echo "🔄 通知 Go 模块代理..."
curl -X POST "https://proxy.golang.org/github.com/bsv8/MultisigPool/@v/$NEW_VERSION.info" || true

echo "✅ Go 模块发布完成!"
echo "📦 模块地址: github.com/bsv8/MultisigPool@$NEW_VERSION"
echo "🔗 导入方式: go get github.com/bsv8/MultisigPool@$NEW_VERSION" 