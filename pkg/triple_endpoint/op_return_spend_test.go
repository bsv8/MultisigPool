package triple_endpoint

import (
	"bytes"
	"testing"

	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
	"github.com/bsv-blockchain/go-sdk/script"
	libs "github.com/bsv8/MultisigPool/pkg/libs"
)

func extractTriplePayloadForTest(t *testing.T, lockingScript *script.Script) []byte {
	t.Helper()

	ops, err := lockingScript.ParseOps()
	if err != nil {
		t.Fatalf("ParseOps() error = %v", err)
	}
	payload := make([]byte, 0, len(lockingScript.Bytes()))
	for _, op := range ops[2:] {
		payload = append(payload, op.Data...)
	}
	return payload
}

func TestTripleSpendTxOptionalOpReturn(t *testing.T) {
	clientPriv, _ := ec.PrivateKeyFromHex("a682814ac246ca65543197e593aa3b2633b891959c183416f54e2c63a8de1d8c")
	serverPriv, _ := ec.PrivateKeyFromHex("903b1b2c396f17203fa83444d72bf5c666119d9d681eb715520f99ae6f92322c")
	escrowPriv, _ := ec.PrivateKeyFromHex("a2d2ca4c19e3c560792ca751842c29b9da94be09f712a7f9ba7c66e64a354829")

	t.Run("empty proof keeps legacy outputs", func(t *testing.T) {
		btx, _, err := SubBuildTripleFeePoolSpendTXWithProof(
			"00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
			20000,
			800000,
			serverPriv.PubKey(),
			clientPriv,
			escrowPriv.PubKey(),
			false,
			1.2,
			nil,
		)
		if err != nil {
			t.Fatalf("SubBuildTripleFeePoolSpendTXWithProof() error = %v", err)
		}
		if got := len(btx.Outputs); got != 2 {
			t.Fatalf("outputs len = %d, want 2", got)
		}
	})

	t.Run("binary proof appended and preserved", func(t *testing.T) {
		proof := []byte{0x00, 0x01, 0xff, 0x10, 0x70, 0x61, 0x79, 0x80}
		baseResp, err := BuildTripleFeePoolBaseTx(&[]libs.UTXO{
			{
				TxID:  "ffcfe296a596f01e5cef2d14f39bc61f55c8f0535a5f723c1b5b043b77053595",
				Vout:  1,
				Value: 19996,
			},
		}, serverPriv.PubKey(), clientPriv, escrowPriv.PubKey(), false, 1.2)
		if err != nil {
			t.Fatalf("BuildTripleFeePoolBaseTx() error = %v", err)
		}

		btx, clientSig, _, err := BuildTripleFeePoolSpendTXWithProof(
			baseResp.Tx,
			baseResp.Amount,
			0,
			serverPriv.PubKey(),
			clientPriv,
			escrowPriv.PubKey(),
			false,
			1.2,
			proof,
		)
		if err != nil {
			t.Fatalf("BuildTripleFeePoolSpendTXWithProof() error = %v", err)
		}
		if got := len(btx.Outputs); got != 3 {
			t.Fatalf("outputs len = %d, want 3", got)
		}
		if btx.Outputs[2].Satoshis != 0 {
			t.Fatalf("op_return satoshis = %d, want 0", btx.Outputs[2].Satoshis)
		}
		payload := extractTriplePayloadForTest(t, btx.Outputs[2].LockingScript)
		if !bytes.Equal(payload, proof) {
			t.Fatalf("payload = %x, want %x", payload, proof)
		}

		ok, err := ServerVerifyClientASig(btx, baseResp.Amount, serverPriv.PubKey(), clientPriv.PubKey(), escrowPriv.PubKey(), clientSig)
		if err != nil || !ok {
			t.Fatalf("ServerVerifyClientASig() error = %v, ok = %v", err, ok)
		}
	})
}
