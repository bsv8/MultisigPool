package main

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"

	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
	tx "github.com/bsv-blockchain/go-sdk/transaction"
	pool "github.com/bsv8/MultisigPool/v4/pkg/arbitrated_pool"
	"github.com/bsv8/MultisigPool/v4/pkg/libs"
)

type fixture struct {
	Protocol                 string      `json:"protocol"`
	Version                  uint32      `json:"version"`
	FeeRate                  uint64      `json:"feeRate"`
	BuyerPrivHex             string      `json:"buyerPrivHex"`
	SellerPrivHex            string      `json:"sellerPrivHex"`
	ArbiterPrivHex           string      `json:"arbiterPrivHex"`
	BuyerUtxos               []libs.UTXO `json:"buyerUtxos"`
	PoolAmount               uint64      `json:"poolAmount"`
	LockTime                 uint32      `json:"lockTime"`
	NegotiationSequence      uint32      `json:"negotiationSequence"`
	NegotiationSellerAmount  uint64      `json:"negotiationSellerAmount"`
	NegotiationArbiterAmount uint64      `json:"negotiationArbiterAmount"`
	PaidArbiterSequence      uint32      `json:"paidArbiterSequence"`
	PaidArbiterSellerAmount  uint64      `json:"paidArbiterSellerAmount"`
	PaidArbiterAmount        uint64      `json:"paidArbiterAmount"`
	ProofSequence            uint32      `json:"proofSequence"`
	ProofSellerAmount        uint64      `json:"proofSellerAmount"`
	ProofArbiterAmount       uint64      `json:"proofArbiterAmount"`
	PaymentProofHex          string      `json:"paymentProofHex"`
}

func must[T any](value T, err error) T {
	if err != nil {
		panic(err)
	}
	return value
}

func main() {
	data := must(os.ReadFile("testdata/arbitrated_pool_v4_fixture.json"))
	var config fixture
	if err := json.Unmarshal(data, &config); err != nil {
		panic(err)
	}
	if config.Protocol != pool.Protocol || config.Version != pool.Version {
		panic("fixture protocol does not match v4")
	}
	buyer := must(ec.PrivateKeyFromHex(config.BuyerPrivHex))
	seller := must(ec.PrivateKeyFromHex(config.SellerPrivHex))
	arbiter := must(ec.PrivateKeyFromHex(config.ArbiterPrivHex))
	roles := pool.ArbitratedPoolRoles{Buyer: buyer.PubKey(), Seller: seller.PubKey(), Arbiter: arbiter.PubKey()}
	funding := must(pool.BuildArbitratedPoolFundingTx(config.BuyerUtxos, config.PoolAmount, buyer, roles, false, pool.FeeSatPerKB(config.FeeRate)))
	opening := must(pool.BuildArbitratedPoolOpeningState(funding.Tx.TxID().CloneBytes(), funding.PoolOutputIndex, funding.PoolAmount, roles, config.LockTime, pool.FeeSatPerKB(config.FeeRate)))
	lock := must(pool.BuildArbitratedPoolLock(roles))
	build := func(previous *tx.Transaction, sequence uint32, sellerAmount, arbiterAmount uint64, proof []byte) *tx.Transaction {
		return must(pool.BuildArbitratedPoolState(pool.StateInput{Protocol: config.Protocol, Version: config.Version, PreviousRawTx: previous.Bytes(), PreviousSourceOutput: &tx.TransactionOutput{Satoshis: funding.PoolAmount, LockingScript: lock}, Sequence: sequence, SellerAmount: sellerAmount, ArbiterAmount: arbiterAmount, PoolAmount: funding.PoolAmount, Roles: roles, FeeRate: pool.FeeSatPerKB(config.FeeRate), PaymentProof: proof}))
	}
	negotiation := build(opening, config.NegotiationSequence, config.NegotiationSellerAmount, config.NegotiationArbiterAmount, nil)
	paidArbiter := build(negotiation, config.PaidArbiterSequence, config.PaidArbiterSellerAmount, config.PaidArbiterAmount, nil)
	proofState := build(paidArbiter, config.ProofSequence, config.ProofSellerAmount, config.ProofArbiterAmount, must(hex.DecodeString(config.PaymentProofHex)))
	buyerSignature := must(pool.SignArbitratedPoolAsBuyer(paidArbiter, funding.PoolAmount, roles, buyer))
	sellerSignature := must(pool.SignArbitratedPoolAsSeller(paidArbiter, funding.PoolAmount, roles, seller))
	arbiterSignature := must(pool.SignArbitratedPoolAsArbiter(paidArbiter, funding.PoolAmount, roles, arbiter))
	finalBuyerSeller := must(pool.MergeArbitratedPoolBuyerSellerSignatures(paidArbiter, funding.PoolAmount, roles, buyerSignature, sellerSignature))
	finalBuyerArbiter := must(pool.MergeArbitratedPoolBuyerArbiterSignatures(paidArbiter, funding.PoolAmount, roles, buyerSignature, arbiterSignature))
	finalSellerArbiter := must(pool.MergeArbitratedPoolSellerArbiterSignatures(paidArbiter, funding.PoolAmount, roles, sellerSignature, arbiterSignature))
	fmt.Printf("LockHex %s\nFundingHex %s\nFundingTxID %s\nOpeningStateHex %s\nOpeningStateTxID %s\nNegotiationStateHex %s\nNegotiationStateTxID %s\nPaidArbiterStateHex %s\nPaidArbiterStateTxID %s\nProofStateHex %s\nProofStateTxID %s\nBuyerSignatureHex %s\nSellerSignatureHex %s\nArbiterSignatureHex %s\nFinalBuyerSellerHex %s\nFinalBuyerArbiterHex %s\nFinalSellerArbiterHex %s\n", hex.EncodeToString(lock.Bytes()), hex.EncodeToString(funding.Tx.Bytes()), funding.Tx.TxID().String(), hex.EncodeToString(opening.Bytes()), opening.TxID().String(), hex.EncodeToString(negotiation.Bytes()), negotiation.TxID().String(), hex.EncodeToString(paidArbiter.Bytes()), paidArbiter.TxID().String(), hex.EncodeToString(proofState.Bytes()), proofState.TxID().String(), hex.EncodeToString(buyerSignature), hex.EncodeToString(sellerSignature), hex.EncodeToString(arbiterSignature), hex.EncodeToString(finalBuyerSeller.Bytes()), hex.EncodeToString(finalBuyerArbiter.Bytes()), hex.EncodeToString(finalSellerArbiter.Bytes()))
}
