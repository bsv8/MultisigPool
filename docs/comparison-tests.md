# v3 跨语言验证

Go 和 TypeScript 必须使用同一份确定性角色定义：2-of-2 为 `[Buyer, Seller]`，2-of-3 为 `[Buyer, Seller, Arbiter]`；状态资金输出为 `[Buyer, Seller]`。

验证范围包括锁定脚本字节、状态交易字节、txid、签名和三种 2-of-3 合并结果。比较失败立即退出，不按旧协议重试。

Rust 只对通用多签脚本和签名数学做交叉验证；池业务字段使用 `bitfs.pool.v3` 的共享 fixture。
