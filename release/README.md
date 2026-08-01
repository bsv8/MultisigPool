# 版本清单

`versions.json` 是协议与三语言包版本的唯一人工事实源。

修改步骤：

1. 只修改 `versions.json`，保持协议字段与包版本边界不变。
2. 执行 `node scripts/release-versions.mjs sync`，生成 Go、TypeScript、Rust 版本文件并同步包锁文件。
3. 审查生成结果和交易协议测试，执行 `node scripts/release-versions.mjs check`。
4. 三语言发布只使用 `scripts/release-all.sh`，不从命令行输入版本。

协议版本是交易校验字段；npm、Go 和 Rust 版本是各自包的发布版本。Go tag 为 `v` 加 Go 版本，Rust tag 为 `rust-v` 加 Rust 版本。npm 从项目目录发布以生成当前 commit 的 `gitHead`，预构建包用于 integrity 校验；发布验证还会检查 Go proxy 的大小写转义 module path，并用 Rust crate checksum 与 `.cargo_vcs_info.json` 证明产物来自当前 commit。
