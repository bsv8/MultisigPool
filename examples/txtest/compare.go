package main

import (
	"bytes"
	"fmt"
	"os/exec"
	"regexp"
)

// matches Step1Hex, Step2Hex, Step3Hex, Step4Hex, Step5Hex
var stepRegexp = regexp.MustCompile(`Step([12345])Hex\s+([0-9a-fA-F]+)`)

func capture(cmd *exec.Cmd) ([]string, error) {
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("%v: %s", err, out.String())
	}

	matches := stepRegexp.FindAllSubmatch(out.Bytes(), -1)
	if len(matches) != 5 {
		return nil, fmt.Errorf("expected 5 StepHex outputs, got %d. output=%s", len(matches), out.String())
	}

	return []string{string(matches[0][2]), string(matches[1][2]), string(matches[2][2]), string(matches[3][2]), string(matches[4][2])}, nil
}

func main() {
	goHex, err := capture(exec.Command("go", "run", "go_runner/main.go"))
	if err != nil {
		fmt.Printf("Run go_runner failed: %v\n", err)
		return
	}
	fmt.Println("Go Step1Hex", goHex[0])
	fmt.Println("Go Step2Hex", goHex[1])
	fmt.Println("Go Step3Hex", goHex[2])
	fmt.Println("Go Step4Hex", goHex[3])
	fmt.Println("Go Step5Hex", goHex[4])

	tsHex, err := capture(exec.Command("npx", "tsx", "ts_runner.ts"))
	if err != nil {
		fmt.Printf("Run ts_runner failed: %v\n", err)
		return
	}
	fmt.Println("TS Step1Hex", tsHex[0])
	fmt.Println("TS Step2Hex", tsHex[1])
	fmt.Println("TS Step3Hex", tsHex[2])
	fmt.Println("TS Step4Hex", tsHex[3])
	fmt.Println("TS Step5Hex", tsHex[4])

	pass := true
	for i := 0; i < 5; i++ {
		if goHex[i] != tsHex[i] {
			fmt.Printf("Mismatch at Step%d\n", i+1)
			pass = false
		}
	}
	if pass {
		fmt.Println("PASS: Go and TS transactions are identical")
	} else {
		fmt.Println("FAIL: Transactions differ")
	}
}
