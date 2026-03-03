package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"

	ce "github.com/bsv8/MultisigPool/pkg/dual_endpoint"
	libs "github.com/bsv8/MultisigPool/pkg/libs"

	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
)

type Fixture struct {
	ClientPrivHex string      `json:"clientPrivHex"`
	ServerPrivHex string      `json:"serverPrivHex"`
	ClientUtxos   []libs.UTXO `json:"clientUtxos"`
	EndHeight     uint32      `json:"endHeight"`
	FeeRate       float64     `json:"feeRate"`
	IsMain        bool        `json:"isMain"`
}

func loadFixture() Fixture {
	// 使用 runtime.Caller 获取当前源文件的绝对路径
	_, srcPath, _, ok := runtime.Caller(0)
	if !ok {
		log.Fatalf("cannot determine caller path")
	}

	// fixture.json 位于当前文件父目录（即 go_runner 上级目录）
	fatherDir := filepath.Dir(filepath.Dir(srcPath))
	fixturePath := filepath.Join(fatherDir, "fixture.json")

	// 如果未找到，则继续向上递归查找
	dir := fatherDir
	for {
		if _, err := os.Stat(fixturePath); err == nil {
			break
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break // 已到达根目录
		}
		dir = parent
		fixturePath = filepath.Join(dir, "fixture.json")
	}

	// 最后尝试当前工作目录
	if _, err := os.Stat(fixturePath); os.IsNotExist(err) {
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

func main() {
	f := loadFixture()

	clientPriv, err := ec.PrivateKeyFromHex(f.ClientPrivHex)
	if err != nil {
		log.Fatalf("parse client private key: %v", err)
	}

	serverPriv, err := ec.PrivateKeyFromHex(f.ServerPrivHex)
	if err != nil {
		log.Fatalf("parse server private key: %v", err)
	}

	// Step 1
	// compute feepoolAmount: use total inputs - small buffer for fees
	var total uint64
	for _, u := range f.ClientUtxos {
		total += u.Value
	}
	var feepoolAmount uint64
	if total > 500 {
		feepoolAmount = total - 500
	} else {
		feepoolAmount = total
	}
	res1, err := ce.BuildDualFeePoolBaseTx(&f.ClientUtxos, feepoolAmount, clientPriv, serverPriv.PubKey(), f.IsMain, f.FeeRate)
	if err != nil {
		log.Fatalf("step1: %v", err)
	}

	// Step 2
	bTx, clientSignBytes, amount, err := ce.BuildDualFeePoolSpendTX(res1.Tx, res1.Amount, 100, f.EndHeight, clientPriv, serverPriv.PubKey(), f.IsMain, f.FeeRate)
	if err != nil {
		log.Fatalf("step2: %v", err)
	}

	// Output results for comparison
	fmt.Printf("Step1 - TxID: %s\n", res1.Tx.TxID().String())
	fmt.Printf("Step1 - Amount: %d\n", res1.Amount)
	fmt.Printf("Step1 - Index: %d\n", res1.Index)
	fmt.Printf("Step1 - Hex: %s\n", res1.Tx.String())
	fmt.Printf("Step2 - TxID: %s\n", bTx.TxID().String())
	fmt.Printf("Step2 - Amount: %d\n", amount)
	fmt.Printf("Step2 - ClientSignBytes: %x\n", *clientSignBytes)
	fmt.Printf("Step2 - Hex: %s\n", bTx.String())
}
