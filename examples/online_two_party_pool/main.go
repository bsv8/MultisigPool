package main

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"

	ec "github.com/bsv-blockchain/go-sdk/primitives/ec"
	"github.com/bsv8/MultisigPool/v4/pkg/libs"
	pool "github.com/bsv8/MultisigPool/v4/pkg/two_party_pool"
)

const (
	testnetAPIBase = "https://api.whatsonchain.com/v1/bsv/test"
	feeRate        = 0.5
	lockOffset     = 5
)

type unspentResponse struct {
	TxID  string `json:"tx_hash"`
	Vout  uint32 `json:"tx_pos"`
	Value uint64 `json:"value"`
}

type chainInfo struct {
	Blocks uint32 `json:"blocks"`
}

func getJSON(path string, target any) error {
	response, err := http.Get(testnetAPIBase + path)
	if err != nil {
		return fmt.Errorf("request %s: %w", path, err)
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("request %s returned HTTP status %s", path, response.Status)
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		return fmt.Errorf("read response for %s: %w", path, err)
	}
	if err := json.Unmarshal(body, target); err != nil {
		return fmt.Errorf("decode response for %s: %w", path, err)
	}
	return nil
}

func currentBlockHeight() (uint32, error) {
	var info chainInfo
	if err := getJSON("/chain/info", &info); err != nil {
		return 0, err
	}
	return info.Blocks, nil
}

func getUTXOs(address string) ([]libs.UTXO, error) {
	var response []unspentResponse
	if err := getJSON("/address/"+address+"/unspent", &response); err != nil {
		return nil, err
	}
	utxos := make([]libs.UTXO, len(response))
	for i, item := range response {
		utxos[i] = libs.UTXO{TxID: item.TxID, Vout: item.Vout, Value: item.Value}
	}
	return utxos, nil
}

func privateKey(name string) (*ec.PrivateKey, error) {
	value := os.Getenv(name)
	if value == "" {
		return nil, fmt.Errorf("environment variable %s is required", name)
	}
	key, err := ec.PrivateKeyFromHex(value)
	if err != nil {
		return nil, fmt.Errorf("invalid %s: %w", name, err)
	}
	return key, nil
}

func totalValue(utxos []libs.UTXO) (uint64, error) {
	var total uint64
	for _, utxo := range utxos {
		if ^uint64(0)-total < utxo.Value {
			return 0, fmt.Errorf("UTXO total overflows")
		}
		total += utxo.Value
	}
	return total, nil
}

func run() error {
	buyer, err := privateKey("FEEPOOL_BUYER_PRIV")
	if err != nil {
		return err
	}
	seller, err := privateKey("FEEPOOL_SELLER_PRIV")
	if err != nil {
		return err
	}
	roles := pool.TwoPartyPoolRoles{Buyer: buyer.PubKey(), Seller: seller.PubKey()}
	buyerAddress, err := libs.GetAddressFromPublicKey(roles.Buyer, false)
	if err != nil {
		return fmt.Errorf("derive buyer testnet address: %w", err)
	}
	utxos, err := getUTXOs(buyerAddress.AddressString)
	if err != nil {
		return err
	}
	if len(utxos) == 0 {
		return fmt.Errorf("no UTXOs found for buyer address %s", buyerAddress.AddressString)
	}
	total, err := totalValue(utxos)
	if err != nil {
		return err
	}
	const reserve = uint64(500)
	if total <= reserve {
		return fmt.Errorf("buyer UTXO total must exceed %d satoshis", reserve)
	}
	poolAmount := total - reserve
	height, err := currentBlockHeight()
	if err != nil {
		return err
	}
	funding, err := pool.BuildTwoPartyPoolFundingTx(utxos, poolAmount, buyer, roles, false, feeRate)
	if err != nil {
		return fmt.Errorf("build funding transaction: %w", err)
	}
	rate := pool.FeeSatPerKB(feeRate * 1000)
	state, err := pool.BuildTwoPartyPoolOpeningState(funding.Tx.TxID().CloneBytes(), funding.PoolOutputIndex, funding.PoolAmount, roles, height+lockOffset, rate)
	if err != nil {
		return fmt.Errorf("build opening state: %w", err)
	}
	buyerSignature, err := pool.SignTwoPartyPoolAsBuyer(state, poolAmount, roles, buyer)
	if err != nil {
		return fmt.Errorf("sign as buyer: %w", err)
	}
	sellerSignature, err := pool.SignTwoPartyPoolAsSeller(state, poolAmount, roles, seller)
	if err != nil {
		return fmt.Errorf("sign as seller: %w", err)
	}
	finalState, err := pool.MergeTwoPartyPoolBuyerSellerSignatures(state, poolAmount, roles, buyerSignature, sellerSignature)
	if err != nil {
		return fmt.Errorf("merge buyer and seller signatures: %w", err)
	}
	fmt.Printf("BuyerAddress %s\nBlockHeight %d\nPoolAmount %d\nFundingTxID %s\nFundingHex %s\nStateHex %s\nFinalHex %s\n", buyerAddress.AddressString, height, poolAmount, funding.Tx.TxID().String(), hex.EncodeToString(funding.Tx.Bytes()), hex.EncodeToString(state.Bytes()), hex.EncodeToString(finalState.Bytes()))
	return nil
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
