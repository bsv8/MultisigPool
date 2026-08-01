# MultisigPool 打包和发布

## 版本号管理

NPM 包、Go 常量和 Git 标签使用同一个发布版本：

- NPM：`package.json` 和 `package-lock.json` 中的 `version` 字段，格式为 `X.Y.Z`
- Go：`pkg/index.go` 中的 `Version` 常量，格式为 `X.Y.Z`
- Git：使用 `vX.Y.Z` 格式的标签

例如，发布版本 `2.1.0` 对应：

```text
NPM: keymaster-multisig-pool@2.1.0
Go:  github.com/bsv8/MultisigPool@v2.1.0
Git: v2.1.0
```

## 构建命令

```bash
# 构建所有
npm run build:all

# 仅构建 TypeScript
npm run build

# 仅验证 Go 编译
npm run build:go
```

## 发布命令

```bash
# 统一发布 NPM + Go (推荐)
npm run publish:all

# 仅发布 NPM 包
npm run publish:npm  

# 仅发布 Go 模块
npm run publish:go
```

## 发布流程

1. 统一发布会询问版本号 (例如: `2.1.0`)
2. 自动更新 `package.json`、`package-lock.json` 和 `pkg/index.go`
3. 运行测试和构建
4. 创建 Git 标签 `vX.Y.Z`
5. 发布到 NPM 和 Go 模块代理
