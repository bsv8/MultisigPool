package chain_utils

import (
	"testing"

	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
)

// 该测试构造最小化的双端花费交易，并验证辅助验签函数的正确性。
func TestDualVerifySignatures(t *testing.T) {
	clientPriv, _ := ec.PrivateKeyFromHex("903b1b2c396f17203fa83444d72bf5c666119d9d681eb715520f99ae6f92322c")
	serverPriv, _ := ec.PrivateKeyFromHex("a2d2ca4c19e3c560792ca751842c29b9da94be09f712a7f9ba7c66e64a354829")

	// 通过现有构建函数模拟 Step1/Step2（完整流程可参考 examples/txtest）。
	// 为保持单测简洁，这里借助 SubBuildDualFeePoolSpendTX 和伪造的前序交易 ID 搭建场景。
	// 集成测试已覆盖交易十六进制一致性，本用例仅聚焦验签逻辑。

	// 使用伪造的前序交易 ID 通过 SubBuildDualFeePoolSpendTX 构造最小化的 B-Tx。
	total := uint64(50000)
	serverAmount := uint64(100)
	btx, _, err := SubBuildDualFeePoolSpendTX(
		"00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
		total,
		serverAmount,
		800000,
		clientPriv,
		serverPriv.PubKey(),
		true,
		0.5,
	)
	if err != nil {
		t.Fatalf("sub build: %v", err)
	}

	// 复用现有函数获取客户端签名。
	clientSig, err := SpendTXDualFeePoolClientSign(btx, total, clientPriv, serverPriv.PubKey())
	if err != nil {
		t.Fatalf("client sign: %v", err)
	}

	// 复用现有函数获取服务器签名。
	serverSig, err := SpendTXServerSign(btx, total, serverPriv, clientPriv.PubKey())
	if err != nil {
		t.Fatalf("server sign: %v", err)
	}

	ok, err := ServerVerifyClientSpendSig(btx, total, serverPriv.PubKey(), clientPriv.PubKey(), clientSig)
	if err != nil || !ok {
		t.Fatalf("server verify client failed: %v", err)
	}

	ok, err = ClientVerifyServerSpendSig(btx, total, serverPriv.PubKey(), clientPriv.PubKey(), serverSig)
	if err != nil || !ok {
		t.Fatalf("client verify server failed: %v", err)
	}

	// 负向用例：篡改 sighash 标志位。
	bad := make([]byte, len(*clientSig))
	copy(bad, *clientSig)
	bad[len(bad)-1] ^= 0xff
	ok, _ = ServerVerifyClientSpendSig(btx, total, serverPriv.PubKey(), clientPriv.PubKey(), &bad)
	if ok {
		t.Fatalf("expected false on tampered flag")
	}
}
