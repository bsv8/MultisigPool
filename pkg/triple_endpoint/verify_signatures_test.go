package triple_endpoint

import (
	"testing"

	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
	tx "github.com/bsv-blockchain/go-sdk/transaction"
	sighash "github.com/bsv-blockchain/go-sdk/transaction/sighash"

	multisig "github.com/bsv8/MultisigPool/pkg/libs"
)

func TestTripleVerifySignatures(t *testing.T) {
	aPriv, _ := ec.PrivateKeyFromHex("2796e78fad7d383fa5236607eba52d9a1904325daf9b4da3d77be5ad15ab1dae")
	bPriv, _ := ec.PrivateKeyFromHex("a682814ac246ca65543197e593aa3b2633b891959c183416f54e2c63a8de1d8c")
	sPriv, _ := ec.PrivateKeyFromHex("e6d4d7685894d2644d1f4bf31c0b87f3f6aa8a3d7d4091eaa375e81d6c9f9091")

	poolValue := uint64(20000)

	txx := tx.NewTransaction()
	_ = txx.AddInputFrom(
		"00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
		0,
		"",
		poolValue,
		nil,
	)

	redeem, err := multisig.Lock([]*ec.PublicKey{sPriv.PubKey(), aPriv.PubKey(), bPriv.PubKey()}, 2)
	if err != nil {
		t.Fatalf("build redeem script: %v", err)
	}
	txx.Inputs[0].SetSourceTxOutput(&tx.TransactionOutput{Satoshis: poolValue, LockingScript: redeem})

	aSig, err := SpendTXTripleFeePoolASign(txx, poolValue, sPriv.PubKey(), aPriv, bPriv.PubKey())
	if err != nil {
		t.Fatalf("a sign: %v", err)
	}

	bSig, err := SpendTXTripleFeePoolBSign(txx, poolValue, sPriv.PubKey(), aPriv.PubKey(), bPriv)
	if err != nil {
		t.Fatalf("b sign: %v", err)
	}

	sigHash := sighash.Flag(sighash.ForkID | sighash.All)
	serverUnlock, err := multisig.Unlock([]*ec.PrivateKey{sPriv}, []*ec.PublicKey{sPriv.PubKey(), aPriv.PubKey(), bPriv.PubKey()}, 2, &sigHash)
	if err != nil {
		t.Fatalf("server unlock: %v", err)
	}
	serverSig, err := serverUnlock.SignOne(txx, 0, sPriv)
	if err != nil {
		t.Fatalf("server sign: %v", err)
	}

	ok, err := ServerVerifyClientASig(txx, poolValue, sPriv.PubKey(), aPriv.PubKey(), bPriv.PubKey(), aSig)
	if err != nil || !ok {
		t.Fatalf("server verify client A failed: %v", err)
	}

	ok, err = ServerVerifyClientBSig(txx, poolValue, sPriv.PubKey(), aPriv.PubKey(), bPriv.PubKey(), bSig)
	if err != nil || !ok {
		t.Fatalf("server verify client B failed: %v", err)
	}

	ok, err = ClientVerifyServerSig(txx, poolValue, sPriv.PubKey(), aPriv.PubKey(), bPriv.PubKey(), serverSig)
	if err != nil || !ok {
		t.Fatalf("client verify server failed: %v", err)
	}
}
