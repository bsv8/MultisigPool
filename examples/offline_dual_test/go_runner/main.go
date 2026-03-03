package main

import (
	"fmt"
	"log"

	ce "github.com/bsv8/MultisigPool/pkg/dual_endpoint"
	libs "github.com/bsv8/MultisigPool/pkg/libs"

	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
)

const (
	FEE_RATE   = 0.5
	END_HEIGHT = 1687365
)

// 固定的测试数据
var (
	CLIENT_PRIV_HEX = "2796e78fad7d383fa5236607eba52d9a1904325daf9b4da3d77be5ad15ab1dae"
	SERVER_PRIV_HEX = "e6d4d7685894d2644d1f4bf31c0b87f3f6aa8a3d7d4091eaa375e81d6c9f9091"

	// 固定的 UTXO
	FIXED_UTXO = libs.UTXO{
		TxID:  "3bc591b12d1d356c80eec9628a626c2676c27e21fe8e0ef34d6dab2e425d9629",
		Vout:  1,
		Value: 206106,
	}

	// 期望的结果
	EXPECTED_RESULTS = map[string]string{
		"step1_tx":                "010000000129965d422eab6d4df30e8efe217ec276266c628a62c9ee806c351d2db191c53b010000006a47304402204bbb904e6c0994bd3a7447b3cb3d5ae73525647e7d80973d1850a10dd754d00b022004028b0ac634ed5b9487caef95912300799f50018e025f07906196de28b673c94121028bd4b450d28a69ed1a5cc9f256d0f3f94c4dedb885aae7144868a511b03511b0ffffffff0119250300000000004752210257db5aff3592dcb574f54b0a448789d4049637acec8a4e66e192591ad56f2c2e21028bd4b450d28a69ed1a5cc9f256d0f3f94c4dedb885aae7144868a511b03511b052ae00000000",
		"step1_amount":            "206105",
		"step2_client_sig":        "304402206d7c4d4430f011e4a29fad9e959bf300789e2bee638f6ddb245316b99630fc7802205daee22202dbe58af3b60d63719d2233d9012335e0be29cbf12c08dec389d6cc41",
		"step2_client_amount":     "205104",
		"step3_server_sig":        "3045022100a17575b8be3889a4a388b53b8d71f1d547501feb48b0157bc7faeaeaf49f9e6d0220762d0f7698cece09463200a0546c76ec434bea74d3820cd60a9e60b86bd9dc7241",
		"step3_complete_tx":       "0100000001de468f3b75f979273edcadcd4a84d47ad46e48eaac6f2e759a35d4cd136e0c04000000009200483045022100a17575b8be3889a4a388b53b8d71f1d547501feb48b0157bc7faeaeaf49f9e6d0220762d0f7698cece09463200a0546c76ec434bea74d3820cd60a9e60b86bd9dc724147304402206d7c4d4430f011e4a29fad9e959bf300789e2bee638f6ddb245316b99630fc7802205daee22202dbe58af3b60d63719d2233d9012335e0be29cbf12c08dec389d6cc410100000002e8030000000000001976a91419c50751f7e477d98ec0189cdfa0967808a2a1e388ac30210300000000001976a914e803a69218895a1a8d3df0f33a5b3d95bbb5a9c688ac45bf1900",
		"step4_client_update_sig": "3045022100e47d9d731eab999facc649397405194298f85756dbd877383e4d0d1594598b52022031555f9c5da7bfde25d101a9c6e17983dc54f98dc0f0785f545ed4f5cebaa95441",
		"step5_server_update_sig": "3044022007bfd4595d03fa76716ab618dd11283a3a14fd1658d1c171c978011b76d5a00902207cbb2a1dfdfa9d7822a830acd1d6b709e2ef18b3bb78d8aa627cd866743a190741",
		"step5_complete_tx":       "0100000001de468f3b75f979273edcadcd4a84d47ad46e48eaac6f2e759a35d4cd136e0c04000000009200473044022007bfd4595d03fa76716ab618dd11283a3a14fd1658d1c171c978011b76d5a00902207cbb2a1dfdfa9d7822a830acd1d6b709e2ef18b3bb78d8aa627cd866743a190741483045022100e47d9d731eab999facc649397405194298f85756dbd877383e4d0d1594598b52022031555f9c5da7bfde25d101a9c6e17983dc54f98dc0f0785f545ed4f5cebaa954410200000002dc050000000000001976a91419c50751f7e477d98ec0189cdfa0967808a2a1e388ac3c1f0300000000001976a914e803a69218895a1a8d3df0f33a5b3d95bbb5a9c688ac45bf1900",
		"final_client_sig":        "3044022076e9e67c7f183a7bd0a413988dbd764214860ca265d326adef2db92f0de40b5202200c40bb973bfd0cb57dd2f5866195dd7996b582fd3385aa22d8d09c946457de7241",
		"final_server_sig":        "30450221009cafbdf540418b0ffc58f28c6ad511af23030084c1b86ee1ca780db92f714f3302206e10f4a1b93d787956bf88b7158c20250127e06f9d91fd556ca09fa6db9221ce41",
		"final_tx":                "0100000001de468f3b75f979273edcadcd4a84d47ad46e48eaac6f2e759a35d4cd136e0c040000000092004830450221009cafbdf540418b0ffc58f28c6ad511af23030084c1b86ee1ca780db92f714f3302206e10f4a1b93d787956bf88b7158c20250127e06f9d91fd556ca09fa6db9221ce41473044022076e9e67c7f183a7bd0a413988dbd764214860ca265d326adef2db92f0de40b5202200c40bb973bfd0cb57dd2f5866195dd7996b582fd3385aa22d8d09c946457de7241ffffffff02dc050000000000001976a91419c50751f7e477d98ec0189cdfa0967808a2a1e388ac3c1f0300000000001976a914e803a69218895a1a8d3df0f33a5b3d95bbb5a9c688acffffffff",
	}
)

