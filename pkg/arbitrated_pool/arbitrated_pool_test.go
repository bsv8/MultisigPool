package arbitrated_pool

import (
	"bytes"
	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
	tx "github.com/bsv-blockchain/go-sdk/transaction"
	"github.com/bsv8/MultisigPool/v3/pkg/libs"
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
