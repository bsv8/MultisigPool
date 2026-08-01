package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

var fields = []string{"LockHex", "FundingHex", "FundingTxID", "OpeningStateHex", "OpeningStateTxID", "NegotiationStateHex", "NegotiationStateTxID", "PaidArbiterStateHex", "PaidArbiterStateTxID", "ProofStateHex", "ProofStateTxID", "BuyerSignatureHex", "SellerSignatureHex", "ArbiterSignatureHex", "FinalBuyerSellerHex", "FinalBuyerArbiterHex", "FinalSellerArbiterHex"}

var fixtureFields = map[string]string{
	"LockHex": "lockHex", "FundingHex": "fundingHex", "FundingTxID": "fundingTxId", "OpeningStateHex": "openingStateHex", "OpeningStateTxID": "openingStateTxId",
	"NegotiationStateHex": "negotiationStateHex", "NegotiationStateTxID": "negotiationStateTxId", "PaidArbiterStateHex": "paidArbiterStateHex", "PaidArbiterStateTxID": "paidArbiterStateTxId",
	"ProofStateHex": "proofStateHex", "ProofStateTxID": "proofStateTxId", "BuyerSignatureHex": "buyerSignatureHex", "SellerSignatureHex": "sellerSignatureHex", "ArbiterSignatureHex": "arbiterSignatureHex",
	"FinalBuyerSellerHex": "finalBuyerSellerHex", "FinalBuyerArbiterHex": "finalBuyerArbiterHex", "FinalSellerArbiterHex": "finalSellerArbiterHex",
}

func run(root string, name string, args ...string) (string, error) {
	cmd := exec.Command(name, args...)
	cmd.Dir = root
	var output bytes.Buffer
	cmd.Stdout = &output
	cmd.Stderr = &output
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("%s failed: %w\n%s", name, err, output.String())
	}
	return output.String(), nil
}

func parse(output string) (map[string]string, error) {
	values := make(map[string]string, len(fields))
	known := make(map[string]bool, len(fields))
	for _, line := range strings.Split(output, "\n") {
		parts := strings.SplitN(strings.TrimSpace(line), " ", 2)
		if len(parts) != 2 {
			continue
		}
		for _, field := range fields {
			if parts[0] == field {
				if known[field] {
					return nil, fmt.Errorf("duplicate %s", field)
				}
				if parts[1] == "" || !isHex(parts[1]) {
					return nil, fmt.Errorf("invalid hex for %s", field)
				}
				known[field] = true
				values[field] = parts[1]
			}
		}
	}
	for _, field := range fields {
		if !known[field] {
			return nil, fmt.Errorf("missing %s", field)
		}
	}
	return values, nil
}

func isHex(value string) bool {
	if len(value)%2 != 0 {
		return false
	}
	for _, char := range value {
		if !(char >= '0' && char <= '9' || char >= 'a' && char <= 'f' || char >= 'A' && char <= 'F') {
			return false
		}
	}
	return true
}

func main() {
	root, err := os.Getwd()
	if err != nil {
		fmt.Fprintln(os.Stderr, "failed to resolve repository root:", err)
		os.Exit(1)
	}
	fixtureBytes, err := os.ReadFile(filepath.Join(root, "testdata", "arbitrated_pool_v4_fixture.json"))
	if err != nil {
		fmt.Fprintln(os.Stderr, "failed to read shared fixture:", err)
		os.Exit(1)
	}
	var fixture map[string]json.RawMessage
	if err := json.Unmarshal(fixtureBytes, &fixture); err != nil {
		fmt.Fprintln(os.Stderr, "failed to parse shared fixture:", err)
		os.Exit(1)
	}
	goOutput, err := run(root, "go", "run", filepath.Join("examples", "arbitrated_pool_compare", "go_runner", "main.go"))
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	tsOutput, err := run(root, "npx", "tsx", filepath.Join("examples", "arbitrated_pool_compare", "ts_runner.ts"))
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	rustOutput, err := run(root, "cargo", "run", "--manifest-path", "rust/Cargo.toml", "--example", "arbitrated_pool_compare")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	outputs := []struct{ name, value string }{{"Go", goOutput}, {"TypeScript", tsOutput}, {"Rust", rustOutput}}
	parsed := make([]map[string]string, len(outputs))
	for index, value := range outputs {
		parsed[index], err = parse(value.value)
		if err != nil {
			fmt.Fprintf(os.Stderr, "%s output: %v\n", value.name, err)
			os.Exit(1)
		}
	}
	for _, field := range fields {
		fixtureKey := fixtureFields[field]
		var fixtureValue string
		if raw, ok := fixture[fixtureKey]; !ok || json.Unmarshal(raw, &fixtureValue) != nil || !isHex(fixtureValue) {
			fmt.Fprintf(os.Stderr, "fixture is missing or has invalid %s\n", fixtureKey)
			os.Exit(1)
		}
		if parsed[0][field] != fixtureValue {
			fmt.Fprintf(os.Stderr, "Go output does not match fixture %s\nfixture: %s\nactual: %s\n", field, fixtureValue, parsed[0][field])
			os.Exit(1)
		}
		for index := 1; index < len(parsed); index++ {
			if parsed[0][field] != parsed[index][field] {
				fmt.Fprintf(os.Stderr, "mismatch %s\nGo: %s\n%s: %s\n", field, parsed[0][field], outputs[index].name, parsed[index][field])
				os.Exit(1)
			}
		}
		fmt.Printf("MATCH %s\n", field)
	}
	fmt.Println("PASS: TypeScript, Go, and Rust bytes are identical")
}