func assertEqual(name, expected, actual string) bool {
	if expected == actual {
		fmt.Printf("✅ %s: PASS\n", name)
		return true
	} else {
		fmt.Printf("❌ %s: FAIL\n", name)
		fmt.Printf("   Expected: %s\n", expected)
		fmt.Printf("   Actual:   %s\n", actual)
		return false
	}
}

func main() {
	fmt.Println("=== Offline Dual Fee Pool Test ===")
	fmt.Println("Testing with fixed UTXO and expected results")
	fmt.Println()

	// 初始化私钥
	clientPriv, err := ec.PrivateKeyFromHex(CLIENT_PRIV_HEX)
	if err != nil {
		log.Fatalf("Invalid client private key: %v", err)
	}

	serverPriv, err := ec.PrivateKeyFromHex(SERVER_PRIV_HEX)
	if err != nil {
		log.Fatalf("Invalid server private key: %v", err)
	}

	// 获取地址
	clientAddress, _ := libs.GetAddressFromPublicKey(clientPriv.PubKey(), false)
	serverAddress, _ := libs.GetAddressFromPublicKey(serverPriv.PubKey(), false)

	fmt.Printf("Client Address: %s\n", clientAddress.AddressString)
	fmt.Printf("Server Address: %s\n", serverAddress.AddressString)
	fmt.Printf("Fixed UTXO: %s:%d (%d satoshis)\n", FIXED_UTXO.TxID, FIXED_UTXO.Vout, FIXED_UTXO.Value)
	fmt.Println()

	// Step 1: 创建基础多签交易
	fmt.Println("=== Step 1: Base Transaction ===")
	clientUTXOs := []libs.UTXO{FIXED_UTXO}
	// compute feepoolAmount from inputs - keep small buffer for fees
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

	fmt.Printf("Step1 Transaction: %s\n", res1.Tx.String())
	fmt.Printf("Step1 Amount: %d\n", res1.Amount)

	// Step 2: 客户端签名花费交易
	fmt.Println("\n=== Step 2: Client Spend Transaction ===")
	const serverAmount uint64 = 1000

	bTx, clientSignBytes, clientAmount, err := ce.BuildDualFeePoolSpendTX(
		res1.Tx, res1.Amount, serverAmount, END_HEIGHT, clientPriv, serverPriv.PubKey(), false, FEE_RATE)
	if err != nil {
		log.Fatalf("Step 2 failed: %v", err)
	}

	fmt.Printf("Step2 Client Signature: %x\n", *clientSignBytes)
	fmt.Printf("Step2 Client Amount: %d\n", clientAmount)

	// Step 3: 服务器签名
	fmt.Println("\n=== Step 3: Server Sign ===")
	serverSignBytes, err := ce.SpendTXServerSign(bTx, res1.Amount, serverPriv, clientPriv.PubKey())
	if err != nil {
		log.Fatalf("Step 3 failed: %v", err)
	}

	fmt.Printf("Step3 Server Signature: %x\n", *serverSignBytes)

	// 组合签名创建完整交易
	signs := [][]byte{*serverSignBytes, *clientSignBytes}
	unlockScript, err := libs.BuildSignScript(&signs)
	if err != nil {
		log.Fatalf("Failed to build unlock script: %v", err)
	}
	bTx.Inputs[0].UnlockingScript = unlockScript

	fmt.Printf("Step3 Complete Transaction: %s\n", bTx.String())

	// Step 4: 客户端更新签名
	fmt.Println("\n=== Step 4: Client Update Sign ===")
	const newServerAmount uint64 = 1500
	const newSequenceNumber uint32 = 2

	updatedTx, err := ce.LoadTx(bTx.String(), nil, newSequenceNumber, newServerAmount,
		serverPriv.PubKey(), clientPriv.PubKey(), res1.Amount)
	if err != nil {
		log.Fatalf("Step 4 load tx failed: %v", err)
	}

	clientUpdateSignBytes, err := ce.ClientDualFeePoolSpendTXUpdateSign(updatedTx, clientPriv, serverPriv.PubKey())
	if err != nil {
		log.Fatalf("Step 4 client sign failed: %v", err)
	}

	fmt.Printf("Step4 Client Update Signature: %x\n", *clientUpdateSignBytes)

	// Step 5: 服务器更新签名
	fmt.Println("\n=== Step 5: Server Update Sign ===")
	serverUpdateSignBytes, err := ce.ServerDualFeePoolSpendTXUpdateSign(updatedTx, serverPriv, clientPriv.PubKey())
	if err != nil {
		log.Fatalf("Step 5 failed: %v", err)
	}

	fmt.Printf("Step5 Server Update Signature: %x\n", *serverUpdateSignBytes)

	// 组合更新后的签名
	updateSigns := [][]byte{*serverUpdateSignBytes, *clientUpdateSignBytes}
	updateUnlockScript, err := libs.BuildSignScript(&updateSigns)
	if err != nil {
		log.Fatalf("Failed to build update unlock script: %v", err)
	}
	updatedTx.Inputs[0].UnlockingScript = updateUnlockScript

	fmt.Printf("Step5 Complete Transaction: %s\n", updatedTx.String())

	// 最终步骤：关闭费用池
	fmt.Println("\n=== Final Step: Close Fee Pool ===")
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

	fmt.Printf("Final Client Signature: %x\n", *clientFinalSignBytes)

	// 服务器最终签名
	serverFinalSignBytes, err := ce.ServerDualFeePoolSpendTXUpdateSign(finalTx, serverPriv, clientPriv.PubKey())
	if err != nil {
		log.Fatalf("Final server sign failed: %v", err)
	}

	fmt.Printf("Final Server Signature: %x\n", *serverFinalSignBytes)

	// 组合最终签名
	finalSigns := [][]byte{*serverFinalSignBytes, *clientFinalSignBytes}
	finalUnlockScript, err := libs.BuildSignScript(&finalSigns)
	if err != nil {
		log.Fatalf("Failed to build final unlock script: %v", err)
	}
	finalTx.Inputs[0].UnlockingScript = finalUnlockScript

	fmt.Printf("Final Transaction: %s\n", finalTx.String())

	// Transaction Summary
	fmt.Println("\nTransaction Summary:")
	fmt.Printf("Base TX ID:    %s\n", res1.Tx.TxID())
	fmt.Printf("Spend TX ID:   %s\n", bTx.TxID())
	fmt.Printf("Updated TX ID: %s\n", updatedTx.TxID())
	fmt.Printf("Final TX ID:   %s\n", finalTx.TxID())
	fmt.Printf("\nFinal Distribution:")
	fmt.Printf("Server Amount: %d satoshis\n", newServerAmount)
	fmt.Printf("Client Amount: %d satoshis\n", res1.Amount-newServerAmount)
}
