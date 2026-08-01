package arbitrated_pool

import (
	"bytes"
	"fmt"
	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
	"github.com/bsv-blockchain/go-sdk/script"
	tx "github.com/bsv-blockchain/go-sdk/transaction"
	libs "github.com/bsv8/MultisigPool/v3/pkg/libs"
)

// BuildArbitratedPoolLock 构建固定为 [Buyer, Seller, Arbiter] 的 2-of-3 脚本。
func BuildArbitratedPoolLock(roles ArbitratedPoolRoles) (*script.Script, error) {
	if err := validateRoles(roles); err != nil {
		return nil, err
	}
	return libs.Lock([]*ec.PublicKey{roles.Buyer, roles.Seller, roles.Arbiter}, 2)
}

func validateSignature(signature []byte) error {
	if len(signature) < 10 {
		return fmt.Errorf("signature is empty or too short")
	}
	return nil
}
func sameScript(a, b *script.Script) bool {
	return a != nil && b != nil && bytes.Equal(a.Bytes(), b.Bytes())
}

func requireSource(state *tx.Transaction, amount uint64, lock *script.Script) error {
	if state == nil || len(state.Inputs) != 1 || state.Inputs[0] == nil {
		return fmt.Errorf("state must have exactly one input")
	}
	source := state.Inputs[0].SourceTxOutput()
	if source == nil || source.Satoshis != amount || !sameScript(source.LockingScript, lock) {
		return fmt.Errorf("state source output does not match configured pool")
	}
	return nil
}
