package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"

	ce "github.com/bsv8/MultisigPool/pkg/dual_endpoint"
	libs "github.com/bsv8/MultisigPool/pkg/libs"

	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
)

const (
	TESTNET_API_BASE = "https://api.whatsonchain.com/v1/bsv/test"
	FEE_RATE         = 0.5
	BLOCK_OFFSET     = 5
)

type UTXOResponse struct {
	TxID   string `json:"tx_hash"`
	TxPos  uint32 `json:"tx_pos"`
	Value  uint64 `json:"value"`
	Height uint32 `json:"height"`
}

type BlockchainInfo struct {
	Blocks uint32 `json:"blocks"`
}

// 获取当前区块高度
func getCurrentBlockHeight() (uint32, error) {
	resp, err := http.Get(TESTNET_API_BASE + "/chain/info")
	if err != nil {
		return 0, fmt.Errorf("failed to get blockchain info: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, fmt.Errorf("failed to read response: %w", err)
	}

	var info BlockchainInfo
	if err := json.Unmarshal(body, &info); err != nil {
		return 0, fmt.Errorf("failed to parse blockchain info: %w", err)
	}

	return info.Blocks, nil
}

// 获取地址的 UTXO
func getUTXOs(address string) ([]libs.UTXO, error) {
	url := fmt.Sprintf("%s/address/%s/unspent", TESTNET_API_BASE, address)
	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to get UTXOs: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var utxoResponses []UTXOResponse
	if err := json.Unmarshal(body, &utxoResponses); err != nil {
		return nil, fmt.Errorf("failed to parse UTXOs: %w", err)
	}

	var utxos []libs.UTXO
	for _, u := range utxoResponses {
		utxos = append(utxos, libs.UTXO{
			TxID:  u.TxID,
			Vout:  u.TxPos,
			Value: u.Value,
		})
	}

	return utxos, nil
}

// 显示交易信息
func displayTransaction(step string, tx string, description string) {
	fmt.Printf("\n=== %s ===\n", step)
	fmt.Printf("%s\n", description)
	fmt.Printf("TX Hex: %s\n", tx)
	fmt.Printf("Length: %d bytes\n", len(tx)/2)
	fmt.Println("---")
}

func main() {
	// 从环境变量获取私钥
	clientPrivHex := os.Getenv("FEEPOOL_CLIENT_PRIV")
	serverPrivHex := os.Getenv("FEEPOOL_SERVER_PRIV")

	if clientPrivHex == "" || serverPrivHex == "" {
		log.Fatal("Please set FEEPOOL_CLIENT_PRIV and FEEPOOL_SERVER_PRIV environment variables")
	}

	clientPriv, err := ec.PrivateKeyFromHex(clientPrivHex)
	if err != nil {
		log.Fatalf("Invalid client private key: %v", err)
	}

	serverPriv, err := ec.PrivateKeyFromHex(serverPrivHex)
	if err != nil {
		log.Fatalf("Invalid server private key: %v", err)
	}

	// 获取客户端地址
	clientAddress, err := libs.GetAddressFromPublicKey(clientPriv.PubKey(), false) // testnet
	if err != nil {
		log.Fatalf("Failed to get client address: %v", err)
	}

	serverAddress, err := libs.GetAddressFromPublicKey(serverPriv.PubKey(), false) // testnet
	if err != nil {
		log.Fatalf("Failed to get server address: %v", err)
	}

	fmt.Printf("Client Private Key: %s\n", clientPrivHex)
	fmt.Printf("Server Private Key: %s\n", serverPrivHex)
	fmt.Printf("Client Address: %s\n", clientAddress.AddressString)
	fmt.Printf("Server Address: %s\n", serverAddress.AddressString)

	// 获取当前区块高度
	currentHeight, err := getCurrentBlockHeight()
	if err != nil {
		log.Fatalf("Failed to get current block height: %v", err)
	}

	endHeight := currentHeight + BLOCK_OFFSET
	fmt.Printf("Current Block Height: %d\n", currentHeight)
	fmt.Printf("End Height: %d\n", endHeight)

	// 获取客户端 UTXOs
	clientUTXOs, err := getUTXOs(clientAddress.AddressString)
	if err != nil {
		log.Fatalf("Failed to get client UTXOs: %v", err)
	}

	if len(clientUTXOs) == 0 {
		log.Fatal("No UTXOs found for client address. Please fund the address first.")
	}

	fmt.Printf("\nFound %d UTXOs for client:\n", len(clientUTXOs))
	totalValue := uint64(0)
	for i, utxo := range clientUTXOs {
		fmt.Printf("UTXO %d: %s:%d (%d satoshis)\n", i, utxo.TxID, utxo.Vout, utxo.Value)
		totalValue += utxo.Value
	}
	fmt.Printf("Total Value: %d satoshis\n", totalValue)

	// Step 1: 创建基础多签交易
	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("STEP 1: Creating Base Transaction (Client UTXO -> Multisig)")
	fmt.Println(strings.Repeat("=", 60))

	// compute feepoolAmount based on discovered utxos
	var total uint64
	for _, u := range clientUTXOs {
		total += u.Value
	}
	var feepoolAmount uint64
	if total > 500 {
		feepoolAmount = total - 500
	} else {
		feepoolAmount = total
	}
	res1, err := ce.BuildDualFeePoolBaseTx(&clientUTXOs, feepoolAmount, clientPriv, serverPriv.PubKey(), false, FEE_RATE)
	if err != nil {
		log.Fatalf("Step 1 failed: %v", err)
	}

	displayTransaction("STEP 1 - BASE TRANSACTION", res1.Tx.String(),
		fmt.Sprintf("Converts client UTXOs to 2-of-2 multisig output\nMultisig Amount: %d satoshis", feepoolAmount))

	// Step 2: 客户端签名花费交易
	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("STEP 2: Client Spend Transaction (Multisig -> Client + Server)")
	fmt.Println(strings.Repeat("=", 60))

	const serverAmount uint64 = 1000 // 服务器获得 1000 satoshis

	bTx, clientSignBytes, clientAmount, err := ce.BuildDualFeePoolSpendTX(
		res1.Tx, res1.Amount, serverAmount, endHeight, clientPriv, serverPriv.PubKey(), false, FEE_RATE)
	if err != nil {
		log.Fatalf("Step 2 failed: %v", err)
	}

	fmt.Printf("Client Signature: %x\n", *clientSignBytes)
	fmt.Printf("Server Amount: %d satoshis\n", serverAmount)
	fmt.Printf("Client Amount: %d satoshis\n", clientAmount)

	displayTransaction("STEP 2 - SPEND TRANSACTION (UNSIGNED)", bTx.String(),
		fmt.Sprintf("Spends multisig to server (%d sats) and client (%d sats)\nLocktime: %d",
			serverAmount, clientAmount, endHeight))

	// Step 3: 服务器签名
	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("STEP 3: Server Sign")
	fmt.Println(strings.Repeat("=", 60))

	serverSignBytes, err := ce.SpendTXServerSign(bTx, res1.Amount, serverPriv, clientPriv.PubKey())
	if err != nil {
		log.Fatalf("Step 3 failed: %v", err)
	}

	fmt.Printf("Server Signature: %x\n", *serverSignBytes)

	// 组合签名创建完整交易
	signs := [][]byte{*serverSignBytes, *clientSignBytes}
	unlockScript, err := libs.BuildSignScript(&signs)
	if err != nil {
		log.Fatalf("Failed to build unlock script: %v", err)
	}
	bTx.Inputs[0].UnlockingScript = unlockScript

	displayTransaction("STEP 3 - COMPLETE SPEND TRANSACTION", bTx.String(),
		"Fully signed transaction ready for broadcast")

	// Step 4: 客户端更新签名（修改金额分配）
	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("STEP 4: Client Update Sign (Change Amount Distribution)")
	fmt.Println(strings.Repeat("=", 60))

	const newServerAmount uint64 = 1500 // 修改服务器金额为 1500 satoshis
	const newSequenceNumber uint32 = 2  // 修改序列号

	updatedTx, err := ce.LoadTx(bTx.String(), nil, newSequenceNumber, newServerAmount,
		serverPriv.PubKey(), clientPriv.PubKey(), res1.Amount)
	if err != nil {
		log.Fatalf("Step 4 load tx failed: %v", err)
	}

	clientUpdateSignBytes, err := ce.ClientDualFeePoolSpendTXUpdateSign(updatedTx, clientPriv, serverPriv.PubKey())
	if err != nil {
		log.Fatalf("Step 4 client sign failed: %v", err)
	}

	fmt.Printf("Client Update Signature: %x\n", *clientUpdateSignBytes)
	fmt.Printf("New Server Amount: %d satoshis\n", newServerAmount)
	fmt.Printf("New Client Amount: %d satoshis\n", res1.Amount-newServerAmount)
	fmt.Printf("New Sequence Number: %d\n", newSequenceNumber)

	displayTransaction("STEP 4 - UPDATED TRANSACTION (UNSIGNED)", updatedTx.String(),
		fmt.Sprintf("Updated amounts - Server: %d sats, Client: %d sats, Sequence: %d",
			newServerAmount, res1.Amount-newServerAmount, newSequenceNumber))

	// Step 5: 服务器更新签名
	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("STEP 5: Server Update Sign")
	fmt.Println(strings.Repeat("=", 60))

	serverUpdateSignBytes, err := ce.ServerDualFeePoolSpendTXUpdateSign(updatedTx, serverPriv, clientPriv.PubKey())
	if err != nil {
		log.Fatalf("Step 5 failed: %v", err)
	}

	fmt.Printf("Server Update Signature: %x\n", *serverUpdateSignBytes)

	// 组合更新后的签名
	updateSigns := [][]byte{*serverUpdateSignBytes, *clientUpdateSignBytes}
	updateUnlockScript, err := libs.BuildSignScript(&updateSigns)
	if err != nil {
		log.Fatalf("Failed to build update unlock script: %v", err)
	}
	updatedTx.Inputs[0].UnlockingScript = updateUnlockScript

	displayTransaction("STEP 5 - COMPLETE UPDATED TRANSACTION", updatedTx.String(),
		"Fully signed updated transaction ready for broadcast")

	// 最终步骤：关闭费用池（设置 locktime 和 sequence 为 0xffffffff）
	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("FINAL STEP: Close Fee Pool (locktime=0xffffffff, sequence=0xffffffff)")
	fmt.Println(strings.Repeat("=", 60))

	finalLocktime := uint32(0xffffffff)
	finalSequence := uint32(0xffffffff)

	finalTx, err := ce.LoadTx(bTx.String(), &finalLocktime, finalSequence, newServerAmount,
		serverPriv.PubKey(), clientPriv.PubKey(), res1.Amount)
	if err != nil {
		log.Fatalf("Final step load tx failed: %v", err)
	}

	// 客户端最终签名
	clientFinalSignBytes, err := ce.ClientDualFeePoolSpendTXUpdateSign(finalTx, clientPriv, serverPriv.PubKey())
	if err != nil {
		log.Fatalf("Final client sign failed: %v", err)
	}

	// 服务器最终签名
	serverFinalSignBytes, err := ce.ServerDualFeePoolSpendTXUpdateSign(finalTx, serverPriv, clientPriv.PubKey())
	if err != nil {
		log.Fatalf("Final server sign failed: %v", err)
	}

	// 组合最终签名
	finalSigns := [][]byte{*serverFinalSignBytes, *clientFinalSignBytes}
	finalUnlockScript, err := libs.BuildSignScript(&finalSigns)
	if err != nil {
		log.Fatalf("Failed to build final unlock script: %v", err)
	}
	finalTx.Inputs[0].UnlockingScript = finalUnlockScript

	fmt.Printf("Client Final Signature: %x\n", *clientFinalSignBytes)
	fmt.Printf("Server Final Signature: %x\n", *serverFinalSignBytes)
	fmt.Printf("Final Locktime: 0x%x\n", finalLocktime)
	fmt.Printf("Final Sequence: 0x%x\n", finalSequence)

	displayTransaction("FINAL - CLOSED FEE POOL TRANSACTION", finalTx.String(),
		"Fee pool closed - can be broadcast immediately without time locks")

	// 总结
	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("SUMMARY - TRANSACTION SEQUENCE")
	fmt.Println(strings.Repeat("=", 60))
	fmt.Printf("1. Base TX (Step 1):     %s\n", res1.Tx.TxID())
	fmt.Printf("2. Spend TX (Step 3):    %s\n", bTx.TxID())
	fmt.Printf("3. Updated TX (Step 5):  %s\n", updatedTx.TxID())
	fmt.Printf("4. Final TX (Closed):    %s\n", finalTx.TxID())
	fmt.Println()
	fmt.Printf("Server Final Amount: %d satoshis\n", newServerAmount)
	fmt.Printf("Client Final Amount: %d satoshis\n", res1.Amount-newServerAmount)
	fmt.Println()
	fmt.Println("BROADCAST ORDER:")
	fmt.Println("1. First broadcast the Base Transaction (Step 1)")
	fmt.Println("2. Wait for confirmation")
	fmt.Println("3. Then broadcast the Final Transaction")
	fmt.Println()
	fmt.Println("TESTNET EXPLORER:")
	fmt.Println("https://test.whatsonchain.com/")
}
