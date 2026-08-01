import { PrivateKey } from '@bsv/sdk/primitives';
import Transaction from '@bsv/sdk/transaction/Transaction';
import { Protocol, Version, buildTwoPartyPoolFundingTx, buildTwoPartyPoolLock, buildTwoPartyPoolOpeningState, buildTwoPartyPoolState, signTwoPartyPoolAsBuyer, signTwoPartyPoolAsSeller, mergeTwoPartyPoolBuyerSellerSignatures } from '../../src/two_party_pool';

const buyer = PrivateKey.fromHex('01'.padStart(64, '0'));
const seller = PrivateKey.fromHex('02'.padStart(64, '0'));
const roles = { buyer: buyer.toPublicKey(), seller: seller.toPublicKey() };

test('two-party pool fixes [buyer, seller] and keeps signing pure', async () => {
  const funding = await buildTwoPartyPoolFundingTx([{ txid: 'aa'.repeat(32), vout: 0, satoshis: 20000 }], 19000, buyer, roles, 1);
  const state = await buildTwoPartyPoolOpeningState(funding.tx, funding.poolAmount, roles, 0, 1);
  const original = state.toHex();
  const buyerSignature = signTwoPartyPoolAsBuyer(state, funding.poolAmount, roles, buyer);
  const sellerSignature = signTwoPartyPoolAsSeller(state, funding.poolAmount, roles, seller);
  const finalState = mergeTwoPartyPoolBuyerSellerSignatures(state, funding.poolAmount, roles, buyerSignature, sellerSignature);
  const serialized = Transaction.fromHex(finalState.toHex());
  expect(serialized.inputs[0].unlockingScript?.toBinary().length).toBeGreaterThan(0);
  expect(serialized.inputs[0].unlockingScript?.toBinary().length).toBe(finalState.inputs[0].unlockingScript?.toBinary().length);
  expect(serialized.inputs[0].sequence).toBe(finalState.inputs[0].sequence);
  expect(state.toHex()).toBe(original);
});

test('two-party state mutations survive raw serialization', async () => {
  const funding = await buildTwoPartyPoolFundingTx([{ txid: 'aa'.repeat(32), vout: 0, satoshis: 20000 }], 19000, buyer, roles, 1);
  const state = await buildTwoPartyPoolOpeningState(funding.tx, funding.poolAmount, roles, 0, 1);
  const next = await buildTwoPartyPoolState({ protocol: Protocol, version: Version, previousState: state, sequence: 3, sellerAmount: 100, poolAmount: funding.poolAmount, roles, feeRate: 1 });
  const serialized = Transaction.fromHex(next.toHex());
  expect(serialized.inputs[0].sequence).toBe(3);
  expect(serialized.outputs[1].satoshis).toBe(100);
  expect(serialized.outputs[0].satoshis).toBe(next.outputs[0].satoshis);
});

test('two-party state rejects missing and mismatched source outputs', async () => {
  const funding = await buildTwoPartyPoolFundingTx([{ txid: 'aa'.repeat(32), vout: 0, satoshis: 20000 }], 19000, buyer, roles, 1);
  const state = await buildTwoPartyPoolOpeningState(funding.tx, funding.poolAmount, roles, 0, 1);
  const rawState = Transaction.fromHex(state.toHex());
  await expect(buildTwoPartyPoolState({ protocol: Protocol, version: Version, previousState: rawState, sequence: 3, sellerAmount: 100, poolAmount: funding.poolAmount, roles, feeRate: 1 })).rejects.toThrow('source');
  const wrongSource = new Transaction();
  const wrongRoles = { buyer: roles.seller, seller: roles.buyer };
  wrongSource.outputs = [{ satoshis: funding.poolAmount, lockingScript: buildTwoPartyPoolLock(wrongRoles) }];
  rawState.inputs[0].sourceTransaction = wrongSource;
  await expect(buildTwoPartyPoolState({ protocol: Protocol, version: Version, previousState: rawState, sequence: 3, sellerAmount: 100, poolAmount: funding.poolAmount, roles, feeRate: 1 })).rejects.toThrow('source');
});

test('two-party pool rejects duplicate role keys', async () => {
  await expect(buildTwoPartyPoolFundingTx([], 1, buyer, { buyer: buyer.toPublicKey(), seller: buyer.toPublicKey() }, 1)).rejects.toThrow('different');
});

test('two-party pool rejects swapped roles and invalid protocol versions', async () => {
  const funding = await buildTwoPartyPoolFundingTx([{ txid: 'aa'.repeat(32), vout: 0, satoshis: 20000 }], 19000, buyer, roles, 1);
  const state = await buildTwoPartyPoolOpeningState(funding.tx, funding.poolAmount, roles, 0, 1);
  await expect(buildTwoPartyPoolState({ protocol: Protocol, version: Version, previousState: state, sequence: 3, sellerAmount: 100, poolAmount: funding.poolAmount, roles: { buyer: roles.seller, seller: roles.buyer }, feeRate: 1 })).rejects.toThrow('outputs');
  await expect(buildTwoPartyPoolState({ protocol: Protocol, version: 2, previousState: state, sequence: 3, sellerAmount: 100, poolAmount: funding.poolAmount, roles, feeRate: 1 })).rejects.toThrow('protocol');
});
