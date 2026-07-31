package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"

	libs "github.com/bsv8/MultisigPool/pkg/libs"
	te "github.com/bsv8/MultisigPool/pkg/triple_endpoint"

	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
)

type Fixture struct {
	ClientPrivHex string      `json:"clientPrivHex"`
	ServerPrivHex string      `json:"serverPrivHex"`
	EscrowPrivHex string      `json:"escrowPrivHex"`
	ClientUtxos   []libs.UTXO `json:"clientUtxos"`
	EndHeight     uint32      `json:"endHeight"`
	FeeRate       uint64      `json:"feePerKB"`
	IsMain        bool        `json:"isMain"`
	ChangeAddress string      `json:"changeAddress"` // not used currently
	Arbitration   struct {
		SequenceNumber uint32 `json:"sequenceNumber"`
		SellerAmount   uint64 `json:"sellerAmount"`
		ArbiterFee     uint64 `json:"arbiterFee"`
		ProofHex       string `json:"proofHex"`
	} `json:"arbitration"`
}

func loadFixture() Fixture {
	// locate fixture.json relative to source file directory
	_, srcPath, _, ok := runtime.Caller(0)
	if !ok {
		log.Fatalf("cannot determine caller path")
	}
	dir := filepath.Dir(srcPath)
	var fixturePath string
	for {
		candidate := filepath.Join(dir, "fixture.json")
		if _, err := os.Stat(candidate); err == nil {
			fixturePath = candidate
			break
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	if fixturePath == "" {
		// fallback cwd
		cwd, _ := os.Getwd()
		fixturePath = filepath.Join(cwd, "fixture.json")
	}
	data, err := os.ReadFile(fixturePath)
	if err != nil {
		log.Fatalf("read fixture (%s): %v", fixturePath, err)
	}
	var f Fixture
	if err := json.Unmarshal(data, &f); err != nil {
		log.Fatalf("unmarshal fixture: %v", err)
	}
	return f
}

// func saveNewUTXO(newUtxo libs.UTXO) {
// 	out, _ := json.MarshalIndent(newUtxo, "", "  ")
// 	fmt.Printf("NEW_UTXO: %s\n", string(out))
// }

func main() {
	f := loadFixture()

	clientPriv, _ := ec.PrivateKeyFromHex(f.ClientPrivHex)
	serverPriv, _ := ec.PrivateKeyFromHex(f.ServerPrivHex)
	escrowPriv, _ := ec.PrivateKeyFromHex(f.EscrowPrivHex)

	// Step1 Base Tx: P2PKH -> 2-of-3 multisig pool
	step1, err := te.BuildTripleFeePoolBaseTx(&f.ClientUtxos, serverPriv.PubKey(), clientPriv, escrowPriv.PubKey(), f.IsMain, f.FeeRate)
	if err != nil {
		log.Fatalf("step1: %v", err)
	}

	fmt.Printf("Step1Hex: %s\n", step1.Tx.String())

	// Step2: A(买方)构建花费交易并签名
	tx2, clientSignBytes, amount, err := te.BuildTripleFeePoolSpendTX(step1.Tx, step1.Amount, f.EndHeight, serverPriv.PubKey(), clientPriv, escrowPriv.PubKey(), f.IsMain, f.FeeRate)
	if err != nil {
		log.Fatalf("step2: %v", err)
	}

	// Step3: B(卖方)签名
	serverSignBytes, err := te.ServerTripleFeePoolSpendTXUpdateSign(tx2, serverPriv, clientPriv.PubKey(), escrowPriv.PubKey())
	if err != nil {
		log.Fatalf("step3 server sign: %v", err)
	}

	// Print signatures hex for debugging
	fmt.Printf("BuyerSig: %x\n", *clientSignBytes)
	fmt.Printf("SellerSig: %x\n", *serverSignBytes)

	// V2 arbitration is driven by the signed payment authorization and is
	// intentionally not constructed by this low-level example.
	_ = amount
}
