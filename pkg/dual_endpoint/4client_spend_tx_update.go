package chain_utils

import (
	"fmt"

	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
	"github.com/bsv-blockchain/go-sdk/transaction"

	// primitives "github.com/bsv-blockchain/go-sdk/primitives/ec"
	multisig "github.com/bsv8/MultisigPool/pkg/libs"

	tx "github.com/bsv-blockchain/go-sdk/transaction"
	sighash "github.com/bsv-blockchain/go-sdk/transaction/sighash"
)

// 最终 locaktime
const FINAL_LOCKTIME uint32 = 0xffffffff

// 合成两个签名
func LoadTx(
	txHex string,
	locktime *uint32,
	sequenceNumber uint32,
	serverAmount uint64,
	serverPublicKey *ec.PublicKey,
	clientPublicKey *ec.PublicKey,
	targetAmount uint64,
	// serverSignByte *[]byte,
	// clientSignByte *[]byte,
) (*transaction.Transaction, error) {
	// 恢复 bTx
	bTx, err := transaction.NewTransactionFromHex(txHex)
	if err != nil {
		return nil, err
	}

	if locktime != nil {
		bTx.LockTime = *locktime
	}

	// 创建优先级脚本
	priorityScript, err := multisig.Lock([]*ec.PublicKey{serverPublicKey, clientPublicKey}, 2)
	if err != nil {
		return nil, fmt.Errorf("创建优先级脚本失败: %v", err)
	}

	bTx.Inputs[0].SetSourceTxOutput(
		&tx.TransactionOutput{
			Satoshis:      targetAmount,
			LockingScript: priorityScript,
		},
	)

	// signs := [][]byte{*serverSignByte, *clientSignByte}
	// unScript, err := multisig.BuildSignScript(&signs)
	// if err != nil {
	// 	return nil, fmt.Errorf("BuildSignScript error: %v", err)
	// }

	// 更新输入
	// bTx.Inputs[0].UnlockingScript = unScript
	bTx.Inputs[0].SequenceNumber = sequenceNumber

	// 更新输出金额
	allAmount := bTx.Outputs[0].Satoshis + bTx.Outputs[1].Satoshis
	bTx.Outputs[0].Satoshis = serverAmount
	bTx.Outputs[1].Satoshis = allAmount - serverAmount

	// fmt.Printf("bTx 2: %s\n", bTx.Hex())

	return bTx, nil
}

// 双端费用池，分配资金, 客户端签名
// client -> server 修改金额和版本号
func ClientDualFeePoolSpendTXUpdateSign(
	tx *tx.Transaction,
	clientPrivateKey *ec.PrivateKey,
	serverPublicKey *ec.PublicKey,
) (*[]byte, error) {
	// if locktime != nil {
	// 	tx.LockTime = *locktime
	// }

	sigHash := sighash.Flag(sighash.ForkID | sighash.All)
	aMultisigUnlockingScriptTemplate, err := multisig.Unlock([]*ec.PrivateKey{}, []*ec.PublicKey{serverPublicKey, clientPrivateKey.PubKey()}, 2, &sigHash)
	if err != nil {
		return nil, fmt.Errorf("failed to create unlocking script template: %w", err)
	}

	// 重新签名所有输入
	clientSignByte, err := aMultisigUnlockingScriptTemplate.SignOne(tx, 0, clientPrivateKey)
	if err != nil {
		return nil, fmt.Errorf("c 重新签名输入 %d 失败: %v", 1, err)
	}

	return clientSignByte, nil
}
