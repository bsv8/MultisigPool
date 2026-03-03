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
	FeeRate       float64     `json:"feePerByte"`
	IsMain        bool        `json:"isMain"`
	ChangeAddress string      `json:"changeAddress"` // not used currently
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

	// Step2: Client constructs spend TX and provides its signature
	tx2, clientSignBytes, amount, err := te.BuildTripleFeePoolSpendTX(step1.Tx, step1.Amount, f.EndHeight, serverPriv.PubKey(), clientPriv, escrowPriv.PubKey(), f.IsMain, f.FeeRate)
	if err != nil {
		log.Fatalf("step2: %v", err)
	}

	fmt.Printf("Step2Hex: %s\n", tx2.String())

	// Step3: Server signs to finalize
	serverSignBytes, err := te.SpendTXTripleFeePoolBSign(tx2, step1.Amount, serverPriv.PubKey(), clientPriv.PubKey(), escrowPriv)
	if err != nil {
		log.Fatalf("step3 server sign: %v", err)
	}

	// Build final unlocking script with both signatures
	// signs := [][]byte{*clientSignBytes, *serverSignBytes}
	// unlockScript, err := libs.BuildSignScript(&signs)
	// if err != nil {
	//     log.Fatalf("build unlock script: %v", err)
	// }
	// tx2.Inputs[0].UnlockingScript = unlockScript

	// fmt.Printf("Step3Hex: %s\n", tx2.String())

	// // Output new UTXO belonging to client (output[1])
	// newUtxo := libs.UTXO{
	//     TxID:  tx2.TxID().String(),
	//     Vout:  1,
	//     Value: amount,
	// }
	// saveNewUTXO(newUtxo)

	// Print signatures hex for debugging
	fmt.Printf("ClientSig: %x\n", *clientSignBytes)
	fmt.Printf("ServerSig: %x\n", *serverSignBytes)

	// Step4: Client update and re-sign
	const newServerAmount uint64 = 150 // 修改服务器金额
	const newSequenceNumber uint32 = 2 // 修改序列号

	updatedTx, err := te.TripleFeePoolLoadTx(tx2.String(), nil, newSequenceNumber, newServerAmount, serverPriv.PubKey(), clientPriv.PubKey(), escrowPriv.PubKey(), step1.Amount)
	if err != nil {
		log.Fatalf("step4 load tx: %v", err)
	}

	clientUpdateSignBytes, err := te.ClientATripleFeePoolSpendTXUpdateSign(updatedTx, serverPriv.PubKey(), clientPriv, escrowPriv.PubKey())
	if err != nil {
		log.Fatalf("step4 client sign: %v", err)
	}

	fmt.Printf("ClientUpdateSig: %x\n", *clientUpdateSignBytes)

	// Step5: Server update sign
	serverUpdateSignBytes, err := te.ClientBTripleFeePoolSpendTXUpdateSign(updatedTx, serverPriv.PubKey(), clientPriv.PubKey(), escrowPriv)
	if err != nil {
		log.Fatalf("step5 server sign: %v", err)
	}

	fmt.Printf("ServerUpdateSig: %x\n", *serverUpdateSignBytes)
	_ = amount
}
