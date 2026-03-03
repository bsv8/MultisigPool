# MultisigPool

一个现代化的多签池实现，同时支持 TypeScript 和 Go 两种语言。

## 🚀 特性

- **双语言支持**: 提供 TypeScript SDK 和 Go 包
- **标准化结构**: 采用业界最佳实践的项目结构
- **完整的工具链**: 构建、测试、发布一体化
- **类型安全**: TypeScript 和 Go 都提供完整的类型定义
- **易于使用**: 简洁的 API 设计和详细的文档

## 📁 项目结构

```
MultisigPool/
├── cmd/                    # Go 应用程序入口
│   └── server/            # HTTP 服务器
├── internal/              # Go 内部包（标准 Go 项目布局）
│   ├── config/           # 配置管理
│   ├── handler/          # HTTP 处理器
│   ├── service/          # 业务逻辑
│   ├── repository/       # 数据访问层
│   └── middleware/       # 中间件
├── pkg/                   # Go 公共包
├── src/                   # TypeScript 源码
├── dist/                  # TypeScript 构建输出
├── build/                 # Go 构建输出
├── test/                  # TypeScript 测试
├── scripts/               # 构建和发布脚本
└── docs/                  # 详细文档
```

## 🛠️ 快速开始

### 安装依赖

```bash
make install
```

### 开发

```bash
make dev
```

### 构建

```bash
make build
```

### 测试

```bash
make test
```

## 📚 文档

详细文档请查看 [docs/README.md](docs/README.md)

## 🎯 改进点

相比于原始的 KeymasterProto 项目，本项目在以下方面进行了改进：

### Go 项目结构改进
- ✅ 采用标准的 Go 项目布局（`cmd/`, `internal/`, `pkg/`）
- ✅ 清晰的分层架构（handler, service, repository）
- ✅ 配置管理独立模块
- ✅ 接口驱动的设计

### TypeScript 项目保持优势
- ✅ 保持了原有的 npm 结构优势
- ✅ 现代化的构建工具（tsup）
- ✅ 完整的类型定义
- ✅ 支持 ESM 和 CJS 双格式输出

### 工具链改进
- ✅ 统一的 Makefile 管理
- ✅ 自动化的构建脚本
- ✅ 完整的测试覆盖
- ✅ 标准化的发布流程

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License
keymaster multisig pool
