package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
	libs "github.com/bsv8/MultisigPool/pkg/libs"
	te "github.com/bsv8/MultisigPool/pkg/triple_endpoint"
)

// TestConfig holds all test parameters
type TestConfig struct {
	FeeRate          float64 `json:"fee_rate"`
	EndHeight        uint32  `json:"end_height"`
	Sequence2        uint32  `json:"sequence_2"`
	NewClient1Amount uint64  `json:"new_client1_amount"`
	FinalLocktime    uint32  `json:"final_locktime"`
	FinalSequence    uint32  `json:"final_sequence"`
	Client1PrivHex   string  `json:"client1_priv_hex"`
	Client2PrivHex   string  `json:"client2_priv_hex"`
	ServerPrivHex    string  `json:"server_priv_hex"`
	FixedUTXO        struct {
		TxID  string `json:"txid"`
		Vout  uint32 `json:"vout"`
		Value uint64 `json:"value"`
	} `json:"fixed_utxo"`
	ExpectedOutputs map[string]string `json:"expected_outputs"`
}

// loadTestConfig loads configuration from test_config.json and expected_outputs.json
func loadTestConfig() (*TestConfig, error) {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		return nil, fmt.Errorf("Failed to resolve configuration path")
	}
	baseDir := filepath.Dir(thisFile)

	configData, err := ioutil.ReadFile(filepath.Join(baseDir, "test_config.json"))
	if err != nil {
		return nil, fmt.Errorf("Failed to read test_config.json: %w", err)
	}

	var config TestConfig
	if err := json.Unmarshal(configData, &config); err != nil {
		return nil, fmt.Errorf("Failed to parse test_config.json: %w", err)
	}

	expectedData, err := ioutil.ReadFile(filepath.Join(baseDir, "expected_outputs.json"))
	if err != nil {
		return nil, fmt.Errorf("Failed to read expected_outputs.json: %w", err)
	}

	var expectedOutputs map[string]string
	if err := json.Unmarshal(expectedData, &expectedOutputs); err != nil {
		return nil, fmt.Errorf("Failed to parse expected_outputs.json: %w", err)
	}

	config.ExpectedOutputs = expectedOutputs
	return &config, nil
}

