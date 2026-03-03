# MultisigPool Makefile

.PHONY: help build test clean install dev lint format rust-build rust-test rust-cross-validate

# 默认目标
help:
	@echo "可用的命令:"
	@echo "  build     - 构建项目 (TypeScript + Go)"
	@echo "  test      - 运行测试"
	@echo "  clean     - 清理构建文件"
	@echo "  install   - 安装依赖"
	@echo "  dev       - 开发模式"
	@echo "  lint      - 代码检查"
	@echo "  format    - 代码格式化"
	@echo "  publish   - 发布项目"
	@echo ""
	@echo "Rust 相关命令:"
	@echo "  rust-build         - 构建 Rust 项目"
	@echo "  rust-test          - 运行 Rust 测试"
	@echo "  rust-cross-validate - 运行 Rust-Golang 交叉验证"

# 安装依赖
install:
	@echo "📦 安装 Node.js 依赖..."
	npm install
	@echo "📦 下载 Go 依赖..."
	go mod download
	@echo "✅ 依赖安装完成"

# 构建项目
build:
	@echo "🔨 构建项目..."
	./scripts/build.sh

# 运行测试
test:
	@echo "🧪 运行测试..."
	./scripts/test.sh

# 清理构建文件
clean:
	@echo "🧹 清理构建文件..."
	rm -rf dist coverage.out coverage.html node_modules/.cache
	@echo "✅ 清理完成"

# 开发模式
dev:
	@echo "🚀 启动开发模式..."
	npm run dev

# 代码检查
lint:
	@echo "🔍 代码检查..."
	npm run lint
	npm run lint:go

# 代码格式化
format:
	@echo "✨ 代码格式化..."
	npx prettier --write "src/**/*.ts"
	go fmt ./...

# 发布项目
publish:
	@echo "📦 发布项目..."
	npm run publish:all

# Go 相关命令
go-build:
	@echo "🚀 验证 Go 项目编译..."
	go build ./pkg/...

go-test:
	@echo "🧪 运行 Go 测试..."
	go test ./... -v

go-mod:
	@echo "🧹 整理 Go 依赖..."
	go mod tidy

# TypeScript 相关命令
ts-build:
	@echo "📦 构建 TypeScript 项目..."
	npm run build

ts-test:
	@echo "🧪 运行 TypeScript 测试..."
	npm test

ts-dev:
	@echo "🚀 TypeScript 开发模式..."
	npm run dev

# Rust 相关命令
rust-build:
	@echo "🦀 构建 Rust 项目..."
	cd rust && cargo build --release

rust-test:
	@echo "🧪 运行 Rust 测试..."
	cd rust && cargo test

rust-cross-validate:
	@echo "🔄 运行 Rust-Golang 交叉验证..."
	./scripts/run_rust_go_cross_validation.sh

rust-clean:
	@echo "🧹 清理 Rust 构建文件..."
	cd rust && cargo clean

rust-doc:
	@echo "📚 生成 Rust 文档..."
	cd rust && cargo doc --no-deps --open

# 完整的三语言测试 (TypeScript + Go + Rust)
all-test:
	@echo "🧪 运行所有语言测试..."
	@echo "Running TypeScript tests..."
	npm test
	@echo ""
	@echo "Running Go tests..."
	go test ./... -v
	@echo ""
	@echo "Running Rust tests..."
	cd rust && cargo test
	@echo ""
	@echo "Running cross-validation..."
	./scripts/run_rust_go_cross_validation.sh 