package main

import (
	"bytes"
	"fmt"
	"os/exec"
	"regexp"
)

var step1Regexp = regexp.MustCompile(`Step1(?:\s*-)?\s*Hex[:\s]*([0-9a-fA-F]+)`)
var buyerSigRegexp = regexp.MustCompile(`BuyerSig[:\s]*([0-9a-fA-F]+)`)
var sellerSigRegexp = regexp.MustCompile(`SellerSig[:\s]*([0-9a-fA-F]+)`)
var arbitrationTxRegexp = regexp.MustCompile(`ArbitrationTxHex[:\s]*([0-9a-fA-F]+)`)
var arbiterSigRegexp = regexp.MustCompile(`ArbiterSig[:\s]*([0-9a-fA-F]+)`)
var sellerArbSigRegexp = regexp.MustCompile(`SellerArbSig[:\s]*([0-9a-fA-F]+)`)
var finalArbHexRegexp = regexp.MustCompile(`FinalArbitrationHex[:\s]*([0-9a-fA-F]+)`)

func capture(cmd *exec.Cmd) (string, string, string, string, string, string, string, error) {
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	if err := cmd.Run(); err != nil {
		return "", "", "", "", "", "", "", fmt.Errorf("%v: %s", err, out.String())
	}

	output := out.String()

	// Capture Step1 hex
	step1Match := step1Regexp.FindSubmatch(out.Bytes())
	if step1Match == nil {
		return "", "", "", "", "", "", "", fmt.Errorf("Step1Hex not found in output: %s", output)
	}
	step1Hex := string(step1Match[1])

	buyerSigMatch := buyerSigRegexp.FindSubmatch(out.Bytes())
	if buyerSigMatch == nil {
		return "", "", "", "", "", "", "", fmt.Errorf("BuyerSig not found in output: %s", output)
	}
	buyerSig := string(buyerSigMatch[1])

	sellerSigMatch := sellerSigRegexp.FindSubmatch(out.Bytes())
	if sellerSigMatch == nil {
		return "", "", "", "", "", "", "", fmt.Errorf("SellerSig not found in output: %s", output)
	}
	sellerSig := string(sellerSigMatch[1])

	arbitrationTxMatch := arbitrationTxRegexp.FindSubmatch(out.Bytes())
	if arbitrationTxMatch == nil {
		return "", "", "", "", "", "", "", fmt.Errorf("ArbitrationTxHex not found in output: %s", output)
	}
	arbitrationTxHex := string(arbitrationTxMatch[1])

	arbiterSigMatch := arbiterSigRegexp.FindSubmatch(out.Bytes())
	if arbiterSigMatch == nil {
		return "", "", "", "", "", "", "", fmt.Errorf("ArbiterSig not found in output: %s", output)
	}
	arbiterSig := string(arbiterSigMatch[1])

	sellerArbSigMatch := sellerArbSigRegexp.FindSubmatch(out.Bytes())
	if sellerArbSigMatch == nil {
		return "", "", "", "", "", "", "", fmt.Errorf("SellerArbSig not found in output: %s", output)
	}
	sellerArbSig := string(sellerArbSigMatch[1])

	finalArbHexMatch := finalArbHexRegexp.FindSubmatch(out.Bytes())
	if finalArbHexMatch == nil {
		return "", "", "", "", "", "", "", fmt.Errorf("FinalArbitrationHex not found in output: %s", output)
	}
	finalArbHex := string(finalArbHexMatch[1])

	return step1Hex, buyerSig, sellerSig, arbitrationTxHex, arbiterSig, sellerArbSig, finalArbHex, nil
}

