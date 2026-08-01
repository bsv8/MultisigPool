package main

import (
	"encoding/hex"
	"fmt"

	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
	tx "github.com/bsv-blockchain/go-sdk/transaction"
	pool "github.com/bsv8/MultisigPool/v3/pkg/arbitrated_pool"
)

func main() {
	buyer, err := ec.PrivateKeyFromHex("a682814ac246ca65543197e593aa3b2633b891959c183416f54e2c63a8de1d8c")
	if err != nil {
		panic(err)
	}
	seller, err := ec.PrivateKeyFromHex("903b1b2c396f17203fa83444d72bf5c666119d9d681eb715520f99ae6f92322c")
	if err != nil {
		panic(err)
	}
	arbiter, err := ec.PrivateKeyFromHex("a2d2ca4c19e3c560792ca751842c29b9da94be09f712a7f9ba7c66e64a354829")
	if err != nil {
		panic(err)
	}
	roles := pool.ArbitratedPoolRoles{Buyer: buyer.PubKey(), Seller: seller.PubKey(), Arbiter: arbiter.PubKey()}
	state, err := tx.NewTransactionFromHex("0100000001193bf65040f4c309fb4834a195eab9753fd3b5162551c10aade89d99f5afa671000000000001000000021a4e0000000000001976a914a8d0cb37061679d0523314d882d81b989254df7b88ac00000000000000001976a9147e06a09c32ea06e80745cbfae60036968b64238888ac00000000")
	if err != nil {
		panic(err)
	}
	lock, err := pool.BuildArbitratedPoolLock(roles)
	if err != nil {
		panic(err)
	}
	state.Inputs[0].SetSourceTxOutput(&tx.TransactionOutput{Satoshis: 19995, LockingScript: lock})
	buyerSignature, err := pool.SignArbitratedPoolAsBuyer(state, 19995, roles, buyer)
	if err != nil {
		panic(err)
	}
	sellerSignature, err := pool.SignArbitratedPoolAsSeller(state, 19995, roles, seller)
	if err != nil {
		panic(err)
	}
	arbiterSignature, err := pool.SignArbitratedPoolAsArbiter(state, 19995, roles, arbiter)
	if err != nil {
		panic(err)
	}
	finalBuyerSeller, err := pool.MergeArbitratedPoolBuyerSellerSignatures(state, 19995, roles, buyerSignature, sellerSignature)
	if err != nil {
		panic(err)
	}
	finalBuyerArbiter, err := pool.MergeArbitratedPoolBuyerArbiterSignatures(state, 19995, roles, buyerSignature, arbiterSignature)
	if err != nil {
		panic(err)
	}
	finalSellerArbiter, err := pool.MergeArbitratedPoolSellerArbiterSignatures(state, 19995, roles, sellerSignature, arbiterSignature)
	if err != nil {
		panic(err)
	}
	fmt.Printf("LockHex %s\nStateHex %s\nBuyerSignatureHex %s\nSellerSignatureHex %s\nArbiterSignatureHex %s\nFinalBuyerSellerHex %s\nFinalBuyerArbiterHex %s\nFinalSellerArbiterHex %s\n", hex.EncodeToString(lock.Bytes()), hex.EncodeToString(state.Bytes()), hex.EncodeToString(buyerSignature), hex.EncodeToString(sellerSignature), hex.EncodeToString(arbiterSignature), hex.EncodeToString(finalBuyerSeller.Bytes()), hex.EncodeToString(finalBuyerArbiter.Bytes()), hex.EncodeToString(finalSellerArbiter.Bytes()))
}
