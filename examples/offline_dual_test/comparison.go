package main

import (
	"bufio"
	"fmt"
	"os/exec"
	"strings"
)

func parseOutput(output string) map[string]string {
	results := make(map[string]string)
	scanner := bufio.NewScanner(strings.NewReader(output))

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.Contains(line, ": ") {
			parts := strings.SplitN(line, ": ", 2)
			if len(parts) == 2 {
				key := strings.TrimSpace(parts[0])
				value := strings.TrimSpace(parts[1])
				results[key] = value
			}
		}
	}

	return results
}

func main() {
	fmt.Println("=== Comparing Go and TypeScript Offline Dual Test Outputs ===")

	// Run Go script
	fmt.Println("Running Go script...")
	cmd1 := exec.Command("go", "run", "go_runner/main.go")
	cmd1.Dir = "examples/offline_dual_test"
	output1, err1 := cmd1.CombinedOutput()
	if err1 != nil {
		fmt.Printf("⚠️  Go script exited with error: %v\n", err1)
	}

	// Run TypeScript script
	fmt.Println("Running TypeScript script...")
	cmd2 := exec.Command("npx", "tsx", "main.ts")
	cmd2.Dir = "examples/offline_dual_test"
	output2, err2 := cmd2.CombinedOutput()
	if err2 != nil {
		fmt.Printf("⚠️  TypeScript script exited with error: %v\n", err2)
	}

	// Extract key values from outputs
	goResults := parseOutput(string(output1))
	tsResults := parseOutput(string(output2))

	// Compare each key result
	keys := []string{
		"Step1 Transaction",
		"Step1 Amount",
		"Step2 Client Signature",
		"Step2 Client Amount",
		"Step3 Server Signature",
		"Step3 Complete Transaction",
		"Step4 Client Update Signature",
		"Step5 Server Update Signature",
		"Step5 Complete Transaction",
		"Final Client Signature",
		"Final Server Signature",
		"Final Transaction",
	}

	totalComparisons := 0
	matchingComparisons := 0

	for _, key := range keys {
		totalComparisons++
		goVal, goExists := goResults[key]
		tsVal, tsExists := tsResults[key]

		fmt.Printf("%s:\n", key)

		if !goExists && !tsExists {
			fmt.Printf("   ⚠️  MISSING in both\n")
		} else if !goExists {
			fmt.Printf("   ❌ MISSING in Go, present in TS\n")
		} else if !tsExists {
			fmt.Printf("   ❌ MISSING in TS, present in Go\n")
		} else {
			fmt.Printf("   ts: %s\n", tsVal)
			fmt.Printf("   go: %s\n", goVal)
			if goVal == tsVal {
				fmt.Printf("   ✅ match\n")
				matchingComparisons++
			} else {
				fmt.Printf("   ❌ differ\n")
			}
		}
		fmt.Println()
	}

	fmt.Printf("=== Summary ===\n")
	fmt.Printf("Matching comparisons: %d/%d\n", matchingComparisons, totalComparisons)

	if matchingComparisons == totalComparisons {
		fmt.Println("🎉 ALL COMPARISONS PASSED!")
	} else {
		fmt.Printf("❌ %d comparisons failed\n", totalComparisons-matchingComparisons)
	}
}
