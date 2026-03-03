#!/bin/bash

# NPM 发布脚本
set -e

echo "📦 发布 NPM 包..."

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
npm test

# 构建项目
echo "🔨 构建项目..."
npm run build

# 检查构建输出
if [ ! -d "dist" ]; then
    echo "❌ 构建失败，dist 目录不存在"
    exit 1
fi

# 获取当前版本
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "当前版本: $CURRENT_VERSION"

# 询问版本更新类型
echo "选择版本更新类型:"
echo "1) patch (修复版本)"
echo "2) minor (功能版本)"
echo "3) major (重大版本)"
echo "4) 自定义版本"
read -p "请选择 (1-4): " VERSION_TYPE

case $VERSION_TYPE in
    1)
        npm version patch
        ;;
    2)
        npm version minor
        ;;
    3)
        npm version major
        ;;
    4)
        read -p "输入新版本号: " NEW_VERSION
        npm version $NEW_VERSION
        ;;
    *)
        echo "❌ 无效选择"
        exit 1
        ;;
esac

# 获取新版本
NEW_VERSION=$(node -p "require('./package.json').version")
echo "新版本: $NEW_VERSION"

# 推送 git 标签
echo "📤 推送 git 标签..."
git push origin --tags

# 发布到 npm
echo "📦 发布到 npm..."
npm publish

echo "✅ NPM 包发布完成!"
echo "📦 包名: keymaster-multisig-pool@$NEW_VERSION"
echo "🔗 查看: https://www.npmjs.com/package/keymaster-multisig-pool"