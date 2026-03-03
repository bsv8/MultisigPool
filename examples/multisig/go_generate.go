package main

import (
	"encoding/hex"
	"encoding/json"
	"os"

	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"

	km "github.com/bsv8/MultisigPool/pkg/libs"
)

type output struct {
	PubKeys    []string `json:"pub_keys"`
	M          int      `json:"m"`
	LockScript string   `json:"lock_script"`
	FakeUnlock string   `json:"fake_unlock"`
}

func mustPriv(hexStr string) *ec.PrivateKey {
	buf, _ := hex.DecodeString(hexStr)
	key, _ := ec.PrivateKeyFromBytes(buf)
	return key
}

func main() {
	// Deterministic test keys (32-byte private keys)
	privHex := []string{
		"0101010101010101010101010101010101010101010101010101010101010101",
		"0202020202020202020202020202020202020202020202020202020202020202",
		"0303030303030303030303030303030303030303030303030303030303030303",
	}
	privs := make([]*ec.PrivateKey, len(privHex))
	pubs := make([]*ec.PublicKey, len(privHex))
	pubHex := make([]string, len(privHex))
	for i, h := range privHex {
		privs[i] = mustPriv(h)
		pubs[i] = privs[i].PubKey()
		pubHex[i] = hex.EncodeToString(pubs[i].Compressed())
	}

	m := 2
	// Build locking script
	lock, err := km.Lock(pubs, m)
	if err != nil {
		panic(err)
	}

	// Build fake unlock for estimating size
	fake, err := km.FakeSign(uint32(m))
	if err != nil {
		panic(err)
	}

	out := output{
		PubKeys:    pubHex,
		M:          m,
		LockScript: hex.EncodeToString(lock.Bytes()),
		FakeUnlock: hex.EncodeToString(fake.Bytes()),
	}

	enc := json.NewEncoder(os.Stdout)
	if err := enc.Encode(out); err != nil {
		panic(err)
	}
}
