package triple_endpoint

import (
	"bytes"
	"fmt"
	"testing"

	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
)

func TestBuildTriplePoolOpeningStateUsesServerAOutputs(t *testing.T) {
	// Use deterministic keys without depending on address or network fixtures.
	serverKey := mustTestPrivateKey(t, 1)
	aKey := mustTestPrivateKey(t, 2)
	bKey := mustTestPrivateKey(t, 3)
	state, err := BuildTriplePoolOpeningState(TriplePoolOpeningInput{
		FundingTxID: bytes.Repeat([]byte{7}, 32), PoolOutputIndex: 0, PoolAmount: 10000,
		LockTime: 123, Server: serverKey.PubKey(), A: aKey.PubKey(), B: bKey.PubKey(), FeeRate: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(state.Outputs) != 2 || state.Outputs[0].Satoshis != 0 || state.Outputs[1].Satoshis >= 10000 {
		t.Fatalf("unexpected outputs: %#v", state.Outputs)
	}
	if state.Inputs[0].UnlockingScript == nil || len(state.Inputs[0].UnlockingScript.Bytes()) != 0 {
		t.Fatal("opening state is not empty-unlocking")
	}
	if state.LockTime != 123 || state.Inputs[0].SequenceNumber != 1 {
		t.Fatal("opening state locktime/sequence changed")
	}
}

func mustTestPrivateKey(t *testing.T, value byte) *ec.PrivateKey {
	t.Helper()
	key, err := ec.PrivateKeyFromHex(fmt.Sprintf("%064x", value))
	if err != nil {
		t.Fatal(err)
	}
	return key
}
