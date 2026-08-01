import { PrivateKey } from '@bsv/sdk/primitives';
import Transaction from '@bsv/sdk/transaction/Transaction';
import { Protocol, Version, buildArbitratedPoolFundingTx, buildArbitratedPoolLock, buildArbitratedPoolOpeningState, buildArbitratedPoolState, signArbitratedPoolAsBuyer, signArbitratedPoolAsSeller, signArbitratedPoolAsArbiter, mergeArbitratedPoolBuyerSellerSignatures, mergeArbitratedPoolBuyerArbiterSignatures, mergeArbitratedPoolSellerArbiterSignatures } from '../../src/arbitrated_pool';

const buyer = PrivateKey.fromHex('01'.padStart(64, '0'));
const seller = PrivateKey.fromHex('02'.padStart(64, '0'));
const arbiter = PrivateKey.fromHex('03'.padStart(64, '0'));
const roles = { buyer: buyer.toPublicKey(), seller: seller.toPublicKey(), arbiter: arbiter.toPublicKey() };

test('arbitrated pool supports all three 2-of-3 signature pairs', async () => {
  const funding = await buildArbitratedPoolFundingTx([{ txid: 'bb'.repeat(32), vout: 0, satoshis: 30000 }], 29000, buyer, roles, 1);
  const state = await buildArbitratedPoolOpeningState(funding.tx, funding.poolAmount, roles, 0, 1);
  const buyerSignature = signArbitratedPoolAsBuyer(state, funding.poolAmount, roles, buyer);
  const sellerSignature = signArbitratedPoolAsSeller(state, funding.poolAmount, roles, seller);
  const arbiterSignature = signArbitratedPoolAsArbiter(state, funding.poolAmount, roles, arbiter);
  const finalState = mergeArbitratedPoolBuyerSellerSignatures(state, funding.poolAmount, roles, buyerSignature, sellerSignature);
  const serialized = Transaction.fromHex(finalState.toHex());
  expect(serialized.inputs[0].unlockingScript?.toBinary().length).toBeGreaterThan(0);
  expect(serialized.inputs[0].unlockingScript?.toBinary().length).toBe(finalState.inputs[0].unlockingScript?.toBinary().length);
  expect(mergeArbitratedPoolBuyerArbiterSignatures(state, funding.poolAmount, roles, buyerSignature, arbiterSignature)).toBeTruthy();
  expect(mergeArbitratedPoolSellerArbiterSignatures(state, funding.poolAmount, roles, sellerSignature, arbiterSignature)).toBeTruthy();
});

test('arbitrated state serialization, role order and protocol are validated', async () => {
  const funding = await buildArbitratedPoolFundingTx([{ txid: 'bb'.repeat(32), vout: 0, satoshis: 30000 }], 29000, buyer, roles, 1);
  const state = await buildArbitratedPoolOpeningState(funding.tx, funding.poolAmount, roles, 0, 1);
  const next = await buildArbitratedPoolState({ protocol: Protocol, version: Version, previousState: state, sequence: 3, sellerAmount: 200, poolAmount: funding.poolAmount, roles, feeRate: 1 });
  const serialized = Transaction.fromHex(next.toHex());
  expect(serialized.inputs[0].sequence).toBe(3);
  expect(serialized.outputs[1].satoshis).toBe(200);
  await expect(buildArbitratedPoolState({ protocol: Protocol, version: 2, previousState: state, sequence: 3, sellerAmount: 200, poolAmount: funding.poolAmount, roles, feeRate: 1 })).rejects.toThrow('protocol');
  await expect(buildArbitratedPoolState({ protocol: Protocol, version: Version, previousState: state, sequence: 1, sellerAmount: 200, poolAmount: funding.poolAmount, roles, feeRate: 1 })).rejects.toThrow('increase');
  const signature = signArbitratedPoolAsBuyer(state, funding.poolAmount, roles, buyer);
  expect(() => mergeArbitratedPoolBuyerSellerSignatures(state, funding.poolAmount, roles, signature, signature)).toThrow('duplicate');
});

test('arbitrated state rejects missing and mismatched source outputs', async () => {
  const funding = await buildArbitratedPoolFundingTx([{ txid: 'bb'.repeat(32), vout: 0, satoshis: 30000 }], 29000, buyer, roles, 1);
  const state = await buildArbitratedPoolOpeningState(funding.tx, funding.poolAmount, roles, 0, 1);
  const rawState = Transaction.fromHex(state.toHex());
  await expect(buildArbitratedPoolState({ protocol: Protocol, version: Version, previousState: rawState, sequence: 3, sellerAmount: 200, poolAmount: funding.poolAmount, roles, feeRate: 1 })).rejects.toThrow('source');
  const wrongSource = new Transaction();
  const wrongRoles = { buyer: roles.seller, seller: roles.buyer, arbiter: roles.arbiter };
  wrongSource.outputs = [{ satoshis: funding.poolAmount, lockingScript: buildArbitratedPoolLock(wrongRoles) }];
  rawState.inputs[0].sourceTransaction = wrongSource;
  await expect(buildArbitratedPoolState({ protocol: Protocol, version: Version, previousState: rawState, sequence: 3, sellerAmount: 200, poolAmount: funding.poolAmount, roles, feeRate: 1 })).rejects.toThrow('source');
});
