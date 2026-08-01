import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrivateKey } from '@bsv/sdk/primitives';
import Transaction from '@bsv/sdk/transaction/Transaction';
import { Protocol, Version, buildArbitratedPoolLock, signArbitratedPoolAsBuyer, signArbitratedPoolAsSeller, validatePoolProtocol } from '../../src/arbitrated_pool';

const fixture = JSON.parse(readFileSync(resolve(__dirname, '../../testdata/arbitrated_pool_v3_fixture.json'), 'utf8')) as {
  protocol: string; version: number; poolAmount: number; stateTxHex: string; buyerSignatureHex: string; sellerSignatureHex: string;
};

test('v3 fixture uses the canonical role order and signatures', () => {
  validatePoolProtocol(fixture);
  expect(fixture.protocol).toBe(Protocol);
  expect(fixture.version).toBe(Version);
  const buyer = PrivateKey.fromHex('a682814ac246ca65543197e593aa3b2633b891959c183416f54e2c63a8de1d8c');
  const seller = PrivateKey.fromHex('903b1b2c396f17203fa83444d72bf5c666119d9d681eb715520f99ae6f92322c');
  const arbiter = PrivateKey.fromHex('a2d2ca4c19e3c560792ca751842c29b9da94be09f712a7f9ba7c66e64a354829');
  const roles = { buyer: buyer.toPublicKey(), seller: seller.toPublicKey(), arbiter: arbiter.toPublicKey() };
  const state = Transaction.fromHex(fixture.stateTxHex);
  const source = new Transaction();
  source.outputs = [{ satoshis: fixture.poolAmount, lockingScript: buildArbitratedPoolLock(roles) }];
  state.inputs[0].sourceTransaction = source;
  expect(Buffer.from(signArbitratedPoolAsBuyer(state, fixture.poolAmount, roles, buyer)).toString('hex')).toBe(fixture.buyerSignatureHex);
  expect(Buffer.from(signArbitratedPoolAsSeller(state, fixture.poolAmount, roles, seller)).toString('hex')).toBe(fixture.sellerSignatureHex);
});
