package arbitrated_pool

import (
	"bytes"
	"fmt"
	"github.com/bsv-blockchain/go-sdk/chainhash"
	"github.com/bsv-blockchain/go-sdk/script"
	tx "github.com/bsv-blockchain/go-sdk/transaction"
	"github.com/bsv-blockchain/go-sdk/transaction/template/p2pkh"
	libs "github.com/bsv8/MultisigPool/v3/pkg/libs"
)

type StateInput struct {
	Protocol      string
	Version       uint32
	PreviousRawTx []byte
	// PreviousSourceOutput 在标准 raw transaction 不包含源输出元数据时显式提供源输出。
	PreviousSourceOutput *tx.TransactionOutput
	Sequence             uint32
	LockTime             *uint32
	BuyerAmount          uint64
	SellerAmount         uint64
	PoolAmount           uint64
	Roles                ArbitratedPoolRoles
	FeeRate              FeeSatPerKB
	PaymentProof         []byte
}

func clone(value *tx.Transaction) (*tx.Transaction, error) {
	if value == nil {
		return nil, fmt.Errorf("transaction is required")
	}
	copy, err := tx.NewTransactionFromBytes(value.Bytes())
	if err != nil {
		return nil, fmt.Errorf("copy transaction: %w", err)
	}
	return copy, nil
}

func scripts(roles ArbitratedPoolRoles) (*script.Script, *script.Script, *script.Script, error) {
	if err := validateRoles(roles); err != nil {
		return nil, nil, nil, err
	}
	lock, err := BuildArbitratedPoolLock(roles)
	if err != nil {
		return nil, nil, nil, err
	}
	buyerAddress, err := libs.GetAddressFromPublicKey(roles.Buyer, false)
	if err != nil {
		return nil, nil, nil, err
	}
	sellerAddress, err := libs.GetAddressFromPublicKey(roles.Seller, false)
	if err != nil {
		return nil, nil, nil, err
	}
	buyer, err := p2pkh.Lock(buyerAddress)
	if err != nil {
		return nil, nil, nil, err
	}
	seller, err := p2pkh.Lock(sellerAddress)
	if err != nil {
		return nil, nil, nil, err
	}
	return lock, buyer, seller, nil
}

