package main

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

var fields = []string{"LockHex", "StateHex", "BuyerSignatureHex", "SellerSignatureHex", "ArbiterSignatureHex", "FinalBuyerSellerHex", "FinalBuyerArbiterHex", "FinalSellerArbiterHex"}

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
	for _, line := range strings.Split(output, "\n") {
		parts := strings.SplitN(strings.TrimSpace(line), " ", 2)
		if len(parts) == 2 {
			for _, field := range fields {
				if parts[0] == field {
					values[field] = parts[1]
				}
			}
		}
	}
	for _, field := range fields {
		if values[field] == "" {
			return nil, fmt.Errorf("missing %s", field)
		}
	}
	return values, nil
}

func main() {
	root, err := os.Getwd()
	if err != nil {
		panic(err)
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
	goValues, err := parse(goOutput)
	if err != nil {
		fmt.Fprintln(os.Stderr, "Go output:", err)
		os.Exit(1)
	}
	tsValues, err := parse(tsOutput)
	if err != nil {
		fmt.Fprintln(os.Stderr, "TypeScript output:", err)
		os.Exit(1)
	}
	for _, field := range fields {
		if goValues[field] != tsValues[field] {
			fmt.Fprintf(os.Stderr, "mismatch %s\nGo: %s\nTS: %s\n", field, goValues[field], tsValues[field])
			os.Exit(1)
		}
		fmt.Printf("MATCH %s\n", field)
	}
	fmt.Println("PASS: Go and TypeScript bytes are identical")
}
