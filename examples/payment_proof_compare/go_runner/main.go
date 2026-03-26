package main

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"

	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
	dual "github.com/bsv8/MultisigPool/pkg/dual_endpoint"
	libs "github.com/bsv8/MultisigPool/pkg/libs"
	triple "github.com/bsv8/MultisigPool/pkg/triple_endpoint"
)

type dualFixture struct {
	ClientPrivHex string      `json:"clientPrivHex"`
	ServerPrivHex string      `json:"serverPrivHex"`
	ClientUtxos   []libs.UTXO `json:"clientUtxos"`
	EndHeight     uint32      `json:"endHeight"`
	FeeRate       float64     `json:"feeRate"`
	IsMain        bool        `json:"isMain"`
	ServerAmount  uint64      `json:"serverAmount"`
	FeepoolAmount uint64      `json:"feepoolAmount"`
}

type tripleFixture struct {
	ClientPrivHex string      `json:"clientPrivHex"`
	ServerPrivHex string      `json:"serverPrivHex"`
	EscrowPrivHex string      `json:"escrowPrivHex"`
	ClientUtxos   []libs.UTXO `json:"clientUtxos"`
	FeeRate       float64     `json:"feeRate"`
	IsMain        bool        `json:"isMain"`
}

type fixture struct {
	PaymentProofHex string        `json:"paymentProofHex"`
	Dual            dualFixture   `json:"dual"`
	Triple          tripleFixture `json:"triple"`
}

func loadFixture() fixture {
	_, srcPath, _, ok := runtime.Caller(0)
	if !ok {
		log.Fatalf("cannot determine caller path")
	}
	dir := filepath.Dir(srcPath)
	data, err := os.ReadFile(filepath.Join(dir, "../fixture.json"))
	if err != nil {
		log.Fatalf("read fixture: %v", err)
	}
	var f fixture
	if err := json.Unmarshal(data, &f); err != nil {
		log.Fatalf("unmarshal fixture: %v", err)
	}
	return f
}

func main() {
	f := loadFixture()
	proof, err := hex.DecodeString(f.PaymentProofHex)
	if err != nil {
		log.Fatalf("decode paymentProofHex: %v", err)
	}

	dualClientPriv, _ := ec.PrivateKeyFromHex(f.Dual.ClientPrivHex)
	dualServerPriv, _ := ec.PrivateKeyFromHex(f.Dual.ServerPrivHex)
	dualBase, err := dual.BuildDualFeePoolBaseTx(&f.Dual.ClientUtxos, f.Dual.FeepoolAmount, dualClientPriv, dualServerPriv.PubKey(), f.Dual.IsMain, f.Dual.FeeRate)
	if err != nil {
		log.Fatalf("build dual base tx: %v", err)
	}
	dualSpend, _, dualAmount, err := dual.BuildDualFeePoolSpendTXWithProof(dualBase.Tx, dualBase.Amount, f.Dual.ServerAmount, f.Dual.EndHeight, dualClientPriv, dualServerPriv.PubKey(), f.Dual.IsMain, f.Dual.FeeRate, proof)
	if err != nil {
		log.Fatalf("build dual spend tx: %v", err)
	}
	fmt.Printf("DualOutputCount: %d\n", len(dualSpend.Outputs))
	fmt.Printf("DualProofScriptHex: %x\n", dualSpend.Outputs[len(dualSpend.Outputs)-1].LockingScript.Bytes())
	fmt.Printf("DualClientAmount: %d\n", dualAmount)

	tripleClientPriv, _ := ec.PrivateKeyFromHex(f.Triple.ClientPrivHex)
	tripleServerPriv, _ := ec.PrivateKeyFromHex(f.Triple.ServerPrivHex)
	tripleEscrowPriv, _ := ec.PrivateKeyFromHex(f.Triple.EscrowPrivHex)
	tripleBase, err := triple.BuildTripleFeePoolBaseTx(&f.Triple.ClientUtxos, tripleServerPriv.PubKey(), tripleClientPriv, tripleEscrowPriv.PubKey(), f.Triple.IsMain, f.Triple.FeeRate)
	if err != nil {
		log.Fatalf("build triple base tx: %v", err)
	}
	tripleSpend, _, tripleAmount, err := triple.BuildTripleFeePoolSpendTXWithProof(tripleBase.Tx, tripleBase.Amount, 0, tripleServerPriv.PubKey(), tripleClientPriv, tripleEscrowPriv.PubKey(), f.Triple.IsMain, f.Triple.FeeRate, proof)
	if err != nil {
		log.Fatalf("build triple spend tx: %v", err)
	}
	fmt.Printf("TripleOutputCount: %d\n", len(tripleSpend.Outputs))
	fmt.Printf("TripleProofScriptHex: %x\n", tripleSpend.Outputs[len(tripleSpend.Outputs)-1].LockingScript.Bytes())
	fmt.Printf("TripleClientAmount: %d\n", tripleAmount)
}
