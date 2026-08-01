# TwoPartyPool v4 规范

2-of-2 锁定脚本公钥顺序固定为 `[Buyer, Seller]`。Buyer 是唯一建池出资方，Seller 是结算收款方。

状态交易只允许两个资金输出：`output[0]` 锁定 Buyer 地址，`output[1]` 锁定 Seller 地址。手续费从 Buyer 的剩余金额中扣除，Arbiter 不存在于此协议。

所有签名必须针对同一份未签名交易、同一源输出和 `SIGHASH_ALL | SIGHASH_FORKID` 计算。合并时先按角色公钥验签，再按 `[Buyer, Seller]` 组装解锁脚本。角色重复、角色换位、源输出不匹配、sequence 不递增和余额不足都直接返回英文错误。
