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
  const next = await buildArbitratedPoolState({ protocol: Protocol, version: Version, previousState: state, sequence: 3, sellerAmount: 200, arbiterAmount: 0, poolAmount: funding.poolAmount, roles, feeRate: 1 });
  const serialized = Transaction.fromHex(next.toHex());
  expect(serialized.inputs[0].sequence).toBe(3);
  expect(serialized.outputs[1].satoshis).toBe(200);
  expect(serialized.outputs[2].satoshis).toBe(0);
  await expect(buildArbitratedPoolState({ protocol: Protocol, version: 2, previousState: state, sequence: 3, sellerAmount: 200, arbiterAmount: 0, poolAmount: funding.poolAmount, roles, feeRate: 1 })).rejects.toThrow('protocol');
  await expect(buildArbitratedPoolState({ protocol: Protocol, version: Version, previousState: state, sequence: 1, sellerAmount: 200, arbiterAmount: 0, poolAmount: funding.poolAmount, roles, feeRate: 1 })).rejects.toThrow('increase');
  const signature = signArbitratedPoolAsBuyer(state, funding.poolAmount, roles, buyer);
  expect(() => mergeArbitratedPoolBuyerSellerSignatures(state, funding.poolAmount, roles, signature, signature)).toThrow('duplicate');
});

test('arbitrated state rejects missing and mismatched source outputs', async () => {
  const funding = await buildArbitratedPoolFundingTx([{ txid: 'bb'.repeat(32), vout: 0, satoshis: 30000 }], 29000, buyer, roles, 1);
  const state = await buildArbitratedPoolOpeningState(funding.tx, funding.poolAmount, roles, 0, 1);
  const rawState = Transaction.fromHex(state.toHex());
  await expect(buildArbitratedPoolState({ protocol: Protocol, version: Version, previousState: rawState, sequence: 3, sellerAmount: 200, arbiterAmount: 0, poolAmount: funding.poolAmount, roles, feeRate: 1 })).rejects.toThrow('source');
  const wrongSource = new Transaction();
  const wrongRoles = { buyer: roles.seller, seller: roles.buyer, arbiter: roles.arbiter };
  wrongSource.outputs = [{ satoshis: funding.poolAmount, lockingScript: buildArbitratedPoolLock(wrongRoles) }];
  rawState.inputs[0].sourceTransaction = wrongSource;
  await expect(buildArbitratedPoolState({ protocol: Protocol, version: Version, previousState: rawState, sequence: 3, sellerAmount: 200, arbiterAmount: 0, poolAmount: funding.poolAmount, roles, feeRate: 1 })).rejects.toThrow('source');
});

test('arbitrated funding requires an integer sat/KB rate and permits zero fee', async () => {
  const zeroFee = await buildArbitratedPoolFundingTx([{ txid: 'bb'.repeat(32), vout: 0, satoshis: 30000 }], 29000, buyer, roles, 0);
  expect(zeroFee.fee).toBe(0);
  expect(zeroFee.tx.outputs[1]?.satoshis).toBe(1000);
  await expect(buildArbitratedPoolFundingTx([{ txid: 'bb'.repeat(32), vout: 0, satoshis: 30000 }], 29000, buyer, roles, 0.5)).rejects.toThrow('integer');
  await expect(buildArbitratedPoolFundingTx([{ txid: 'bb'.repeat(32), vout: 0, satoshis: 30000 }], 29000, buyer, roles, Number.NaN)).rejects.toThrow('integer');
});

test('arbitrated state rejects arbiter script, fourth output, buyer fee and fee overflow errors', async () => {
  const funding = await buildArbitratedPoolFundingTx([{ txid: 'bb'.repeat(32), vout: 0, satoshis: 30000 }], 29000, buyer, roles, 1);
  const opening = await buildArbitratedPoolOpeningState(funding.tx, funding.poolAmount, roles, 0, 1);
  const wrongArbiter = Transaction.fromHex(opening.toHex());
  wrongArbiter.inputs[0]!.sourceTransaction = opening.inputs[0]!.sourceTransaction;
  wrongArbiter.outputs[2]!.lockingScript = wrongArbiter.outputs[1]!.lockingScript;
  expect(() => signArbitratedPoolAsBuyer(wrongArbiter, funding.poolAmount, roles, buyer)).toThrow('output');
  const proof = await buildArbitratedPoolState({ protocol: Protocol, version: Version, previousState: opening, sequence: 3, sellerAmount: 100, arbiterAmount: 50, poolAmount: funding.poolAmount, roles, feeRate: 1, paymentProof: [1, 2, 3] });
  proof.outputs[3]!.satoshis = 1;
  expect(() => signArbitratedPoolAsBuyer(proof, funding.poolAmount, roles, buyer)).toThrow('payment proof');
  await expect(buildArbitratedPoolState({ protocol: Protocol, version: Version, previousState: opening, sequence: 3, sellerAmount: funding.poolAmount, arbiterAmount: 0, poolAmount: funding.poolAmount, roles, feeRate: 1 })).rejects.toThrow('insufficient');
  await expect(buildArbitratedPoolState({ protocol: Protocol, version: Version, previousState: opening, sequence: 3, sellerAmount: 0, arbiterAmount: 0, poolAmount: funding.poolAmount, roles, feeRate: Number.MAX_SAFE_INTEGER })).rejects.toThrow('overflow');
});