func main() {
	fmt.Println("=== Triple Endpoint Cross-Comparison ===")
	fmt.Println()
	goBin := "/home/david/.gvm/gos/go1.26.0/bin/go"

	goStep1, goBuyerSig, goSellerSig, goArbTx, goArbiterSig, goSellerArbSig, goFinalArbHex, err := capture(exec.Command(goBin, "run", "examples/triplextest/go_runner/main.go"))
	if err != nil {
		fmt.Printf("❌ Go runner failed: %v\n", err)
		return
	}

	tsStep1, tsBuyerSig, tsSellerSig, tsArbTx, tsArbiterSig, tsSellerArbSig, tsFinalArbHex, err := capture(exec.Command("npx", "tsx", "examples/triplextest/ts_runner_refactor.ts"))
	if err != nil {
		fmt.Printf("❌ TypeScript runner failed: %v\n", err)
		return
	}

	fmt.Println("📋 Comparison Results:")
	fmt.Println()

	pass := true

	// Compare Step1 transaction hex
	fmt.Printf("🔸 Step1 Transaction Hex:\n")
	fmt.Printf("  Go: %s\n", goStep1)
	fmt.Printf("  TS: %s\n", tsStep1)
	if goStep1 == tsStep1 {
		fmt.Printf("  ✅ MATCH\n")
	} else {
		fmt.Printf("  ❌ MISMATCH\n")
		pass = false
	}
	fmt.Println()

	// Compare BuyerSig (Step2)
	fmt.Printf("🔸 Step2 Buyer Signature:\n")
	fmt.Printf("  Go: %s\n", goBuyerSig)
	fmt.Printf("  TS: %s\n", tsBuyerSig)
	if goBuyerSig == tsBuyerSig {
		fmt.Printf("  ✅ MATCH\n")
	} else {
		fmt.Printf("  ❌ MISMATCH\n")
		pass = false
	}
	fmt.Println()

	// Compare SellerSig (Step3)
	fmt.Printf("🔸 Step3 Seller Signature:\n")
	fmt.Printf("  Go: %s\n", goSellerSig)
	fmt.Printf("  TS: %s\n", tsSellerSig)
	if goSellerSig == tsSellerSig {
		fmt.Printf("  ✅ MATCH\n")
	} else {
		fmt.Printf("  ❌ MISMATCH\n")
		pass = false
	}
	fmt.Println()

	// Compare ArbitrationTxHex (Step4)
	fmt.Printf("🔸 Step4 Arbitration Tx Hex:\n")
	fmt.Printf("  Go: %s\n", goArbTx)
	fmt.Printf("  TS: %s\n", tsArbTx)
	if goArbTx == tsArbTx {
		fmt.Printf("  ✅ MATCH\n")
	} else {
		fmt.Printf("  ❌ MISMATCH\n")
		pass = false
	}
	fmt.Println()

	// Compare ArbiterSig (Step5)
	fmt.Printf("🔸 Step5 Arbiter Signature:\n")
	fmt.Printf("  Go: %s\n", goArbiterSig)
	fmt.Printf("  TS: %s\n", tsArbiterSig)
	if goArbiterSig == tsArbiterSig {
		fmt.Printf("  ✅ MATCH\n")
	} else {
		fmt.Printf("  ❌ MISMATCH\n")
		pass = false
	}
	fmt.Println()

	// Compare SellerArbSig (Step6)
	fmt.Printf("🔸 Step6 Seller Arbitration Signature:\n")
	fmt.Printf("  Go: %s\n", goSellerArbSig)
	fmt.Printf("  TS: %s\n", tsSellerArbSig)
	if goSellerArbSig == tsSellerArbSig {
		fmt.Printf("  ✅ MATCH\n")
	} else {
		fmt.Printf("  ❌ MISMATCH\n")
		pass = false
	}
	fmt.Println()

	// Compare FinalArbitrationHex (Step7)
	fmt.Printf("🔸 Step7 Final Arbitration Tx Hex:\n")
	fmt.Printf("  Go: %s\n", goFinalArbHex)
	fmt.Printf("  TS: %s\n", tsFinalArbHex)
	if goFinalArbHex == tsFinalArbHex {
		fmt.Printf("  ✅ MATCH\n")
	} else {
		fmt.Printf("  ❌ MISMATCH\n")
		pass = false
	}
	fmt.Println()

	// Final result
	fmt.Println("=== Final Result ===")
	if pass {
		fmt.Println("🎉 PASS: All 7 steps comparison successful!")
	} else {
		fmt.Println("💥 FAIL: One or more comparisons failed")
	}
}
