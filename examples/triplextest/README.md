# Triple-Endpoint Cross Test (`examples/triplextest`)

This integration test proves the **Go** implementation of the *triple-endpoint fee-pool* flow is internally consistent before porting to TypeScript.

Steps generated:

1. **Step 1** – Client funds a 2-of-3 multisig (client, server, escrow).
2. **Step 2** – Client builds a spend tx paying itself & server, attaches its signature.
3. **Step 3** – Server adds its signature → final tx ready for broadcast.

## Files
| File | Role |
| ---- | ---- |
| `fixture.json` | Input: hex privkeys, UTXO, fee, etc. |
| `go_runner/main.go` | Orchestrates the 3 steps and prints their hex. |

## Usage
```bash
# deps installed (go 1.20+)
cd examples/triplextest

go run go_runner/main.go
```

Replace placeholder values in `fixture.json` with real ones before running. After execution you will get:

* `Step1 - Hex`
* `Step2 (unsigned) - Hex`
* `Step3 - Final Hex` – broadcast-ready
* NEW_UTXO json (client p2pkh output for next tests)

Validate `Step3` on-chain; once confirmed correct we can replicate the same flow in TypeScript and add a Go↔TS comparator like `txtest`.
