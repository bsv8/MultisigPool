import { readFileSync } from 'fs';
import path from 'path';
import { PrivateKey, PublicKey } from '@bsv/sdk/primitives';
import Transaction from '@bsv/sdk/transaction/Transaction';
import MultiSig from '../../src/libs/MULTISIG';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';

type Fixture = {
  poolAmountSat: number;
  stateFeeSat: number;
  stateOutputCount: number;
  stateSequence: number;
  serverPubKey: string;
  buyerPubKey: string;
  arbiterPubKey: string;
  sourceTxID: string;
  stateTxHex: string;
  buyerSignatureHex: string;
  serverSignatureHex: string;
};

const fixture = JSON.parse(readFileSync(path.resolve(__dirname, '../../testdata/triple_pool_v2_fixture.json'), 'utf8')) as Fixture;

describe('shared BitFS v2 triple-pool fixture', () => {
  test('pins state bytes, integer fee and role signature bytes', () => {
    const tx = Transaction.fromHex(fixture.stateTxHex);
    const server = PublicKey.fromString(fixture.serverPubKey);
    const buyer = PublicKey.fromString(fixture.buyerPubKey);
    const arbiter = PublicKey.fromString(fixture.arbiterPubKey);
    const source = new Transaction();
    source.outputs = [{
      satoshis: fixture.poolAmountSat,
      lockingScript: new MultiSig().lock([server, buyer, arbiter], 2),
    }];
    tx.inputs[0].sourceTransaction = source;

    expect(tx.toHex()).toBe(fixture.stateTxHex);
    expect(tx.inputs[0].sequence).toBe(fixture.stateSequence);
    expect(tx.outputs).toHaveLength(fixture.stateOutputCount);
    expect(fixture.poolAmountSat - tx.outputs.reduce((sum, output) => sum + (output.satoshis || 0), 0)).toBe(fixture.stateFeeSat);

    const buyerKey = PrivateKey.fromHex('a682814ac246ca65543197e593aa3b2633b891959c183416f54e2c63a8de1d8c');
    const serverKey = PrivateKey.fromHex('903b1b2c396f17203fa83444d72bf5c666119d9d681eb715520f99ae6f92322c');
    const buyerSig = new MultiSig().signOne(tx, 0, buyerKey, TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID);
    const serverSig = new MultiSig().signOne(tx, 0, serverKey, TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID);
    expect(buyerSig.toString('hex')).toBe(fixture.buyerSignatureHex);
    expect(serverSig.toString('hex')).toBe(fixture.serverSignatureHex);
  });
});
