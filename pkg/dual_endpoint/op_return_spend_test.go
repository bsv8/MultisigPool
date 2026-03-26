package chain_utils

import (
	"bytes"
	"testing"

	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
	"github.com/bsv-blockchain/go-sdk/script"
	tx "github.com/bsv-blockchain/go-sdk/transaction"
	libs "github.com/bsv8/MultisigPool/pkg/libs"
)

func extractDualPayloadForTest(t *testing.T, lockingScript *script.Script) []byte {
	t.Helper()

	ops, err := lockingScript.ParseOps()
	if err != nil {
		t.Fatalf("ParseOps() error = %v", err)
	}
	if len(ops) < 3 {
		t.Fatalf("unexpected ops count = %d", len(ops))
	}
	payload := make([]byte, 0, len(lockingScript.Bytes()))
	for _, op := range ops[2:] {
		payload = append(payload, op.Data...)
	}
	return payload
}

func TestDualSpendTxOptionalOpReturn(t *testing.T) {
	clientPriv, _ := ec.PrivateKeyFromHex("903b1b2c396f17203fa83444d72bf5c666119d9d681eb715520f99ae6f92322c")
	serverPriv, _ := ec.PrivateKeyFromHex("a2d2ca4c19e3c560792ca751842c29b9da94be09f712a7f9ba7c66e64a354829")

	t.Run("empty proof keeps legacy outputs", func(t *testing.T) {
		btx, _, err := SubBuildDualFeePoolSpendTXWithProof(
			"00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
			50000,
			100,
			800000,
			clientPriv,
			serverPriv.PubKey(),
			true,
			0.5,
			nil,
		)
		if err != nil {
			t.Fatalf("SubBuildDualFeePoolSpendTXWithProof() error = %v", err)
		}
		if got := len(btx.Outputs); got != 2 {
			t.Fatalf("outputs len = %d, want 2", got)
		}
	})

	t.Run("binary proof appended and preserved", func(t *testing.T) {
		proof := []byte{0x00, 0x01, 0xff, 0x10, 0x70, 0x61, 0x79, 0x80}
		btx, clientSig, _, err := BuildDualFeePoolSpendTXWithProof(
			mustBuildDualBaseTxForProofTest(t, clientPriv, serverPriv),
			99500,
			100,
			800000,
			clientPriv,
			serverPriv.PubKey(),
			false,
			0.5,
			proof,
		)
		if err != nil {
			t.Fatalf("BuildDualFeePoolSpendTXWithProof() error = %v", err)
		}
		if got := len(btx.Outputs); got != 3 {
			t.Fatalf("outputs len = %d, want 3", got)
		}
		if btx.Outputs[2].Satoshis != 0 {
			t.Fatalf("op_return satoshis = %d, want 0", btx.Outputs[2].Satoshis)
		}
		payload := extractDualPayloadForTest(t, btx.Outputs[2].LockingScript)
		if !bytes.Equal(payload, proof) {
			t.Fatalf("payload = %x, want %x", payload, proof)
		}

		ok, err := ServerVerifyClientSpendSig(btx, 99500, serverPriv.PubKey(), clientPriv.PubKey(), clientSig)
		if err != nil || !ok {
			t.Fatalf("ServerVerifyClientSpendSig() error = %v, ok = %v", err, ok)
		}
	})
}

func mustBuildDualBaseTxForProofTest(t *testing.T, clientPriv *ec.PrivateKey, serverPriv *ec.PrivateKey) *tx.Transaction {
	t.Helper()

	utxos := []struct {
		txid  string
		vout  uint32
		value uint64
	}{
		{
			txid:  "0a1fd93f02e68d1a73fb499e948ee83a78aa9337e1476bd89f7092a7ef16a050",
			vout:  1,
			value: 99902,
		},
	}

	kmutxos := make([]libs.UTXO, 0, len(utxos))
	for _, utxo := range utxos {
		kmutxos = append(kmutxos, libs.UTXO{TxID: utxo.txid, Vout: utxo.vout, Value: utxo.value})
	}
	baseResp, err := BuildDualFeePoolBaseTx(&kmutxos, 99500, clientPriv, serverPriv.PubKey(), false, 0.5)
	if err != nil {
		t.Fatalf("BuildDualFeePoolBaseTx() error = %v", err)
	}
	return baseResp.Tx
}
