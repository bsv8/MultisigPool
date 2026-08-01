package two_party_pool

import (
	"bytes"
	"testing"

	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
	tx "github.com/bsv-blockchain/go-sdk/transaction"
	"github.com/bsv8/MultisigPool/v4/pkg/libs"
)

func TestTwoPartyPoolUsesBuyerSellerOrderAndPureSigning(t *testing.T) {
	buyer, _ := ec.PrivateKeyFromHex("01")
	seller, _ := ec.PrivateKeyFromHex("02")
	roles := TwoPartyPoolRoles{Buyer: buyer.PubKey(), Seller: seller.PubKey()}
	lock, err := BuildTwoPartyPoolLock(roles)
	if err != nil {
		t.Fatal(err)
	}
	want, err := libs.Lock([]*ec.PublicKey{roles.Buyer, roles.Seller}, 2)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(lock.Bytes(), want.Bytes()) {
		t.Fatal("two-party lock order is not [Buyer, Seller]")
	}
	funding, err := BuildTwoPartyPoolFundingTx([]libs.UTXO{{TxID: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", Vout: 0, Value: 20000}}, 19000, buyer, roles, false, 1)
	if err != nil {
		t.Fatal(err)
	}
	state, err := BuildTwoPartyPoolOpeningState(funding.Tx.TxID().CloneBytes(), 0, funding.PoolAmount, roles, 0, 1)
	if err != nil {
		t.Fatal(err)
	}
	buyerSig, err := SignTwoPartyPoolAsBuyer(state, funding.PoolAmount, roles, buyer)
	if err != nil {
		t.Fatal(err)
	}
	sellerSig, err := SignTwoPartyPoolAsSeller(state, funding.PoolAmount, roles, seller)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := MergeTwoPartyPoolBuyerSellerSignatures(state, funding.PoolAmount, roles, buyerSig, sellerSig); err != nil {
		t.Fatal(err)
	}
	if state.Inputs[0].UnlockingScript == nil || len(state.Inputs[0].UnlockingScript.Bytes()) != 0 {
		t.Fatal("signing modified caller state")
	}
}

func TestTwoPartyPoolRejectsSwappedRoles(t *testing.T) {
	buyer, _ := ec.PrivateKeyFromHex("01")
	roles := TwoPartyPoolRoles{Buyer: buyer.PubKey(), Seller: buyer.PubKey()}
	if _, err := BuildTwoPartyPoolLock(roles); err == nil {
		t.Fatal("expected duplicate role error")
	}
}

func TestTwoPartyPoolStateAcceptsStandardRawTransaction(t *testing.T) {
	buyer, _ := ec.PrivateKeyFromHex("01")
	seller, _ := ec.PrivateKeyFromHex("02")
	roles := TwoPartyPoolRoles{Buyer: buyer.PubKey(), Seller: seller.PubKey()}
	funding, err := BuildTwoPartyPoolFundingTx([]libs.UTXO{{TxID: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", Vout: 0, Value: 20000}}, 19000, buyer, roles, false, 1)
	if err != nil {
		t.Fatal(err)
	}
	previous, err := BuildTwoPartyPoolOpeningState(funding.Tx.TxID().CloneBytes(), 0, funding.PoolAmount, roles, 0, 1)
	if err != nil {
		t.Fatal(err)
	}
	lock, err := BuildTwoPartyPoolLock(roles)
	if err != nil {
		t.Fatal(err)
	}
	state, err := BuildTwoPartyPoolState(StateInput{
		Protocol: Protocol, Version: Version, PreviousRawTx: previous.Bytes(), PreviousSourceOutput: &tx.TransactionOutput{Satoshis: funding.PoolAmount, LockingScript: lock}, Sequence: 3,
		SellerAmount: 100, PoolAmount: funding.PoolAmount, Roles: roles, FeeRate: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	if state.Inputs[0].SourceTxOutput() == nil || state.Outputs[1].Satoshis != 100 {
		t.Fatal("standard raw state did not restore the configured source output")
	}
	if _, err := BuildTwoPartyPoolState(StateInput{Protocol: Protocol, Version: Version, PreviousRawTx: previous.Bytes(), Sequence: 3, SellerAmount: 100, PoolAmount: funding.PoolAmount, Roles: roles, FeeRate: 1}); err == nil {
		t.Fatal("expected missing source output rejection")
	}
	if _, err := BuildTwoPartyPoolState(StateInput{Protocol: Protocol, Version: 2, PreviousRawTx: previous.Bytes(), Sequence: 3, SellerAmount: 100, PoolAmount: funding.PoolAmount, Roles: roles, FeeRate: 1}); err == nil {
		t.Fatal("expected protocol version rejection")
	}
	wrongLock, err := BuildTwoPartyPoolLock(TwoPartyPoolRoles{Buyer: roles.Seller, Seller: roles.Buyer})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := BuildTwoPartyPoolState(StateInput{Protocol: Protocol, Version: Version, PreviousRawTx: previous.Bytes(), PreviousSourceOutput: &tx.TransactionOutput{Satoshis: funding.PoolAmount, LockingScript: wrongLock}, Sequence: 3, SellerAmount: 100, PoolAmount: funding.PoolAmount, Roles: roles, FeeRate: 1}); err == nil {
		t.Fatal("expected source output rejection")
	}
}
