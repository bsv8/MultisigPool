import { PrivateKey } from '@bsv/sdk/primitives';
import Transaction from '@bsv/sdk/transaction/Transaction';
import { buildDualFeePoolBaseTx, buildDualFeePoolSpendTX, createDualMultisigScript, spendTXServerSign, serverVerifyClientSpendSig, clientVerifyServerSpendSig } from '../../src/dual_endpoint';

describe('Dual Endpoint Signature Verification', () => {
  const data = {
    clientPrivHex: '903b1b2c396f17203fa83444d72bf5c666119d9d681eb715520f99ae6f92322c',
    serverPrivHex: 'a2d2ca4c19e3c560792ca751842c29b9da94be09f712a7f9ba7c66e64a354829',
    clientUtxos: [
      { txid: '0a1fd93f02e68d1a73fb499e948ee83a78aa9337e1476bd89f7092a7ef16a050', vout: 1, satoshis: 99902 },
    ],
    endHeight: 800000,
    feeRate: 0.5,
  };

  test('verifies client and server signatures for spend tx', async () => {
    const clientPriv = PrivateKey.fromHex(data.clientPrivHex);
    const serverPriv = PrivateKey.fromHex(data.serverPrivHex);

    const totalValue = data.clientUtxos.reduce((s, u) => s + u.satoshis, 0);
    const feepoolAmount = totalValue - 500;
    const step1 = await buildDualFeePoolBaseTx(
      data.clientUtxos,
      clientPriv,
      serverPriv.toPublicKey(),
      feepoolAmount,
      data.feeRate,
    );

    const serverAmount = 100;
    const step2 = await buildDualFeePoolSpendTX(
      step1.tx,
      step1.amount,
      serverAmount,
      data.endHeight,
      clientPriv,
      serverPriv.toPublicKey(),
      data.feeRate,
    );

    // Ensure source context for signing/verification
    if (!step2.tx.inputs[0].sourceTransaction) {
      step2.tx.inputs[0].sourceTransaction = new Transaction();
      step2.tx.inputs[0].sourceTransaction.outputs = [];
    }
    const redeem = createDualMultisigScript([serverPriv.toPublicKey(), clientPriv.toPublicKey()]);
    step2.tx.inputs[0].sourceTransaction.outputs[0] = {
      satoshis: step1.amount,
      lockingScript: redeem,
    } as any;

    const serverSig = spendTXServerSign(step2.tx, step1.amount, serverPriv, clientPriv.toPublicKey());

    expect(serverVerifyClientSpendSig(step2.tx, step1.amount, serverPriv.toPublicKey(), clientPriv.toPublicKey(), step2.clientSignBytes)).toBe(true);
    expect(clientVerifyServerSpendSig(step2.tx, step1.amount, serverPriv.toPublicKey(), clientPriv.toPublicKey(), serverSig)).toBe(true);

    // Negative: tamper sighash flag
    const badClientSig = [...step2.clientSignBytes];
    badClientSig[badClientSig.length - 1] ^= 0xff;
    expect(serverVerifyClientSpendSig(step2.tx, step1.amount, serverPriv.toPublicKey(), clientPriv.toPublicKey(), badClientSig)).toBe(false);

    // Negative: change lockTime
    const originalLock = step2.tx.lockTime;
    step2.tx.lockTime = originalLock + 1;
    expect(serverVerifyClientSpendSig(step2.tx, step1.amount, serverPriv.toPublicKey(), clientPriv.toPublicKey(), step2.clientSignBytes)).toBe(false);
    // restore
    step2.tx.lockTime = originalLock;
  });
});

