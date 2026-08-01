package triple_endpoint

import (
	"bytes"
	"fmt"
	"math"
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
	if err := VerifyTriplePoolState(state, serverKey.PubKey(), aKey.PubKey(), bKey.PubKey(), 10000, 0); err != nil {
		t.Fatalf("canonical state verification failed: %v", err)
	}
	if err := VerifyTriplePoolStateWithFee(state, serverKey.PubKey(), aKey.PubKey(), bKey.PubKey(), 10000, 0, 1); err != nil {
		t.Fatalf("canonical fee verification failed: %v", err)
	}
	state.Outputs[1].Satoshis--
	if err := VerifyTriplePoolStateWithFee(state, serverKey.PubKey(), aKey.PubKey(), bKey.PubKey(), 10000, 0, 1); err == nil {
		t.Fatal("fee-tampered state was accepted")
	}
	if _, err := SignTriplePoolAsServer(state, aKey, aKey.PubKey(), bKey.PubKey()); err == nil {
		t.Fatal("wrong private key was accepted for server slot")
	}
	if _, err := SignTriplePoolAsA(state, serverKey, serverKey.PubKey(), bKey.PubKey()); err == nil {
		t.Fatal("wrong private key was accepted for A slot")
	}
	if _, err := SignTriplePoolAsB(state, serverKey, serverKey.PubKey(), aKey.PubKey()); err == nil {
		t.Fatal("wrong private key was accepted for B slot")
	}
}

func TestBuildTriplePoolStateRejectsMalformedPreviousState(t *testing.T) {
	serverKey := mustTestPrivateKey(t, 1)
	aKey := mustTestPrivateKey(t, 2)
	bKey := mustTestPrivateKey(t, 3)
	if _, err := BuildTriplePoolState(TriplePoolStateInput{PreviousRawTx: []byte{1, 2, 3}, PoolAmount: 100, Server: serverKey.PubKey(), A: aKey.PubKey(), B: bKey.PubKey(), FeeRate: 1}); err == nil {
		t.Fatal("malformed previous state was accepted")
	}
	if _, err := TriplePoolFeeSat(-1, 1); err == nil {
		t.Fatal("negative transaction size was accepted")
	}
	feeCases := []struct {
		size int
		rate FeeSatPerKB
		want uint64
	}{
		{size: 0, rate: 1, want: 0},
		{size: 1, rate: 1, want: 1},
		{size: 1000, rate: 1, want: 1},
		{size: 1001, rate: 1, want: 2},
	}
	for _, tc := range feeCases {
		got, err := TriplePoolFeeSat(tc.size, tc.rate)
		if err != nil || got != tc.want {
			t.Fatalf("fee(%d,%d) = %d, %v; want %d", tc.size, tc.rate, got, err, tc.want)
		}
	}
	if _, err := TriplePoolFeeSat(math.MaxInt, 2); err == nil {
		t.Fatal("fee overflow was accepted")
	}
	state, err := BuildTriplePoolOpeningState(TriplePoolOpeningInput{
		FundingTxID: bytes.Repeat([]byte{8}, 32), PoolOutputIndex: 0, PoolAmount: 10000,
		LockTime: 123, Server: serverKey.PubKey(), A: aKey.PubKey(), B: bKey.PubKey(), FeeRate: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := BuildTriplePoolState(TriplePoolStateInput{
		PreviousRawTx: state.Bytes(), Sequence: state.Inputs[0].SequenceNumber,
		SellerAmount: 1, PoolAmount: 10000, Server: serverKey.PubKey(),
		A: aKey.PubKey(), B: bKey.PubKey(), FeeRate: 1,
	}); err == nil {
		t.Fatal("non-increasing payment sequence was accepted")
	}
	if _, err := SignTriplePoolAsServer(state, bKey, aKey.PubKey(), serverKey.PubKey()); err == nil {
		t.Fatal("private key outside the server slot was accepted")
	}
	serverSig, err := SignTriplePoolAsServer(state, serverKey, aKey.PubKey(), bKey.PubKey())
	if err != nil {
		t.Fatal(err)
	}
	aSig, err := SignTriplePoolAsA(state, aKey, serverKey.PubKey(), bKey.PubKey())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := MergeTriplePoolServerA(state.Hex(), serverSig, serverSig); err == nil {
		t.Fatal("duplicate signatures were accepted")
	}
	bSig, err := SignTriplePoolAsB(state, bKey, serverKey.PubKey(), aKey.PubKey())
	if err != nil {
		t.Fatal(err)
	}
	reversed, err := MergeTriplePoolServerB(state.Hex(), bSig, serverSig)
	if err != nil {
		t.Fatal(err)
	}
	reversed.Inputs[0].SetSourceTxOutput(state.Inputs[0].SourceTxOutput())
	if ok, _ := VerifyTriplePoolServerSignature(reversed, serverKey.PubKey(), aKey.PubKey(), bKey.PubKey(), bSig); ok {
		t.Fatal("reversed server+B signature order passed server verification")
	}
	if _, err := MergeTriplePoolServerB(state.Hex(), serverSig, bSig); err != nil {
		t.Fatalf("server+B merge failed: %v", err)
	}
	if _, err := MergeTriplePoolServerA(state.Hex(), serverSig, aSig); err != nil {
		t.Fatalf("server+A merge failed: %v", err)
	}
	if _, err := MergeTriplePoolServerAWithRoles(state.Hex(), aSig, serverSig, serverKey.PubKey(), aKey.PubKey(), bKey.PubKey(), 10000); err == nil {
		t.Fatal("role-swapped server+A signatures were accepted")
	}
	if _, err := MergeTriplePoolServerBWithRoles(state.Hex(), bSig, serverSig, serverKey.PubKey(), aKey.PubKey(), bKey.PubKey(), 10000); err == nil {
		t.Fatal("role-swapped server+B signatures were accepted")
	}
	if _, err := MergeTriplePoolServerAWithRoles(state.Hex(), serverSig, aSig, serverKey.PubKey(), aKey.PubKey(), bKey.PubKey(), 10000); err != nil {
		t.Fatalf("role-checked server+A merge failed: %v", err)
	}
	if _, err := MergeTriplePoolServerBWithRoles(state.Hex(), serverSig, bSig, serverKey.PubKey(), aKey.PubKey(), bKey.PubKey(), 10000); err != nil {
		t.Fatalf("role-checked server+B merge failed: %v", err)
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
