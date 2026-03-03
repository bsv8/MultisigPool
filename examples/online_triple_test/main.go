package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"

	libs "github.com/bsv8/MultisigPool/pkg/libs"
	te "github.com/bsv8/MultisigPool/pkg/triple_endpoint"

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
	client1PrivHex := os.Getenv("FEEPOOL_CLIENT1_PRIV")
	client2PrivHex := os.Getenv("FEEPOOL_CLIENT2_PRIV")
	serverPrivHex := os.Getenv("FEEPOOL_SERVER_PRIV")

	if client1PrivHex == "" || client2PrivHex == "" || serverPrivHex == "" {
		log.Fatal("Please set FEEPOOL_CLIENT1_PRIV, FEEPOOL_CLIENT2_PRIV and FEEPOOL_SERVER_PRIV environment variables")
	}

	client1Priv, err := ec.PrivateKeyFromHex(client1PrivHex)
	if err != nil {
		log.Fatalf("Invalid client1 private key: %v", err)
	}

	client2Priv, err := ec.PrivateKeyFromHex(client2PrivHex)
	if err != nil {
		log.Fatalf("Invalid client2 private key: %v", err)
	}

	serverPriv, err := ec.PrivateKeyFromHex(serverPrivHex)
	if err != nil {
		log.Fatalf("Invalid server private key: %v", err)
	}

	// 获取地址
	client1Address, err := libs.GetAddressFromPublicKey(client1Priv.PubKey(), false) // testnet
	if err != nil {
		log.Fatalf("Failed to get client1 address: %v", err)
	}

	client2Address, err := libs.GetAddressFromPublicKey(client2Priv.PubKey(), false) // testnet
	if err != nil {
		log.Fatalf("Failed to get client2 address: %v", err)
	}

	serverAddress, err := libs.GetAddressFromPublicKey(serverPriv.PubKey(), false) // testnet
	if err != nil {
		log.Fatalf("Failed to get server address: %v", err)
	}

	fmt.Printf("Client1 Private Key: %s\n", client1PrivHex)
	fmt.Printf("Client2 Private Key: %s\n", client2PrivHex)
	fmt.Printf("Server Private Key: %s\n", serverPrivHex)
	fmt.Printf("Client1 Address: %s\n", client1Address.AddressString)
	fmt.Printf("Client2 Address: %s\n", client2Address.AddressString)
	fmt.Printf("Server Address: %s\n", serverAddress.AddressString)

	// 获取当前区块高度
	currentHeight, err := getCurrentBlockHeight()
	if err != nil {
		log.Fatalf("Failed to get current block height: %v", err)
	}

	endHeight := currentHeight + BLOCK_OFFSET
	fmt.Printf("Current Block Height: %d\n", currentHeight)
	fmt.Printf("End Height: %d\n", endHeight)

	// 获取客户端1 UTXOs
	client1UTXOs, err := getUTXOs(client1Address.AddressString)
	if err != nil {
		log.Fatalf("Failed to get client1 UTXOs: %v", err)
	}

	if len(client1UTXOs) == 0 {
		log.Fatal("No UTXOs found for client1 address. Please fund the address first.")
	}

	fmt.Printf("\nFound %d UTXOs for client1:\n", len(client1UTXOs))
	totalValue := uint64(0)
	for i, utxo := range client1UTXOs {
		fmt.Printf("UTXO %d: %s:%d (%d satoshis)\n", i, utxo.TxID, utxo.Vout, utxo.Value)
		totalValue += utxo.Value
	}
	fmt.Printf("Total Value: %d satoshis\n", totalValue)

	// Step 1: 创建基础三方多签交易
	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("STEP 1: Creating Base Transaction (Client1 UTXO -> Triple Multisig)")
	fmt.Println(strings.Repeat("=", 60))

	res1, err := te.BuildTripleFeePoolBaseTx(&client1UTXOs, serverPriv.PubKey(), client1Priv, client2Priv.PubKey(), false, FEE_RATE)
	if err != nil {
		log.Fatalf("Step 1 failed: %v", err)
	}

	displayTransaction("STEP 1 - BASE TRANSACTION", res1.Tx.String(),
		fmt.Sprintf("Converts client1 UTXOs to 2-of-3 multisig output\nMultisig Amount: %d satoshis", res1.Amount))

	// Step 2: 构建花费交易 (Client1 -> Client2, Server作为仲裁者)
	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("STEP 2: Build Spend Transaction (Client1 -> Client2, Server as Arbitrator)")
	fmt.Println(strings.Repeat("=", 60))

	// 在三方费用池中，这里的参数实际上是总的输入金额
	bTx, client1SignBytes, client1Amount, err := te.BuildTripleFeePoolSpendTX(
		res1.Tx, res1.Amount, endHeight, serverPriv.PubKey(), client1Priv, client2Priv.PubKey(), false, FEE_RATE)
	if err != nil {
		log.Fatalf("Step 2 failed: %v", err)
	}

	// 在三方费用池中，Server不参与金额分配，只作为仲裁者
	// Client1 保留 client1Amount，剩余的给 Client2
	client2Amount := res1.Amount - client1Amount
	fmt.Printf("Client1 Amount (after fee): %d satoshis\n", client1Amount)
	fmt.Printf("Client2 Amount: %d satoshis\n", client2Amount)
	fmt.Printf("Server Role: Arbitrator (no funds allocated)\n")

	displayTransaction("STEP 2 - SPEND TRANSACTION (UNSIGNED)", bTx.String(),
		fmt.Sprintf("Spends multisig: client1 (%d sats), client2 (%d sats)\nServer acts as arbitrator\nLocktime: %d",
			client1Amount, client2Amount, endHeight))

	// Step 3: Client1 签名 (already done in BuildTripleFeePoolSpendTX)
	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("STEP 3: Client1 Sign (from BuildTripleFeePoolSpendTX)")
	fmt.Println(strings.Repeat("=", 60))

	fmt.Printf("Client1 Signature: %x\n", *client1SignBytes)

	// Step 4: Server 签名
	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("STEP 4: Server Sign")
	fmt.Println(strings.Repeat("=", 60))

	serverSignBytes, err := te.SpendTXTripleFeePoolBSign(bTx, res1.Amount, serverPriv.PubKey(), client1Priv.PubKey(), client2Priv)
	if err != nil {
		log.Fatalf("Step 4 failed: %v", err)
	}

	fmt.Printf("Server Signature: %x\n", *serverSignBytes)

	// 组合签名创建完整交易 (2-of-3: client1 + server)
	bTx, err = te.MergeTripleFeePoolSigForSpendTx(bTx.String(), client1SignBytes, serverSignBytes)
	if err != nil {
		log.Fatalf("Failed to merge signatures: %v", err)
	}

	displayTransaction("STEP 4 - COMPLETE SPEND TRANSACTION", bTx.String(),
		"Fully signed transaction (client1 + server) ready for broadcast")

	// Step 5: 客户端1更新签名（修改Client1和Client2之间的金额分配）
	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("STEP 5: Client1 Update Sign (Adjust Client1-Client2 Distribution)")
	fmt.Println(strings.Repeat("=", 60))

	const newClient1Amount uint64 = 1500 // Client1 获得更多金额
	const newSequenceNumber uint32 = 2   // 修改序列号

	updatedTx, err := te.TripleFeePoolLoadTx(bTx.String(), nil, newSequenceNumber, newClient1Amount,
		serverPriv.PubKey(), client1Priv.PubKey(), client2Priv.PubKey(), res1.Amount)
	if err != nil {
		log.Fatalf("Step 5 load tx failed: %v", err)
	}

	client1UpdateSignBytes, err := te.ClientATripleFeePoolSpendTXUpdateSign(updatedTx, serverPriv.PubKey(), client1Priv, client2Priv.PubKey())
	if err != nil {
		log.Fatalf("Step 5 client1 sign failed: %v", err)
	}

	newClient2Amount := res1.Amount - newClient1Amount
	fmt.Printf("Client1 Update Signature: %x\n", *client1UpdateSignBytes)
	fmt.Printf("New Client1 Amount: %d satoshis\n", newClient1Amount)
	fmt.Printf("New Client2 Amount: %d satoshis\n", newClient2Amount)
	fmt.Printf("Server Role: Arbitrator (unchanged)\n")
	fmt.Printf("New Sequence Number: %d\n", newSequenceNumber)

	displayTransaction("STEP 5 - UPDATED TRANSACTION (UNSIGNED)", updatedTx.String(),
		fmt.Sprintf("Updated distribution - Client1: %d sats, Client2: %d sats, Sequence: %d",
			newClient1Amount, newClient2Amount, newSequenceNumber))

	// Step 6: Client2 同意更新签名（正常协商流程）
	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("STEP 6: Client2 Agrees and Signs (Normal Negotiation)")
	fmt.Println(strings.Repeat("=", 60))

	client2UpdateSignBytes, err := te.ClientBTripleFeePoolSpendTXUpdateSign(updatedTx, serverPriv.PubKey(), client1Priv.PubKey(), client2Priv)
	if err != nil {
		log.Fatalf("Step 6 failed: %v", err)
	}

	fmt.Printf("Client2 Update Signature: %x\n", *client2UpdateSignBytes)

	// 组合更新后的签名 (2-of-3: client1 + client2 协商完成)
	updatedTx, err = te.MergeTripleFeePoolSigForSpendTx(updatedTx.String(), client1UpdateSignBytes, client2UpdateSignBytes)
	if err != nil {
		log.Fatalf("Failed to merge update signatures: %v", err)
	}

	displayTransaction("STEP 6 - COMPLETE UPDATED TRANSACTION", updatedTx.String(),
		"Client1 + Client2 协商完成的交易，可以广播")

	// 最终步骤：关闭费用池（设置 locktime 和 sequence 为 0xffffffff）
	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("FINAL STEP: Close Fee Pool (locktime=0xffffffff, sequence=0xffffffff)")
	fmt.Println(strings.Repeat("=", 60))

	finalLocktime := uint32(0xffffffff)
	finalSequence := uint32(0xffffffff)

	finalTx, err := te.TripleFeePoolLoadTx(bTx.String(), &finalLocktime, finalSequence, newClient1Amount,
		serverPriv.PubKey(), client1Priv.PubKey(), client2Priv.PubKey(), res1.Amount)
	if err != nil {
		log.Fatalf("Final step load tx failed: %v", err)
	}

	// 客户端1最终签名
	client1FinalSignBytes, err := te.ClientATripleFeePoolSpendTXUpdateSign(finalTx, serverPriv.PubKey(), client1Priv, client2Priv.PubKey())
	if err != nil {
		log.Fatalf("Final client1 sign failed: %v", err)
	}

	// 服务器最终签名
	serverFinalSignBytes, err := te.SpendTXTripleFeePoolBSign(finalTx, res1.Amount, serverPriv.PubKey(), client1Priv.PubKey(), client2Priv)
	if err != nil {
		log.Fatalf("Final server sign failed: %v", err)
	}

	// 组合最终签名 (2-of-3: client1 + server)
	finalTx, err = te.MergeTripleFeePoolSigForSpendTx(finalTx.String(), client1FinalSignBytes, serverFinalSignBytes)
	if err != nil {
		log.Fatalf("Failed to merge final signatures: %v", err)
	}

	fmt.Printf("Client1 Final Signature: %x\n", *client1FinalSignBytes)
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
	fmt.Printf("2. Spend TX (Step 4):    %s\n", bTx.TxID())
	fmt.Printf("3. Updated TX (Step 6):  %s\n", updatedTx.TxID())
	fmt.Printf("4. Final TX (Closed):    %s\n", finalTx.TxID())
	fmt.Println()
	fmt.Printf("Client1 Final Amount: %d satoshis\n", newClient1Amount)
	fmt.Printf("Client2 Final Amount: %d satoshis\n", newClient2Amount)
	fmt.Printf("Server Role: Arbitrator (no funds)\n")
	fmt.Println()
	fmt.Println("BROADCAST ORDER:")
	fmt.Println("1. First broadcast the Base Transaction (Step 1)")
	fmt.Println("2. Wait for confirmation")
	fmt.Println("3. Then broadcast the Final Transaction")
	fmt.Println()
	fmt.Println("TESTNET EXPLORER:")
	fmt.Println("https://test.whatsonchain.com/")
}
