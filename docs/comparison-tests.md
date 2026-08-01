# v4 跨语言验证

TypeScript、Go 和 Rust 必须使用同一份确定性角色定义：2-of-2 为 `[Buyer, Seller]`，2-of-3 为 `[Buyer, Seller, Arbiter]`；仲裁池状态资金输出为 `[Buyer, Seller, Arbiter]`，付款证明位于 `output[3]`。

验证范围包括锁定脚本字节、状态交易字节、txid、签名和三种 2-of-3 合并结果。比较失败立即退出，不按旧协议重试。

Rust 直接调用发布 crate 的完整仲裁池 API；共享 fixture 由三种语言独立重建并逐字节比较。
