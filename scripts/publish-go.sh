#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "Publishing the Go module..."

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

# 询问新版本
read -r -p "Enter the new version (for example v1.0.0): " NEW_VERSION

if [ -z "$NEW_VERSION" ]; then
    echo "ERROR: version must not be empty" >&2
    exit 1
fi

# 验证版本号格式
if ! [[ $NEW_VERSION =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "ERROR: version must match vX.Y.Z" >&2
    exit 1
fi

# 构建项目确保没有编译错误
echo "Running the release gate after selecting the version..."
bash scripts/run_all_tests.sh

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
echo "Notifying the Go module proxy..."
curl --fail --silent --show-error --request POST "https://proxy.golang.org/github.com/bsv8/MultisigPool/v3/@v/$NEW_VERSION.info"

echo "✅ Go 模块发布完成!"
echo "📦 模块地址: github.com/bsv8/MultisigPool/v3@$NEW_VERSION"
echo "🔗 导入方式: go get github.com/bsv8/MultisigPool/v3@$NEW_VERSION"
