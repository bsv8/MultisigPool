# v3 打包与发布

这是一次破坏性协议发布：不支持旧池原地升级，不保留 v2 API、旧导入路径或自动降级。

- npm：`keymaster-multisig-pool@3.0.0`
- Go：`github.com/bsv8/MultisigPool/v3`
- Rust crate：`0.2.0`
- 协议：`bitfs.pool.v3`，版本 `3`

发布前必须依次通过 TypeScript、Go、Rust（环境可用时）测试和三语言交叉验证。任一语言失败都必须停止发布。发布脚本不得手工编辑 `dist/`；构建生成物只能由 `npm run build` 产生。

历史 v2 池必须由 v2 tag 对应的独立工具链继续处理，不能把 v2 的交易、签名或持久化记录送入 v3。
