#!/bin/bash

# 统一发布脚本 - 同时发布 NPM 和 Go 模块
set -e

echo "🚀 开始统一发布流程..."

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

# 运行所有测试
echo "🧪 运行所有测试..."
npm test
go test ./pkg/...

# 询问版本号
echo "请输入版本号 (不带 v 前缀，例如: 1.0.0):"
read VERSION

if [ -z "$VERSION" ]; then
    echo "❌ 版本号不能为空"
    exit 1
fi

# 验证版本号格式
if ! [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "❌ 版本号格式不正确，应该是 X.Y.Z 格式"
    exit 1
fi

NPM_VERSION=$VERSION
GO_VERSION="v$VERSION"

echo "📦 将要发布的版本:"
echo "  NPM: $NPM_VERSION"
echo "  Go:  $GO_VERSION"

read -p "确认发布? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ 发布已取消"
    exit 1
fi

# 更新 package.json 版本
echo "📝 更新 package.json 版本..."
npm version $NPM_VERSION --no-git-tag-version

# 构建项目
echo "🔨 构建项目..."
npm run build
./scripts/build.sh

# 提交版本更改
echo "💾 提交版本更改..."
git add package.json package-lock.json
git commit -m "chore: bump version to $VERSION"

# 创建并推送 git tag
echo "🏷️  创建 git tag..."
git tag $GO_VERSION
git push origin main
git push origin $GO_VERSION

# 发布 NPM 包
echo "📦 发布 NPM 包..."
npm publish

# 通知 Go 模块代理
echo "🔄 通知 Go 模块代理..."
curl -X POST "https://proxy.golang.org/github.com/bsv8/MultisigPool/@v/$GO_VERSION.info" || true

# 创建 GitHub release（如果安装了 gh CLI）
if command -v gh &> /dev/null; then
    echo "📝 创建 GitHub release..."
    gh release create $GO_VERSION \
        --generate-notes \
        --title "Release $GO_VERSION"
else
    echo "💡 提示: 安装 GitHub CLI (gh) 可以自动创建 release"
fi

echo "✅ 统一发布完成!"
echo ""
echo "📦 发布信息:"
echo "  NPM: keymaster-multisig-pool@$NPM_VERSION"
echo "  Go:  github.com/bsv8/MultisigPool@$GO_VERSION"
echo ""
echo "🔗 使用方式:"
echo "  NPM: npm install keymaster-multisig-pool@$NPM_VERSION"
echo "  Go:  go get github.com/bsv8/MultisigPool@$GO_VERSION"