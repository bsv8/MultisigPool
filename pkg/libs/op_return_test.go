package libs

import (
	"bytes"
	"testing"

	"github.com/bsv-blockchain/go-sdk/script"
)

func extractPayloadFromOpReturnForTest(t *testing.T, lockingScript *script.Script) []byte {
	t.Helper()

	if lockingScript == nil {
		t.Fatalf("lockingScript is nil")
	}
	ops, err := lockingScript.ParseOps()
	if err != nil {
		t.Fatalf("ParseOps() error = %v", err)
	}
	if len(ops) < 3 {
		t.Fatalf("unexpected ops count = %d", len(ops))
	}
	if ops[0].Op != script.OpFALSE || ops[1].Op != script.OpRETURN {
		t.Fatalf("unexpected op_return prefix: %v %v", ops[0].Op, ops[1].Op)
	}

	payload := make([]byte, 0, len(lockingScript.Bytes()))
	for _, op := range ops[2:] {
		payload = append(payload, op.Data...)
	}
	return payload
}

func TestBuildOptionalOpReturnScript(t *testing.T) {
	t.Run("empty payload keeps legacy behavior", func(t *testing.T) {
		got, err := BuildOptionalOpReturnScript(nil)
		if err != nil {
			t.Fatalf("BuildOptionalOpReturnScript(nil) error = %v", err)
		}
		if got != nil {
			t.Fatalf("BuildOptionalOpReturnScript(nil) = %v, want nil", got)
		}
	})

	t.Run("binary payload preserved", func(t *testing.T) {
		want := []byte{0x00, 0x01, 0xff, 0x10, 0x70, 0x80}
		got, err := BuildOptionalOpReturnScript(want)
		if err != nil {
			t.Fatalf("BuildOptionalOpReturnScript() error = %v", err)
		}
		if got == nil {
			t.Fatalf("BuildOptionalOpReturnScript() = nil, want script")
		}

		payload := extractPayloadFromOpReturnForTest(t, got)
		if !bytes.Equal(payload, want) {
			t.Fatalf("payload = %x, want %x", payload, want)
		}
	})
}
