# v3 打包与发布

这是一次破坏性协议发布：不支持旧池原地升级，不保留 v2 API、旧导入路径或自动降级。

## 版本边界

唯一可人工修改的版本事实源是 `release/versions.json`：

- 协议标识：`bitfs.pool.v3`
- 协议版本：`3`
- npm：`keymaster-multisig-pool@3.0.0`
- Go module：`github.com/bsv8/MultisigPool/v3`，tag 为 `v3.0.0`
- Rust crate：`keymaster-multisig-rust@3.0.0`，源码追踪 tag 为 `rust-v3.0.0`

协议版本参与交易校验，发布版本只描述对应语言包。npm、Go 和 Rust 必须保持完全相同的发布版本。生成的 `internal/versioninfo/version.go`、`src/version.ts`、`rust/src/version.rs`、包文件和锁文件均不得手工修改。

修改清单后先运行：

```bash
node scripts/release-versions.mjs sync
node scripts/release-versions.mjs check
```

`sync` 只同步允许的镜像并自动检查，不访问网络、不提交 Git、不创建 tag、不调用 registry。缺字段、未知字段、版本格式错误或目标结构异常都会以英文错误直接失败。

## 发布入口与前置检查

唯一公开发布入口是 `scripts/release-all.sh`，`package.json` 的 `release` 命令只指向这个脚本。脚本固定读取版本清单，不接受临时版本、不交互确认、不自动猜测、不重试替代版本，也不创建 GitHub Release。

正常发布顺序为：完整版本检查和三语言门禁、npm 与 Rust dry-run、Go `/v3` 临时消费者编译、registry/tag/认证检查、本地创建两个 tag、使用固定 npmjs registry 发布 npm、使用 `crates-io` registry 发布 Rust、原子推送两个 tag，最后验证 npm、crates.io 和 Go proxy。

发布前必须满足：当前分支是 `main`，工作树、暂存区和未跟踪文件为空，HEAD 已包含在 `origin/main`，且所有外部目标版本和 tag 尚不存在。npm、Rust、Git 或 registry 的网络、认证、限流及未知响应都会直接失败。registry 请求使用描述性 `User-Agent`，只有明确的 HTTP 404 才表示版本不存在。

发布 npm 时使用项目目录而不是预构建 `.tgz`，让 npm 从当前干净 Git 工作树生成 registry metadata 并写入 `gitHead`；预构建包仍作为 `dist.integrity` 的精确校验基准。发布完成验证时，Go proxy 请求使用 Go 规定的大小写转义 module path `github.com/bsv8/!multisig!pool/v3`；Rust crate 必须同时通过 crates.io checksum 和归档内 `.cargo_vcs_info.json` 的当前 commit/clean 状态校验，不能只依据 crate 名称和版本号判定来源。

## 恢复规则

恢复不更换版本、不覆盖 tag、不重复发布已经成功的包：

- npm 成功、Rust 未成功：`scripts/release-all.sh --resume-from rust`
- npm 与 Rust 成功、tag 推送未完成：`scripts/release-all.sh --resume-from tags`
- tag 已推送但 Go proxy 尚未可解析：`scripts/release-all.sh --resume-from verify`

每个恢复点都会重新执行版本检查、完整测试和必要的产物验证。恢复点必须显式指定，不能自动判断或跳过步骤；`verify` 只读验证，不产生外部写操作。

历史 v2 池必须由 v2 tag 对应的独立工具链继续处理，不能把 v2 的交易、签名或持久化记录送入 v3。