func runTripleEndpointFixedUTXO() error {
	config, err := loadTestConfig()
	if err != nil {
		return err
	}

	client1Priv, err := ec.PrivateKeyFromHex(config.Client1PrivHex)
	if err != nil {
		return fmt.Errorf("Invalid client1 private key: %w", err)
	}

	client2Priv, err := ec.PrivateKeyFromHex(config.Client2PrivHex)
	if err != nil {
		return fmt.Errorf("Invalid client2 private key: %w", err)
	}

	serverPriv, err := ec.PrivateKeyFromHex(config.ServerPrivHex)
	if err != nil {
		return fmt.Errorf("Invalid server private key: %w", err)
	}

	client1Address, err := libs.GetAddressFromPublicKey(client1Priv.PubKey(), false)
	if err != nil {
		return fmt.Errorf("Failed to get client1 address: %w", err)
	}

	client2Address, err := libs.GetAddressFromPublicKey(client2Priv.PubKey(), false)
	if err != nil {
		return fmt.Errorf("Failed to get client2 address: %w", err)
	}

	serverAddress, err := libs.GetAddressFromPublicKey(serverPriv.PubKey(), false)
	if err != nil {
		return fmt.Errorf("Failed to get server address: %w", err)
	}

	fmt.Printf("Client1 Private Key: %s\n", config.Client1PrivHex)
	fmt.Printf("Client2 Private Key: %s\n", config.Client2PrivHex)
	fmt.Printf("Server Private Key: %s\n", config.ServerPrivHex)
	fmt.Printf("Client1 Address: %s\n", client1Address.AddressString)
	fmt.Printf("Client2 Address: %s\n", client2Address.AddressString)
	fmt.Printf("Server Address: %s\n", serverAddress.AddressString)
	fmt.Printf("Current Block Height: 1687373\n")
	fmt.Printf("End Height: %d\n", config.EndHeight)

	fixedUTXO := libs.UTXO{
		TxID:  config.FixedUTXO.TxID,
		Vout:  config.FixedUTXO.Vout,
		Value: config.FixedUTXO.Value,
	}
	client1UTXOs := []libs.UTXO{fixedUTXO}

	fmt.Printf("\nFound 1 UTXOs for client1:\n")
	fmt.Printf("UTXO 0: %s:%d (%d satoshis)\n", fixedUTXO.TxID, fixedUTXO.Vout, fixedUTXO.Value)
	fmt.Printf("Total Value: %d satoshis\n", fixedUTXO.Value)

	mismatches := make([]string, 0)

	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("STEP 1: Creating Base Transaction (Client1 UTXO -> Triple Multisig)")
	fmt.Println(strings.Repeat("=", 60))

	res1, err := te.BuildTripleFeePoolBaseTx(&client1UTXOs, serverPriv.PubKey(), client1Priv, client2Priv.PubKey(), false, config.FeeRate)
	if err != nil {
		return fmt.Errorf("Step 1 failed: %w", err)
	}

	baseTxHex := res1.Tx.String()
	fmt.Printf("=== STEP 1 - BASE TRANSACTION ===\n")
	fmt.Printf("Converts client1 UTXOs to 2-of-3 multisig output\nMultisig Amount: %d satoshis\n", res1.Amount)
	fmt.Printf("TX Hex: %s\n", baseTxHex)
	fmt.Printf("Length: %d bytes\n", len(baseTxHex)/2)
	fmt.Println("---")

	if expected, exists := config.ExpectedOutputs["base_tx"]; exists && baseTxHex != expected {
		mismatches = append(mismatches, fmt.Sprintf("Base transaction mismatch.\nExpected: %s\nGot:      %s", expected, baseTxHex))
	}

	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("STEP 2: Build Spend Transaction (Client1 -> Client2, Server as Arbitrator)")
	fmt.Println(strings.Repeat("=", 60))

	bTx, client1SignBytes, client1Amount, err := te.BuildTripleFeePoolSpendTX(
		res1.Tx, res1.Amount, config.EndHeight, serverPriv.PubKey(), client1Priv, client2Priv.PubKey(), false, config.FeeRate)
	if err != nil {
		return fmt.Errorf("Step 2 failed: %w", err)
	}

	client2Amount := res1.Amount - client1Amount
	fmt.Printf("Client1 Amount (after fee): %d satoshis\n", client1Amount)
	fmt.Printf("Client2 Amount: %d satoshis\n", client2Amount)
	fmt.Printf("Server Role: Arbitrator (no funds allocated)\n")

	spendTxUnsignedHex := bTx.String()
	fmt.Printf("=== STEP 2 - SPEND TRANSACTION (UNSIGNED) ===\n")
	fmt.Printf("Spends multisig: client1 (%d sats), client2 (%d sats)\nServer acts as arbitrator\nLocktime: %d\n",
		client1Amount, client2Amount, config.EndHeight)
	fmt.Printf("TX Hex: %s\n", spendTxUnsignedHex)
	fmt.Printf("Length: %d bytes\n", len(spendTxUnsignedHex)/2)
	fmt.Println("---")

	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("STEP 3: Client1 Sign (from BuildTripleFeePoolSpendTX)")
	fmt.Println(strings.Repeat("=", 60))

	client1SigHex := fmt.Sprintf("%x", *client1SignBytes)
	fmt.Printf("Client1 Signature: %s\n", client1SigHex)

	if expected, exists := config.ExpectedOutputs["client1_signature"]; exists && client1SigHex != expected {
		mismatches = append(mismatches, fmt.Sprintf("Client1 signature mismatch.\nExpected: %s\nGot:      %s", expected, client1SigHex))
	}

	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("STEP 4: Server Sign")
	fmt.Println(strings.Repeat("=", 60))

	serverSignBytes, err := te.SpendTXTripleFeePoolBSign(bTx, res1.Amount, serverPriv.PubKey(), client1Priv.PubKey(), client2Priv)
	if err != nil {
		return fmt.Errorf("Step 4 failed: %w", err)
	}

	serverSigHex := fmt.Sprintf("%x", *serverSignBytes)
	fmt.Printf("Server Signature: %s\n", serverSigHex)

	if expected, exists := config.ExpectedOutputs["server_signature"]; exists && serverSigHex != expected {
		mismatches = append(mismatches, fmt.Sprintf("Server signature mismatch.\nExpected: %s\nGot:      %s", expected, serverSigHex))
	}

	bTx, err = te.MergeTripleFeePoolSigForSpendTx(bTx.String(), client1SignBytes, serverSignBytes)
	if err != nil {
		return fmt.Errorf("Failed to merge signatures: %w", err)
	}

	completeSpendTxHex := bTx.String()
	fmt.Printf("=== STEP 4 - COMPLETE SPEND TRANSACTION ===\n")
	fmt.Printf("Fully signed transaction (client1 + server) ready for broadcast\n")
	fmt.Printf("TX Hex: %s\n", completeSpendTxHex)
	fmt.Printf("Length: %d bytes\n", len(completeSpendTxHex)/2)
	fmt.Println("---")

	if expected, exists := config.ExpectedOutputs["complete_spend_tx"]; exists && completeSpendTxHex != expected {
		mismatches = append(mismatches, fmt.Sprintf("Complete spend transaction mismatch.\nExpected: %s\nGot:      %s", expected, completeSpendTxHex))
	}

	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("STEP 5: Client1 Update Sign (Adjust Client1-Client2 Distribution)")
	fmt.Println(strings.Repeat("=", 60))

	updatedTx, err := te.TripleFeePoolLoadTx(bTx.String(), nil, config.Sequence2, config.NewClient1Amount,
		serverPriv.PubKey(), client1Priv.PubKey(), client2Priv.PubKey(), res1.Amount)
	if err != nil {
		return fmt.Errorf("Step 5 load tx failed: %w", err)
	}

	client1UpdateSignBytes, err := te.ClientATripleFeePoolSpendTXUpdateSign(updatedTx, serverPriv.PubKey(), client1Priv, client2Priv.PubKey())
	if err != nil {
		return fmt.Errorf("Step 5 client1 sign failed: %w", err)
	}

	newClient2Amount := res1.Amount - config.NewClient1Amount
	client1UpdateSigHex := fmt.Sprintf("%x", *client1UpdateSignBytes)
	fmt.Printf("Client1 Update Signature: %s\n", client1UpdateSigHex)
	fmt.Printf("New Client1 Amount: %d satoshis\n", config.NewClient1Amount)
	fmt.Printf("New Client2 Amount: %d satoshis\n", newClient2Amount)
	fmt.Printf("Server Role: Arbitrator (unchanged)\n")
	fmt.Printf("New Sequence Number: %d\n", config.Sequence2)

	updatedTxUnsignedHex := updatedTx.String()
	fmt.Printf("=== STEP 5 - UPDATED TRANSACTION (UNSIGNED) ===\n")
	fmt.Printf("Updated distribution - Client1: %d sats, Client2: %d sats, Sequence: %d\n",
		config.NewClient1Amount, newClient2Amount, config.Sequence2)
	fmt.Printf("TX Hex: %s\n", updatedTxUnsignedHex)
	fmt.Printf("Length: %d bytes\n", len(updatedTxUnsignedHex)/2)
	fmt.Println("---")

	if expected, exists := config.ExpectedOutputs["client1_update_signature"]; exists && client1UpdateSigHex != expected {
		mismatches = append(mismatches, fmt.Sprintf("Client1 update signature mismatch.\nExpected: %s\nGot:      %s", expected, client1UpdateSigHex))
	}

	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("STEP 6: Client2 Agrees and Signs (Normal Negotiation)")
	fmt.Println(strings.Repeat("=", 60))

	client2UpdateSignBytes, err := te.ClientBTripleFeePoolSpendTXUpdateSign(updatedTx, serverPriv.PubKey(), client1Priv.PubKey(), client2Priv)
	if err != nil {
		return fmt.Errorf("Step 6 failed: %w", err)
	}

	client2UpdateSigHex := fmt.Sprintf("%x", *client2UpdateSignBytes)
	fmt.Printf("Client2 Update Signature: %s\n", client2UpdateSigHex)

	if expected, exists := config.ExpectedOutputs["client2_update_signature"]; exists && client2UpdateSigHex != expected {
		mismatches = append(mismatches, fmt.Sprintf("Client2 update signature mismatch.\nExpected: %s\nGot:      %s", expected, client2UpdateSigHex))
	}

	updatedTx, err = te.MergeTripleFeePoolSigForSpendTx(updatedTx.String(), client1UpdateSignBytes, client2UpdateSignBytes)
	if err != nil {
		return fmt.Errorf("Failed to merge update signatures: %w", err)
	}

	completeUpdatedTxHex := updatedTx.String()
	fmt.Printf("=== STEP 6 - COMPLETE UPDATED TRANSACTION ===\n")
	fmt.Printf("Client1 + Client2 协商完成的交易，可以广播\n")
	fmt.Printf("TX Hex: %s\n", completeUpdatedTxHex)
	fmt.Printf("Length: %d bytes\n", len(completeUpdatedTxHex)/2)
	fmt.Println("---")

	if expected, exists := config.ExpectedOutputs["complete_updated_tx"]; exists && completeUpdatedTxHex != expected {
		mismatches = append(mismatches, fmt.Sprintf("Complete updated transaction mismatch.\nExpected: %s\nGot:      %s", expected, completeUpdatedTxHex))
	}

	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("FINAL STEP: Close Fee Pool (locktime=0xffffffff, sequence=0xffffffff)")
	fmt.Println(strings.Repeat("=", 60))

	finalTx, err := te.TripleFeePoolLoadTx(bTx.String(), &config.FinalLocktime, config.FinalSequence, config.NewClient1Amount,
		serverPriv.PubKey(), client1Priv.PubKey(), client2Priv.PubKey(), res1.Amount)
	if err != nil {
		return fmt.Errorf("Final step load tx failed: %w", err)
	}

	client1FinalSignBytes, err := te.ClientATripleFeePoolSpendTXUpdateSign(finalTx, serverPriv.PubKey(), client1Priv, client2Priv.PubKey())
	if err != nil {
		return fmt.Errorf("Final client1 sign failed: %w", err)
	}

	serverFinalSignBytes, err := te.SpendTXTripleFeePoolBSign(finalTx, res1.Amount, serverPriv.PubKey(), client1Priv.PubKey(), client2Priv)
	if err != nil {
		return fmt.Errorf("Final server sign failed: %w", err)
	}

	finalTx, err = te.MergeTripleFeePoolSigForSpendTx(finalTx.String(), client1FinalSignBytes, serverFinalSignBytes)
	if err != nil {
		return fmt.Errorf("Failed to merge final signatures: %w", err)
	}

	client1FinalSigHex := fmt.Sprintf("%x", *client1FinalSignBytes)
	serverFinalSigHex := fmt.Sprintf("%x", *serverFinalSignBytes)
	fmt.Printf("Client1 Final Signature: %s\n", client1FinalSigHex)
	fmt.Printf("Server Final Signature: %s\n", serverFinalSigHex)
	fmt.Printf("Final Locktime: 0x%x\n", config.FinalLocktime)
	fmt.Printf("Final Sequence: 0x%x\n", config.FinalSequence)

	finalClosedTxHex := finalTx.String()
	fmt.Printf("=== FINAL - CLOSED FEE POOL TRANSACTION ===\n")
	fmt.Printf("Fee pool closed - can be broadcast immediately without time locks\n")
	fmt.Printf("TX Hex: %s\n", finalClosedTxHex)
	fmt.Printf("Length: %d bytes\n", len(finalClosedTxHex)/2)
	fmt.Println("---")

	if expected, exists := config.ExpectedOutputs["client1_final_signature"]; exists && client1FinalSigHex != expected {
		mismatches = append(mismatches, fmt.Sprintf("Client1 final signature mismatch.\nExpected: %s\nGot:      %s", expected, client1FinalSigHex))
	}

	if expected, exists := config.ExpectedOutputs["server_final_signature"]; exists && serverFinalSigHex != expected {
		mismatches = append(mismatches, fmt.Sprintf("Server final signature mismatch.\nExpected: %s\nGot:      %s", expected, serverFinalSigHex))
	}

	if expected, exists := config.ExpectedOutputs["final_closed_tx"]; exists && finalClosedTxHex != expected {
		mismatches = append(mismatches, fmt.Sprintf("Final closed transaction mismatch.\nExpected: %s\nGot:      %s", expected, finalClosedTxHex))
	}

	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("SUMMARY - TRANSACTION SEQUENCE")
	fmt.Println(strings.Repeat("=", 60))
	fmt.Printf("1. Base TX (Step 1):     %s\n", res1.Tx.TxID())
	fmt.Printf("2. Spend TX (Step 4):    %s\n", bTx.TxID())
	fmt.Printf("3. Updated TX (Step 6):  %s\n", updatedTx.TxID())
	fmt.Printf("4. Final TX (Closed):    %s\n", finalTx.TxID())
	fmt.Println()
	fmt.Printf("Client1 Final Amount: %d satoshis\n", config.NewClient1Amount)
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

	if len(mismatches) > 0 {
		return fmt.Errorf("mismatches detected:\n%s", strings.Join(mismatches, "\n"))
	}

	fmt.Println("\n✅ All transaction outputs match expected values from successful test run!")
	return nil
}

func TestTripleEndpointFixedUTXO(t *testing.T) {
	if err := runTripleEndpointFixedUTXO(); err != nil {
		t.Fatalf("%v", err)
	}
}

func main() {
	if err := runTripleEndpointFixedUTXO(); err != nil {
		log.Fatal(err)
	}
	fmt.Println("Test passed successfully!")
}
