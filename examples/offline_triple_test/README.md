# Offline Triple Endpoint Test

This is a fixed unit test based on a successful run of the triple endpoint fee pool system. It uses hardcoded UTXO inputs and validates that all transaction outputs match the expected values from the successful test run.

## Test Data

The test uses fixed values from a successful execution:

- **Client1 Private Key**: `2796e78fad7d383fa5236607eba52d9a1904325daf9b4da3d77be5ad15ab1dae`
- **Client2 Private Key**: `a682814ac246ca65543197e593aa3b2633b891959c183416f54e2c63a8de1d8c`  
- **Server Private Key**: `e6d4d7685894d2644d1f4bf31c0b87f3f6aa8a3d7d4091eaa375e81d6c9f9091`
- **Fixed UTXO**: `95911b4d18002cd89aa04692ff59ecc62902c481c5cc5fa659370cb6a91752e6:1` (55603 satoshis)

## Test Flow

The test validates the complete triple endpoint fee pool workflow:

1. **Base Transaction**: Converts client1 UTXO to 2-of-3 multisig output
2. **Spend Transaction**: Creates initial distribution (client1 + server signatures)
3. **Update Transaction**: Client1 adjusts distribution, both clients sign
4. **Final Transaction**: Closes fee pool with final signatures

## Expected Outputs

All transaction hex strings and signatures are validated against the successful test run output to ensure deterministic behavior.

## Running the Test

```bash
cd examples/offline_triple_test
go run main.go
```

Or run as a proper Go test:

```bash
go test -v
```

## Key Features Tested

- ✅ Fixed UTXO input for deterministic results
- ✅ All transaction signatures match expected values
- ✅ Complete workflow from base transaction to final closure
- ✅ Proper 2-of-3 multisig handling with server as arbitrator
- ✅ Client negotiation and amount redistribution
- ✅ Final fee pool closure with immediate broadcast capability

This test serves as a regression test to ensure the triple endpoint implementation remains consistent and produces the same outputs for the same inputs.