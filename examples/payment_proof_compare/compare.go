package main

import (
	"bytes"
	"fmt"
	"os/exec"
	"regexp"
)

var proofRegexp = regexp.MustCompile(`(DualOutputCount|DualProofScriptHex|DualClientAmount|TripleOutputCount|TripleClientAmount):\s*([0-9a-fA-F]+)`)

func capture(cmd *exec.Cmd) (map[string]string, error) {
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("%v: %s", err, out.String())
	}

	matches := proofRegexp.FindAllSubmatch(out.Bytes(), -1)
	result := make(map[string]string, len(matches))
	for _, match := range matches {
		result[string(match[1])] = string(match[2])
	}
	if len(result) != 5 {
		return nil, fmt.Errorf("expected 5 outputs, got %d: %s", len(result), out.String())
	}
	return result, nil
}

func main() {
	goVals, err := capture(exec.Command("go", "run", "go_runner/main.go"))
	if err != nil {
		fmt.Printf("Run go_runner failed: %v\n", err)
		return
	}

	tsVals, err := capture(exec.Command("npx", "tsx", "ts_runner.ts"))
	if err != nil {
		fmt.Printf("Run ts_runner failed: %v\n", err)
		return
	}

	keys := []string{
		"DualOutputCount",
		"DualProofScriptHex",
		"DualClientAmount",
		"TripleOutputCount",
		"TripleClientAmount",
	}
	pass := true
	for _, key := range keys {
		fmt.Printf("%s Go=%s TS=%s\n", key, goVals[key], tsVals[key])
		if goVals[key] != tsVals[key] {
			pass = false
		}
	}
	if pass {
		fmt.Println("PASS: canonical triple pool has no proof output; dual proof remains unchanged")
	} else {
		fmt.Println("FAIL: payment proof outputs differ between Go and TS")
	}
}
