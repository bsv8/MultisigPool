#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "Publishing the npm package..."

if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
    echo "ERROR: working tree contains tracked, staged, or untracked changes" >&2
    exit 1
fi

# 检查是否在正确的分支
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "master" ]; then
    echo "ERROR: current branch is not main or master: $CURRENT_BRANCH" >&2
    read -r -p "Continue publishing? (y/N): " -n 1 REPLY
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

bash scripts/run_all_tests.sh

# 获取当前版本
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "当前版本: $CURRENT_VERSION"

# 询问版本更新类型
echo "Select the version update type:"
echo "1) patch"
echo "2) minor"
echo "3) major"
echo "4) custom"
read -r -p "Select (1-4): " VERSION_TYPE

case $VERSION_TYPE in
    1)
        npm version patch --no-git-tag-version
        ;;
    2)
        npm version minor --no-git-tag-version
        ;;
    3)
        npm version major --no-git-tag-version
        ;;
    4)
        read -r -p "Enter the new version: " NEW_VERSION
        npm version "$NEW_VERSION" --no-git-tag-version
        ;;
    *)
        echo "ERROR: invalid version selection" >&2
        exit 1
        ;;
esac

# 获取新版本
NEW_VERSION=$(node -p "require('./package.json').version")
echo "新版本: $NEW_VERSION"

echo "Running the release gate after selecting the version..."
bash scripts/run_all_tests.sh

# 推送 git 标签
echo "📤 推送 git 标签..."
git push origin --tags

# 发布到 npm
echo "📦 发布到 npm..."
npm publish

echo "✅ NPM 包发布完成!"
echo "📦 包名: keymaster-multisig-pool@$NEW_VERSION"
echo "🔗 查看: https://www.npmjs.com/package/keymaster-multisig-pool"
