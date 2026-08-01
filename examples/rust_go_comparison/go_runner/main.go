package main

import (
	"fmt"

	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
	"github.com/bsv-blockchain/go-sdk/script"
	tx "github.com/bsv-blockchain/go-sdk/transaction"
	"github.com/bsv-blockchain/go-sdk/transaction/template/p2pkh"
	"github.com/bsv8/MultisigPool/v4/pkg/libs"
	pool "github.com/bsv8/MultisigPool/v4/pkg/two_party_pool"
)

func fee(size int, rate float64) uint64 {
	value := uint64(float64(size) / 1000 * rate)
	if value == 0 {
		return 1
	}
	return value
}

func buildSpend(base *tx.Transaction, amount uint64, buyer, seller *ec.PublicKey, sellerAmount uint64, sequence uint32, rate float64) (*tx.Transaction, error) {
	buyerAddress, err := libs.GetAddressFromPublicKey(buyer, false)
	if err != nil {
		return nil, err
	}
	sellerAddress, err := libs.GetAddressFromPublicKey(seller, false)
	if err != nil {
		return nil, err
	}
	buyerScript, err := p2pkh.Lock(buyerAddress)
	if err != nil {
		return nil, err
	}
	sellerScript, err := p2pkh.Lock(sellerAddress)
	if err != nil {
		return nil, err
	}
	lock, err := pool.BuildTwoPartyPoolLock(pool.TwoPartyPoolRoles{Buyer: buyer, Seller: seller})
	if err != nil {
		return nil, err
	}
	state := tx.NewTransaction()
	state.AddInputWithOutput(&tx.TransactionInput{SourceTXID: base.TxID(), SourceTxOutIndex: 0, SequenceNumber: sequence, UnlockingScript: script.NewFromBytes(nil)}, &tx.TransactionOutput{Satoshis: amount, LockingScript: lock})
	state.AddOutput(&tx.TransactionOutput{Satoshis: amount - sellerAmount, LockingScript: buyerScript})
	state.AddOutput(&tx.TransactionOutput{Satoshis: sellerAmount, LockingScript: sellerScript})
	state.LockTime = 800000
	fake, err := libs.FakeSign(2)
	if err != nil {
		return nil, err
	}
	state.Inputs[0].UnlockingScript = fake
	state.Outputs[0].Satoshis -= fee(state.Size(), rate)
	state.Inputs[0].UnlockingScript = script.NewFromBytes(nil)
	return state, nil
}

func main() {
	buyer, err := ec.PrivateKeyFromHex("903b1b2c396f17203fa83444d72bf5c666119d9d681eb715520f99ae6f92322c")
	if err != nil {
		panic(err)
	}
	seller, err := ec.PrivateKeyFromHex("a2d2ca4c19e3c560792ca751842c29b9da94be09f712a7f9ba7c66e64a354829")
	if err != nil {
		panic(err)
	}
	roles := pool.TwoPartyPoolRoles{Buyer: buyer.PubKey(), Seller: seller.PubKey()}
	funding, err := pool.BuildTwoPartyPoolFundingTx([]libs.UTXO{{TxID: "0a1fd93f02e68d1a73fb499e948ee83a78aa9337e1476bd89f7092a7ef16a050", Vout: 1, Value: 99902}}, 99402, buyer, roles, false, 0.5)
	if err != nil {
		panic(err)
	}
	state, err := buildSpend(funding.Tx, funding.PoolAmount, roles.Buyer, roles.Seller, 100, 1, 0.5)
	if err != nil {
		panic(err)
	}
	buyerSignature, err := pool.SignTwoPartyPoolAsBuyer(state, funding.PoolAmount, roles, buyer)
	if err != nil {
		panic(err)
	}
	sellerSignature, err := pool.SignTwoPartyPoolAsSeller(state, funding.PoolAmount, roles, seller)
	if err != nil {
		panic(err)
	}
	updated, err := buildSpend(funding.Tx, funding.PoolAmount, roles.Buyer, roles.Seller, 150, 2, 0.5)
	if err != nil {
		panic(err)
	}
	buyerUpdate, err := pool.SignTwoPartyPoolAsBuyer(updated, funding.PoolAmount, roles, buyer)
	if err != nil {
		panic(err)
	}
	sellerUpdate, err := pool.SignTwoPartyPoolAsSeller(updated, funding.PoolAmount, roles, seller)
	if err != nil {
		panic(err)
	}
	fmt.Printf("Step1Hex %s\nStep2Hex %x\nStep3Hex %x\nStep4Hex %x\nStep5Hex %x\n", funding.Tx.Hex(), buyerSignature, sellerSignature, buyerUpdate, sellerUpdate)
}
