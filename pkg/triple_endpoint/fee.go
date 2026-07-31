package triple_endpoint

import (
	"fmt"
	"math"
)

func integerFeeRate[R ~float64 | ~uint64](rate R) (uint64, error) {
	value := float64(rate)
	if value < 0 || math.IsNaN(value) || math.IsInf(value, 0) || value > math.MaxUint64 {
		return 0, fmt.Errorf("invalid integer fee rate")
	}
	return uint64(math.Ceil(value)), nil
}

// FeeSatPerKB is the integer fee unit used by every triple-pool state.
type FeeSatPerKB uint64

func transactionFeeSat(size int, rate FeeSatPerKB) (uint64, error) {
	if size < 0 {
		return 0, fmt.Errorf("negative transaction size")
	}
	if size == 0 || rate == 0 {
		return 0, nil
	}
	const kb = uint64(1000)
	bytes := uint64(size)
	if bytes > ^uint64(0)/uint64(rate) {
		return 0, fmt.Errorf("transaction fee overflow")
	}
	fee := bytes * uint64(rate)
	if fee > ^uint64(0)-(kb-1) {
		return 0, fmt.Errorf("transaction fee overflow")
	}
	return (fee + kb - 1) / kb, nil
}

func TriplePoolFeeSat(serializedSize int, rate FeeSatPerKB) (uint64, error) {
	return transactionFeeSat(serializedSize, rate)
}
