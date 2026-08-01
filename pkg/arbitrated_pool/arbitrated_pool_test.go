package arbitrated_pool

import (
	"bytes"
	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
	tx "github.com/bsv-blockchain/go-sdk/transaction"
	"github.com/bsv8/MultisigPool/v4/pkg/libs"
	"testing"
)

func TestArbitratedPoolSupportsAllSignaturePairs(t *testing.T) {
	buyer, _ := ec.PrivateKeyFromHex("01")
	seller, _ := ec.PrivateKeyFromHex("02")
	arbiter, _ := ec.PrivateKeyFromHex("03")
	roles := ArbitratedPoolRoles{Buyer: buyer.PubKey(), Seller: seller.PubKey(), Arbiter: arbiter.PubKey()}
	lock, err := BuildArbitratedPoolLock(roles)
	if err != nil {
		t.Fatal(err)
	}
	want, err := libs.Lock([]*ec.PublicKey{roles.Buyer, roles.Seller, roles.Arbiter}, 2)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(lock.Bytes(), want.Bytes()) {
		t.Fatal("arbitrated lock order is not [Buyer, Seller, Arbiter]")
	}
	funding, err := BuildArbitratedPoolFundingTx([]libs.UTXO{{TxID: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", Vout: 0, Value: 30000}}, 29000, buyer, roles, false, 1)
	if err != nil {
		t.Fatal(err)
	}
	state, err := BuildArbitratedPoolOpeningState(funding.Tx.TxID().CloneBytes(), 0, funding.PoolAmount, roles, 0, 1)
	if err != nil {
		t.Fatal(err)
	}
	buyerSig, err := SignArbitratedPoolAsBuyer(state, funding.PoolAmount, roles, buyer)
	if err != nil {
		t.Fatal(err)
	}
	sellerSig, err := SignArbitratedPoolAsSeller(state, funding.PoolAmount, roles, seller)
	if err != nil {
		t.Fatal(err)
	}
	arbiterSig, err := SignArbitratedPoolAsArbiter(state, funding.PoolAmount, roles, arbiter)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := MergeArbitratedPoolBuyerSellerSignatures(state, funding.PoolAmount, roles, buyerSig, sellerSig); err != nil {
		t.Fatal(err)
	}
	if _, err := MergeArbitratedPoolBuyerArbiterSignatures(state, funding.PoolAmount, roles, buyerSig, arbiterSig); err != nil {
		t.Fatal(err)
	}
	if _, err := MergeArbitratedPoolSellerArbiterSignatures(state, funding.PoolAmount, roles, sellerSig, arbiterSig); err != nil {
		t.Fatal(err)
	}
}

func TestArbitratedPoolStateAcceptsStandardRawTransaction(t *testing.T) {
	buyer, _ := ec.PrivateKeyFromHex("01")
	seller, _ := ec.PrivateKeyFromHex("02")
	arbiter, _ := ec.PrivateKeyFromHex("03")
	roles := ArbitratedPoolRoles{Buyer: buyer.PubKey(), Seller: seller.PubKey(), Arbiter: arbiter.PubKey()}
	funding, err := BuildArbitratedPoolFundingTx([]libs.UTXO{{TxID: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", Vout: 0, Value: 30000}}, 29000, buyer, roles, false, 1)
	if err != nil {
		t.Fatal(err)
	}
	previous, err := BuildArbitratedPoolOpeningState(funding.Tx.TxID().CloneBytes(), 0, funding.PoolAmount, roles, 0, 1)
	if err != nil {
		t.Fatal(err)
	}
	lock, err := BuildArbitratedPoolLock(roles)
	if err != nil {
		t.Fatal(err)
	}
	state, err := BuildArbitratedPoolState(StateInput{
		Protocol: Protocol, Version: Version, PreviousRawTx: previous.Bytes(), PreviousSourceOutput: &tx.TransactionOutput{Satoshis: funding.PoolAmount, LockingScript: lock}, Sequence: 3,
		SellerAmount: 100, PoolAmount: funding.PoolAmount, Roles: roles, FeeRate: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	if state.Inputs[0].SourceTxOutput() == nil || state.Outputs[1].Satoshis != 100 {
		t.Fatal("standard raw state did not restore the configured source output")
	}
	if _, err := BuildArbitratedPoolState(StateInput{Protocol: Protocol, Version: Version, PreviousRawTx: previous.Bytes(), Sequence: 3, SellerAmount: 100, PoolAmount: funding.PoolAmount, Roles: roles, FeeRate: 1}); err == nil {
		t.Fatal("expected missing source output rejection")
	}
	if _, err := BuildArbitratedPoolState(StateInput{Protocol: Protocol, Version: 2, PreviousRawTx: previous.Bytes(), Sequence: 3, SellerAmount: 100, PoolAmount: funding.PoolAmount, Roles: roles, FeeRate: 1}); err == nil {
		t.Fatal("expected protocol version rejection")
	}
	wrongLock, err := BuildArbitratedPoolLock(ArbitratedPoolRoles{Buyer: roles.Seller, Seller: roles.Buyer, Arbiter: roles.Arbiter})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := BuildArbitratedPoolState(StateInput{Protocol: Protocol, Version: Version, PreviousRawTx: previous.Bytes(), PreviousSourceOutput: &tx.TransactionOutput{Satoshis: funding.PoolAmount, LockingScript: wrongLock}, Sequence: 3, SellerAmount: 100, PoolAmount: funding.PoolAmount, Roles: roles, FeeRate: 1}); err == nil {
		t.Fatal("expected source output rejection")
	}
}

func TestArbitratedPoolV4FeeProofOverflowAndSignatureBoundaries(t *testing.T) {
	buyer, _ := ec.PrivateKeyFromHex("01")
	seller, _ := ec.PrivateKeyFromHex("02")
	arbiter, _ := ec.PrivateKeyFromHex("03")
	roles := ArbitratedPoolRoles{Buyer: buyer.PubKey(), Seller: seller.PubKey(), Arbiter: arbiter.PubKey()}
	utxos := []libs.UTXO{{TxID: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", Vout: 0, Value: 30000}}
	funding, err := BuildArbitratedPoolFundingTx(utxos, 29000, buyer, roles, false, FeeSatPerKB(0))
	if err != nil {
		t.Fatal(err)
	}
	if funding.Fee != 0 || funding.Tx.Outputs[1].Satoshis != 1000 {
		t.Fatalf("feeRate=0 must preserve the full change output: fee=%d change=%d", funding.Fee, funding.Tx.Outputs[1].Satoshis)
	}
	opening, err := BuildArbitratedPoolOpeningState(funding.Tx.TxID().CloneBytes(), 0, funding.PoolAmount, roles, 800000, FeeSatPerKB(0))
	if err != nil {
		t.Fatal(err)
	}
	lock, err := BuildArbitratedPoolLock(roles)
	if err != nil {
		t.Fatal(err)
	}
	build := func(previous *tx.Transaction, sequence uint32, sellerAmount, arbiterAmount uint64, proof []byte, buyerAmount *uint64) *tx.Transaction {
		state, buildErr := BuildArbitratedPoolState(StateInput{Protocol: Protocol, Version: Version, PreviousRawTx: previous.Bytes(), PreviousSourceOutput: &tx.TransactionOutput{Satoshis: 29000, LockingScript: lock}, Sequence: sequence, BuyerAmount: buyerAmount, SellerAmount: sellerAmount, ArbiterAmount: arbiterAmount, PoolAmount: 29000, Roles: roles, FeeRate: FeeSatPerKB(0), PaymentProof: proof})
		if buildErr != nil {
			t.Fatal(buildErr)
		}
		return state
	}
	paid, err := BuildArbitratedPoolState(StateInput{Protocol: Protocol, Version: Version, PreviousRawTx: opening.Bytes(), PreviousSourceOutput: &tx.TransactionOutput{Satoshis: 29000, LockingScript: lock}, Sequence: 3, SellerAmount: 200, ArbiterAmount: 100, PoolAmount: 29000, Roles: roles, FeeRate: FeeSatPerKB(0)})
	if err != nil {
		t.Fatal(err)
	}
	if paid.Outputs[0].Satoshis != 28700 || paid.Outputs[1].Satoshis != 200 || paid.Outputs[2].Satoshis != 100 {
		t.Fatalf("unexpected non-zero arbiter allocation: %#v", paid.Outputs)
	}
	withProof := build(paid, 4, 300, 200, []byte{1, 2, 3}, nil)
	preserved := build(withProof, 5, 300, 200, nil, nil)
	replaced := build(withProof, 5, 300, 200, []byte{4, 5, 6}, nil)
	if !bytes.Equal(preserved.Outputs[3].LockingScript.Bytes(), withProof.Outputs[3].LockingScript.Bytes()) || bytes.Equal(replaced.Outputs[3].LockingScript.Bytes(), withProof.Outputs[3].LockingScript.Bytes()) {
		t.Fatal("payment proof was not preserved and replaced at output[3]")
	}
	zero := uint64(0)
	if _, err := BuildArbitratedPoolState(StateInput{Protocol: Protocol, Version: Version, PreviousRawTx: opening.Bytes(), PreviousSourceOutput: &tx.TransactionOutput{Satoshis: 29000, LockingScript: lock}, Sequence: 3, BuyerAmount: &zero, SellerAmount: 0, PoolAmount: 29000, Roles: roles, FeeRate: FeeSatPerKB(0)}); err == nil {
		t.Fatal("expected BuyerAmount=0 mismatch to be rejected")
	}
	if _, err := BuildArbitratedPoolState(StateInput{Protocol: Protocol, Version: Version, PreviousRawTx: opening.Bytes(), PreviousSourceOutput: &tx.TransactionOutput{Satoshis: 29000, LockingScript: lock}, Sequence: 3, SellerAmount: 1, ArbiterAmount: ^uint64(0), PoolAmount: 29000, Roles: roles, FeeRate: FeeSatPerKB(0)}); err == nil {
		t.Fatal("expected allocation overflow to be rejected")
	}
	signature, err := SignArbitratedPoolAsBuyer(paid, 29000, roles, buyer)
	if err != nil {
		t.Fatal(err)
	}
	sellerSignature, err := SignArbitratedPoolAsSeller(paid, 29000, roles, seller)
	if err != nil {
		t.Fatal(err)
	}
	changed, err := tx.NewTransactionFromBytes(paid.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	changed.Outputs[1].Satoshis++
	if _, err := VerifyArbitratedPoolBuyerSignature(changed, 29000, roles, signature); err == nil {
		t.Fatal("expected stale signature rejection")
	}
	malformed, err := tx.NewTransactionFromBytes(paid.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	malformed.Inputs = append(malformed.Inputs, malformed.Inputs[0])
	if _, err := SignArbitratedPoolAsBuyer(malformed, 29000, roles, buyer); err == nil {
		t.Fatal("expected multiple input rejection")
	}
	unlock, err := libs.BuildSignScript(&[][]byte{signature, sellerSignature})
	if err != nil {
		t.Fatal(err)
	}
	paid.Inputs[0].UnlockingScript = unlock
	if _, err := VerifyArbitratedPoolBuyerSignature(paid, 29000, roles, signature); err == nil {
		t.Fatal("expected non-empty unlocking script rejection")
	}
	if _, err := MergeArbitratedPoolBuyerSellerSignatures(paid, 29000, roles, signature, sellerSignature); err == nil {
		t.Fatal("expected merge rejection for a signed state")
	}
	wrongArbiter, err := tx.NewTransactionFromBytes(paid.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	wrongArbiter.Inputs[0].UnlockingScript = nil
	wrongArbiter.Inputs[0].SetSourceTxOutput(&tx.TransactionOutput{Satoshis: 29000, LockingScript: lock})
	wrongArbiter.Outputs[2].LockingScript = wrongArbiter.Outputs[1].LockingScript
	if _, err := SignArbitratedPoolAsBuyer(wrongArbiter, 29000, roles, buyer); err == nil {
		t.Fatal("expected arbiter output script rejection")
	}
	proofState := build(paid, 4, 300, 200, []byte{1, 2, 3}, nil)
	proofState.Outputs[3].Satoshis = 1
	if _, err := SignArbitratedPoolAsBuyer(proofState, 29000, roles, buyer); err == nil {
		t.Fatal("expected invalid fourth output rejection")
	}
	if _, err := BuildArbitratedPoolState(StateInput{Protocol: Protocol, Version: Version, PreviousRawTx: opening.Bytes(), PreviousSourceOutput: &tx.TransactionOutput{Satoshis: 29000, LockingScript: lock}, Sequence: 3, SellerAmount: 29000, PoolAmount: 29000, Roles: roles, FeeRate: FeeSatPerKB(1)}); err == nil {
		t.Fatal("expected buyer fee insufficiency rejection")
	}
	if _, err := ArbitratedPoolFeeSat(1, FeeSatPerKB(^uint64(0))); err == nil {
		t.Fatal("expected fee multiplication overflow rejection")
	}
}
