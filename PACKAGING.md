# MultisigPool 打包和发布

## 版本号管理

### NPM 包版本
- 文件：`package.json` 中的 `version` 字段
- 格式：`X.Y.Z` (例如: `1.0.0`)

### Go 模块版本  
- 文件：`pkg/index.go` 中的 `Version` 常量
- 格式：`X.Y.Z` (例如: `1.0.0`)
- Git 标签格式：`vX.Y.Z` (例如: `v1.0.0`)

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

1. 统一发布会询问版本号 (例如: `1.0.0`)
2. 自动更新 `package.json` 版本
3. 需要手动更新 `pkg/index.go` 中的 `Version` 常量
4. 创建 git 标签 `vX.Y.Z`
5. 发布到 NPM 和 Go 模块代理