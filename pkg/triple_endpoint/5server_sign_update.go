package triple_endpoint

import (
	"fmt"

	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
	// primitives "github.com/bsv-blockchain/go-sdk/primitives/ec"
	multisig "github.com/bsv8/MultisigPool/pkg/libs"

	tx "github.com/bsv-blockchain/go-sdk/transaction"
	sighash "github.com/bsv-blockchain/go-sdk/transaction/sighash"
)

// 双端费用池，分配资金, server 签名
// client -> server 修改金额和版本号
func ClientBTripleFeePoolSpendTXUpdateSign(
	tx *tx.Transaction,
	serverPublicKey *ec.PublicKey,
	aPublicKey *ec.PublicKey,
	bPrivateKey *ec.PrivateKey,
) (*[]byte, error) {
	sigHash := sighash.Flag(sighash.ForkID | sighash.All)
	aMultisigUnlockingScriptTemplate, err := multisig.Unlock([]*ec.PrivateKey{bPrivateKey}, []*ec.PublicKey{serverPublicKey, aPublicKey, bPrivateKey.PubKey()}, 2, &sigHash)
	if err != nil {
		return nil, fmt.Errorf("failed to create unlocking script template: %w", err)
	}

	// 重新签名所有输入
	ClientBSignByte, err := aMultisigUnlockingScriptTemplate.SignOne(tx, 0, bPrivateKey)
	if err != nil {
		return nil, fmt.Errorf("d 重新签名输入 %d 失败: %v", 1, err)
	}

	return ClientBSignByte, nil
}
