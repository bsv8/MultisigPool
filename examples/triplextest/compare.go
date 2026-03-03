package main

import (
	"bytes"
	"fmt"
	"os/exec"
	"regexp"
)

var step1Regexp = regexp.MustCompile(`Step1(?:\s*-)?\s*Hex[:\s]*([0-9a-fA-F]+)`)      // matches Step1 only
var clientSigRegexp = regexp.MustCompile(`ClientSig[:\s]*([0-9a-fA-F]+)`)             // matches ClientSig
var serverSigRegexp = regexp.MustCompile(`ServerSig[:\s]*([0-9a-fA-F]+)`)             // matches ServerSig
var clientUpdateSigRegexp = regexp.MustCompile(`ClientUpdateSig[:\s]*([0-9a-fA-F]+)`) // matches ClientUpdateSig
var serverUpdateSigRegexp = regexp.MustCompile(`ServerUpdateSig[:\s]*([0-9a-fA-F]+)`) // matches ServerUpdateSig

func capture(cmd *exec.Cmd) (string, string, string, string, string, error) {
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	if err := cmd.Run(); err != nil {
		return "", "", "", "", "", fmt.Errorf("%v: %s", err, out.String())
	}

	output := out.String()

	// Capture Step1 hex
	step1Match := step1Regexp.FindSubmatch(out.Bytes())
	if step1Match == nil {
		return "", "", "", "", "", fmt.Errorf("Step1Hex not found in output: %s", output)
	}
	step1Hex := string(step1Match[1])

	// Capture ClientSig
	clientSigMatch := clientSigRegexp.FindSubmatch(out.Bytes())
	if clientSigMatch == nil {
		return "", "", "", "", "", fmt.Errorf("ClientSig not found in output: %s", output)
	}
	clientSig := string(clientSigMatch[1])

	// Capture ServerSig
	serverSigMatch := serverSigRegexp.FindSubmatch(out.Bytes())
	if serverSigMatch == nil {
		return "", "", "", "", "", fmt.Errorf("ServerSig not found in output: %s", output)
	}
	serverSig := string(serverSigMatch[1])

	// Capture ClientUpdateSig
	clientUpdateSigMatch := clientUpdateSigRegexp.FindSubmatch(out.Bytes())
	if clientUpdateSigMatch == nil {
		return "", "", "", "", "", fmt.Errorf("ClientUpdateSig not found in output: %s", output)
	}
	clientUpdateSig := string(clientUpdateSigMatch[1])

	// Capture ServerUpdateSig
	serverUpdateSigMatch := serverUpdateSigRegexp.FindSubmatch(out.Bytes())
	if serverUpdateSigMatch == nil {
		return "", "", "", "", "", fmt.Errorf("ServerUpdateSig not found in output: %s", output)
	}
	serverUpdateSig := string(serverUpdateSigMatch[1])

	return step1Hex, clientSig, serverSig, clientUpdateSig, serverUpdateSig, nil
}

func main() {
	fmt.Println("=== Triple Endpoint Cross-Comparison ===")
	fmt.Println()

	goStep1, goClientSig, goServerSig, goClientUpdateSig, goServerUpdateSig, err := capture(exec.Command("go", "run", "examples/triplextest/go_runner/main.go"))
	if err != nil {
		fmt.Printf("❌ Go runner failed: %v\n", err)
		return
	}

	tsStep1, tsClientSig, tsServerSig, tsClientUpdateSig, tsServerUpdateSig, err := capture(exec.Command("npx", "tsx", "examples/triplextest/ts_runner_refactor.ts"))
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

	// Compare ClientSig (Step2)
	fmt.Printf("🔸 Step2 Client Signature:\n")
	fmt.Printf("  Go: %s\n", goClientSig)
	fmt.Printf("  TS: %s\n", tsClientSig)
	if goClientSig == tsClientSig {
		fmt.Printf("  ✅ MATCH\n")
	} else {
		fmt.Printf("  ❌ MISMATCH\n")
		pass = false
	}
	fmt.Println()

	// Compare ServerSig (Step3)
	fmt.Printf("🔸 Step3 Server Signature:\n")
	fmt.Printf("  Go: %s\n", goServerSig)
	fmt.Printf("  TS: %s\n", tsServerSig)
	if goServerSig == tsServerSig {
		fmt.Printf("  ✅ MATCH\n")
	} else {
		fmt.Printf("  ❌ MISMATCH\n")
		pass = false
	}
	fmt.Println()

	// Compare ClientUpdateSig (Step4)
	fmt.Printf("🔸 Step4 Client Update Signature:\n")
	fmt.Printf("  Go: %s\n", goClientUpdateSig)
	fmt.Printf("  TS: %s\n", tsClientUpdateSig)
	if goClientUpdateSig == tsClientUpdateSig {
		fmt.Printf("  ✅ MATCH\n")
	} else {
		fmt.Printf("  ❌ MISMATCH\n")
		pass = false
	}
	fmt.Println()

	// Compare ServerUpdateSig (Step5)
	fmt.Printf("🔸 Step5 Server Update Signature:\n")
	fmt.Printf("  Go: %s\n", goServerUpdateSig)
	fmt.Printf("  TS: %s\n", tsServerUpdateSig)
	if goServerUpdateSig == tsServerUpdateSig {
		fmt.Printf("  ✅ MATCH\n")
	} else {
		fmt.Printf("  ❌ MISMATCH\n")
		pass = false
	}
	fmt.Println()

	// Final result
	fmt.Println("=== Final Result ===")
	if pass {
		fmt.Println("🎉 PASS: All 5 steps comparison successful!")
	} else {
		fmt.Println("💥 FAIL: One or more comparisons failed")
	}
}
