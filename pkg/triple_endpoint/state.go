package triple_endpoint

// This file is the role-explicit V1 boundary. The older endpoint names remain
// available only for source compatibility; new integrations should use these
// functions so slot order cannot be inferred from a runtime scenario.

import (
	"fmt"

	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
	"github.com/bsv-blockchain/go-sdk/script"
	tx "github.com/bsv-blockchain/go-sdk/transaction"
	"github.com/bsv-blockchain/go-sdk/transaction/template/p2pkh"
	libs "github.com/bsv8/MultisigPool/pkg/libs"
)

type TriplePoolStateInput struct {
	PreviousRawTx []byte
	Sequence      uint32
	LockTime      *uint32
	SellerAmount  uint64
	PoolAmount    uint64
	Server        *ec.PublicKey
	A             *ec.PublicKey
	B             *ec.PublicKey
	FeeRate       FeeSatPerKB
}

func BuildTriplePoolLock(server, a, b *ec.PublicKey) (*script.Script, error) {
	if server == nil || a == nil || b == nil {
		return nil, fmt.Errorf("server, A and B public keys are required")
	}
	return TripleFeePoolSpentScript(server, a, b)
}

func BuildTriplePoolState(input TriplePoolStateInput) (*tx.Transaction, error) {
	if len(input.PreviousRawTx) == 0 || input.Server == nil || input.A == nil || input.B == nil {
		return nil, fmt.Errorf("previous state and server/A/B keys are required")
	}
	state, err := tx.NewTransactionFromBytes(input.PreviousRawTx)
	if err != nil {
		return nil, fmt.Errorf("decode previous state: %w", err)
	}
	if len(state.Inputs) != 1 || len(state.Outputs) != 2 {
		return nil, fmt.Errorf("triple pool state must have one input and two outputs")
	}
	lock, err := BuildTriplePoolLock(input.Server, input.A, input.B)
	if err != nil {
		return nil, err
	}
	total := state.Outputs[0].Satoshis + state.Outputs[1].Satoshis
	if input.PoolAmount == 0 {
		input.PoolAmount = total
	}
	if input.SellerAmount > total {
		return nil, fmt.Errorf("seller amount exceeds state value")
	}
	serverAddr, err := libs.GetAddressFromPublicKey(input.Server, false)
	if err != nil {
		return nil, err
	}
	aAddr, err := libs.GetAddressFromPublicKey(input.A, false)
	if err != nil {
		return nil, err
	}
	serverScript, err := p2pkh.Lock(serverAddr)
	if err != nil {
		return nil, err
	}
	aScript, err := p2pkh.Lock(aAddr)
	if err != nil {
		return nil, err
	}
	state.Outputs[0].LockingScript = serverScript
	state.Outputs[1].LockingScript = aScript
	state.Outputs[0].Satoshis = input.SellerAmount
	state.Outputs[1].Satoshis = input.PoolAmount - input.SellerAmount
	state.Inputs[0].SequenceNumber = input.Sequence
	if input.LockTime != nil {
		state.LockTime = *input.LockTime
	}
	state.Inputs[0].SetSourceTxOutput(&tx.TransactionOutput{Satoshis: input.PoolAmount, LockingScript: lock})
	fake, err := libs.FakeSign(2)
	if err != nil {
		return nil, err
	}
	state.Inputs[0].UnlockingScript = fake
	fee, err := TriplePoolFeeSat(state.Size(), input.FeeRate)
	if err != nil {
		return nil, err
	}
	if input.SellerAmount+fee > input.PoolAmount {
		return nil, fmt.Errorf("pool balance is insufficient for seller amount and fee")
	}
	state.Outputs[1].Satoshis = input.PoolAmount - input.SellerAmount - fee
	state.Inputs[0].UnlockingScript = script.NewFromBytes(nil)
	return state, nil
}

func SignTriplePoolAsServer(state *tx.Transaction, server *ec.PrivateKey, a, b *ec.PublicKey) (*[]byte, error) {
	if server == nil || a == nil || b == nil || server.PubKey().IsEqual(a) || server.PubKey().IsEqual(b) {
		return nil, fmt.Errorf("server key does not match the server slot")
	}
	return ServerTripleFeePoolSpendTXUpdateSign(state, server, a, b)
}

func SignTriplePoolAsA(state *tx.Transaction, a *ec.PrivateKey, server, b *ec.PublicKey) (*[]byte, error) {
	if a == nil || server == nil || b == nil || a.PubKey().IsEqual(server) || a.PubKey().IsEqual(b) {
		return nil, fmt.Errorf("A key does not match the A slot")
	}
	return ClientATripleFeePoolSpendTXUpdateSign(state, server, a, b)
}

func SignTriplePoolAsB(state *tx.Transaction, b *ec.PrivateKey, server, a *ec.PublicKey) (*[]byte, error) {
	if b == nil || server == nil || a == nil || b.PubKey().IsEqual(server) || b.PubKey().IsEqual(a) {
		return nil, fmt.Errorf("B key does not match the B slot")
	}
	source := state.Inputs[0].SourceTxOutput()
	if source == nil {
		return nil, fmt.Errorf("source pool output is required")
	}
	return SpendTXTripleFeePoolBSign(state, source.Satoshis, server, a, b)
}

func BuildTriplePoolInitialState(input TriplePoolStateInput) (*tx.Transaction, error) {
	input.SellerAmount = 0
	return BuildTriplePoolState(input)
}

func BuildTriplePoolFinalState(input TriplePoolStateInput) (*tx.Transaction, error) {
	if input.LockTime == nil {
		zero := uint32(0)
		input.LockTime = &zero
	}
	return BuildTriplePoolState(input)
}
