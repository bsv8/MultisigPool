package main

import (
	"encoding/hex"
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
	FeeRate       float64     `json:"feePerByte"`
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
	serverSignBytes, err := te.SpendTXTripleFeePoolBSign(tx2, step1.Amount, serverPriv.PubKey(), clientPriv.PubKey(), escrowPriv)
	if err != nil {
		log.Fatalf("step3 server sign: %v", err)
	}

	// Print signatures hex for debugging
	fmt.Printf("BuyerSig: %x\n", *clientSignBytes)
	fmt.Printf("SellerSig: %x\n", *serverSignBytes)

	// Step4: 进入仲裁更新交易（卖方金额 + 仲裁费 + 证据 OP_RETURN）
	proofBytes, err := hex.DecodeString(f.Arbitration.ProofHex)
	if err != nil {
		log.Fatalf("decode proof hex: %v", err)
	}
	arbTx, err := te.TripleFeePoolLoadArbitrationTx(
		tx2.String(),
		nil,
		f.Arbitration.SequenceNumber,
		f.Arbitration.SellerAmount,
		f.Arbitration.ArbiterFee,
		f.IsMain,
		serverPriv.PubKey(),
		clientPriv.PubKey(),
		escrowPriv.PubKey(),
		step1.Amount,
		proofBytes,
	)
	if err != nil {
		log.Fatalf("step4 load arbitration tx: %v", err)
	}
	fmt.Printf("ArbitrationTxHex: %s\n", arbTx.String())

	// Step5: 仲裁者签名（server）
	arbiterSig, err := te.ServerTripleFeePoolSpendTXUpdateSign(arbTx, serverPriv, clientPriv.PubKey(), escrowPriv.PubKey())
	if err != nil {
		log.Fatalf("step5 arbiter sign: %v", err)
	}
	fmt.Printf("ArbiterSig: %x\n", *arbiterSig)

	// Step6: 卖方确认手续费后签名（不认可则业务层直接放弃，不广播）
	sellerArbSig, err := te.ClientBTripleFeePoolSpendTXUpdateSign(arbTx, serverPriv.PubKey(), clientPriv.PubKey(), escrowPriv)
	if err != nil {
		log.Fatalf("step6 seller sign: %v", err)
	}
	fmt.Printf("SellerArbSig: %x\n", *sellerArbSig)

	// Step7: 合成最终可广播交易（仲裁者签名 + 卖方签名）
	finalTx, err := te.MergeTripleFeePoolSigForSpendTx(arbTx.String(), arbiterSig, sellerArbSig)
	if err != nil {
		log.Fatalf("step7 merge sign: %v", err)
	}
	fmt.Printf("FinalArbitrationHex: %s\n", finalTx.String())

	_ = amount
}