// BuildArbitratedPoolState 固定输出 [Buyer, Seller]，Arbiter 没有资金输出。
func BuildArbitratedPoolState(input StateInput) (*tx.Transaction, error) {
	if input.Protocol != Protocol || input.Version != Version {
		return nil, fmt.Errorf("unsupported pool protocol: expected %s v%d", Protocol, Version)
	}
	if len(input.PreviousRawTx) == 0 || input.PoolAmount == 0 {
		return nil, fmt.Errorf("previous state and pool amount are required")
	}
	state, err := tx.NewTransactionFromBytes(input.PreviousRawTx)
	if err != nil {
		return nil, fmt.Errorf("decode previous state: %w", err)
	}
	if len(state.Inputs) != 1 || (len(state.Outputs) != 2 && len(state.Outputs) != 3) || state.Inputs[0] == nil {
		return nil, fmt.Errorf("arbitrated pool state must have one input and two value outputs")
	}
	if input.Sequence <= state.Inputs[0].SequenceNumber {
		return nil, fmt.Errorf("payment sequence must increase")
	}
	lock, buyer, seller, err := scripts(input.Roles)
	if err != nil {
		return nil, err
	}
	source := state.Inputs[0].SourceTxOutput()
	if input.PreviousSourceOutput != nil {
		if source != nil && (source.Satoshis != input.PreviousSourceOutput.Satoshis || !bytes.Equal(source.LockingScript.Bytes(), input.PreviousSourceOutput.LockingScript.Bytes())) {
			return nil, fmt.Errorf("previous state source output does not match configured pool")
		}
		if source == nil {
			source = input.PreviousSourceOutput
		}
	}
	if source == nil {
		return nil, fmt.Errorf("previous state source output is required")
	}
	if source == nil || source.Satoshis != input.PoolAmount || !bytes.Equal(source.LockingScript.Bytes(), lock.Bytes()) {
		return nil, fmt.Errorf("previous state source output does not match configured pool")
	}
	if state.Inputs[0].SourceTxOutput() == nil {
		state.Inputs[0].SetSourceTxOutput(source)
	}
	if !bytes.Equal(state.Outputs[0].LockingScript.Bytes(), buyer.Bytes()) || !bytes.Equal(state.Outputs[1].LockingScript.Bytes(), seller.Bytes()) {
		return nil, fmt.Errorf("previous state outputs do not match buyer and seller roles")
	}
	if input.SellerAmount > input.PoolAmount {
		return nil, fmt.Errorf("seller amount exceeds pool amount")
	}
	state.Outputs[0].Satoshis = input.PoolAmount - input.SellerAmount
	state.Outputs[1].Satoshis = input.SellerAmount
	state.Outputs[0].LockingScript = buyer
	state.Outputs[1].LockingScript = seller
	state.Inputs[0].SequenceNumber = input.Sequence
	if input.LockTime != nil {
		state.LockTime = *input.LockTime
	}
	if len(input.PaymentProof) > 0 {
		proof, err := libs.BuildOptionalOpReturnScript(input.PaymentProof)
		if err != nil {
			return nil, err
		}
		if len(state.Outputs) == 3 {
			state.Outputs[2] = &tx.TransactionOutput{Satoshis: 0, LockingScript: proof}
		} else {
			state.AddOutput(&tx.TransactionOutput{Satoshis: 0, LockingScript: proof})
		}
	}
	fake, err := libs.FakeSign(2)
	if err != nil {
		return nil, err
	}
	state.Inputs[0].UnlockingScript = fake
	fee, err := feeSat(state.Size(), input.FeeRate)
	if err != nil {
		return nil, err
	}
	if fee > state.Outputs[0].Satoshis {
		return nil, fmt.Errorf("buyer balance is insufficient for fee")
	}
	state.Outputs[0].Satoshis -= fee
	if input.BuyerAmount != 0 && input.BuyerAmount != state.Outputs[0].Satoshis {
		return nil, fmt.Errorf("buyer amount does not match canonical fee")
	}
	state.Inputs[0].UnlockingScript = script.NewFromBytes(nil)
	return state, nil
}

func BuildArbitratedPoolOpeningState(fundingTxID []byte, poolOutputIndex uint32, poolAmount uint64, roles ArbitratedPoolRoles, lockTime uint32, rate FeeSatPerKB) (*tx.Transaction, error) {
	if len(fundingTxID) != 32 || poolAmount == 0 {
		return nil, fmt.Errorf("funding outpoint and pool amount are required")
	}
	lock, buyer, seller, err := scripts(roles)
	if err != nil {
		return nil, err
	}
	state := tx.NewTransaction()
	id, err := chainhash.NewHash(fundingTxID)
	if err != nil {
		return nil, err
	}
	state.AddInputWithOutput(&tx.TransactionInput{SourceTXID: id, SourceTxOutIndex: poolOutputIndex, SequenceNumber: 2, UnlockingScript: script.NewFromBytes(nil)}, &tx.TransactionOutput{Satoshis: poolAmount, LockingScript: lock})
	state.AddOutput(&tx.TransactionOutput{Satoshis: poolAmount, LockingScript: buyer})
	state.AddOutput(&tx.TransactionOutput{Satoshis: 0, LockingScript: seller})
	state.LockTime = lockTime
	fake, err := libs.FakeSign(2)
	if err != nil {
		return nil, err
	}
	state.Inputs[0].UnlockingScript = fake
	fee, err := feeSat(state.Size(), rate)
	if err != nil {
		return nil, err
	}
	if fee > poolAmount {
		return nil, fmt.Errorf("buyer balance is insufficient for fee")
	}
	state.Outputs[0].Satoshis -= fee
	state.Inputs[0].UnlockingScript = script.NewFromBytes(nil)
	return state, nil
}

func BuildArbitratedPoolFinalState(input StateInput) (*tx.Transaction, error) {
	return BuildArbitratedPoolState(input)
}
