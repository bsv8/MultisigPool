package main

import (
	"encoding/hex"
	"fmt"

	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
	"github.com/bsv8/MultisigPool/v4/pkg/libs"
	pool "github.com/bsv8/MultisigPool/v4/pkg/two_party_pool"
)

func main() {
	buyer, err := ec.PrivateKeyFromHex("01")
	if err != nil {
		panic(err)
	}
	seller, err := ec.PrivateKeyFromHex("02")
	if err != nil {
		panic(err)
	}
	roles := pool.TwoPartyPoolRoles{Buyer: buyer.PubKey(), Seller: seller.PubKey()}
	funding, err := pool.BuildTwoPartyPoolFundingTx([]libs.UTXO{{TxID: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", Vout: 0, Value: 20000}}, 19000, buyer, roles, false, 1)
	if err != nil {
		panic(err)
	}
	state, err := pool.BuildTwoPartyPoolOpeningState(funding.Tx.TxID().CloneBytes(), 0, funding.PoolAmount, roles, 0, 1)
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
	finalState, err := pool.MergeTwoPartyPoolBuyerSellerSignatures(state, funding.PoolAmount, roles, buyerSignature, sellerSignature)
	if err != nil {
		panic(err)
	}
	lock, err := pool.BuildTwoPartyPoolLock(roles)
	if err != nil {
		panic(err)
	}
	fmt.Printf("LockHex %s\nFundingHex %s\nStateHex %s\nBuyerSignatureHex %s\nSellerSignatureHex %s\nFinalHex %s\n", hex.EncodeToString(lock.Bytes()), hex.EncodeToString(funding.Tx.Bytes()), hex.EncodeToString(state.Bytes()), hex.EncodeToString(buyerSignature), hex.EncodeToString(sellerSignature), hex.EncodeToString(finalState.Bytes()))
}
