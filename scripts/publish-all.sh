#!/usr/bin/env bash

# 统一发布脚本 - 同时发布 NPM 和 Go 模块
set -euo pipefail

echo "🚀 开始统一发布流程..."

# 检查是否有未提交的更改
if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
    echo "ERROR: working tree contains tracked, staged, or untracked changes" >&2
    exit 1
fi

CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "master" ]; then
    echo "ERROR: current branch is not main or master: $CURRENT_BRANCH" >&2
    read -r -p "Continue publishing? (y/N): " -n 1 REPLY
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 运行所有测试
echo "Running the complete release gate..."
bash scripts/run_all_tests.sh

read -r -p "Enter the release version without the v prefix (for example 1.0.0): " VERSION

if [ -z "$VERSION" ]; then
    echo "ERROR: version must not be empty" >&2
    exit 1
fi

# 验证版本号格式
if ! [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "ERROR: version must match X.Y.Z" >&2
    exit 1
fi

NPM_VERSION=$VERSION
GO_VERSION="v$VERSION"

echo "📦 将要发布的版本:"
echo "  NPM: $NPM_VERSION"
echo "  Go:  $GO_VERSION"

read -r -p "Confirm publishing? (y/N): " -n 1 REPLY
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "ERROR: publishing was cancelled" >&2
    exit 1
fi

# 更新 NPM 版本
echo "📝 更新 package.json 版本..."
npm version "$NPM_VERSION" --no-git-tag-version

# 更新 Go 发布版本
GO_VERSION_FILE="pkg/index.go"
GO_VERSION_DECLARATIONS=$(grep -Ec '^const ReleaseVersion = "[0-9]+\.[0-9]+\.[0-9]+"$' "$GO_VERSION_FILE")
if [ "$GO_VERSION_DECLARATIONS" -ne 1 ]; then
    echo "ERROR: expected exactly one release version declaration in $GO_VERSION_FILE" >&2
    exit 1
fi
sed -i -E "s/^const ReleaseVersion = \"[0-9]+\.[0-9]+\.[0-9]+\"$/const ReleaseVersion = \"$VERSION\"/" "$GO_VERSION_FILE"

echo "Running the release gate after updating release metadata..."
bash scripts/run_all_tests.sh

# 提交版本更改
echo "💾 提交版本更改..."
git add package.json package-lock.json "$GO_VERSION_FILE"
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
curl --fail --silent --show-error --request POST "https://proxy.golang.org/github.com/bsv8/MultisigPool/v3/@v/$GO_VERSION.info"

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
echo "  Go:  github.com/bsv8/MultisigPool/v3@$GO_VERSION"
echo ""
echo "🔗 使用方式:"
echo "  NPM: npm install keymaster-multisig-pool@$NPM_VERSION"
echo "  Go:  go get github.com/bsv8/MultisigPool/v3@$GO_VERSION"
