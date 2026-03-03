import { PrivateKey } from '@bsv/sdk/primitives';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';
import Transaction from '@bsv/sdk/transaction/Transaction';
import { tripleBuildFeePoolBaseTx } from '../../src/triple_endpoint/1base_tx';
import { tripleBuildFeePoolSpendTX } from '../../src/triple_endpoint/2client_spend_tx';
import { tripleSpendTXFeePoolBSign } from '../../src/triple_endpoint/3server_sign';
import { serverVerifyClientASig, clientVerifyServerSig, serverVerifyClientBSig } from '../../src/triple_endpoint/6verify';
import MultiSig from '../../src/libs/MULTISIG';

describe('Triple Endpoint Signature Verification', () => {
  const data = {
    clientPrivHex: '2796e78fad7d383fa5236607eba52d9a1904325daf9b4da3d77be5ad15ab1dae',
    escrowPrivHex: 'a682814ac246ca65543197e593aa3b2633b891959c183416f54e2c63a8de1d8c',
    serverPrivHex: 'e6d4d7685894d2644d1f4bf31c0b87f3f6aa8a3d7d4091eaa375e81d6c9f9091',
    clientUtxos: [
      { txid: '02c0b306d50088680b4f5f1d37bba2', vout: 0, satoshis: 20000 },
    ],
    feeRate: 0.5,
  } as any;

  test('verifies A-client and server signatures for spend tx', async () => {
    const aPriv = PrivateKey.fromHex(data.clientPrivHex);
    const escrowPriv = PrivateKey.fromHex(data.escrowPrivHex);
    const serverPriv = PrivateKey.fromHex(data.serverPrivHex);

    const { tx: baseTx } = await tripleBuildFeePoolBaseTx(
      data.clientUtxos,
      serverPriv.toPublicKey(),
      aPriv,
      escrowPriv.toPublicKey(),
      data.feeRate,
    );

    const poolValue = baseTx.outputs[0].satoshis as number;

    const spendResp = await tripleBuildFeePoolSpendTX(
      baseTx.id('hex'),
      poolValue,
      0,
      serverPriv.toPublicKey(),
      aPriv,
      escrowPriv.toPublicKey(),
      data.feeRate,
    );

    // 确保输入具备签名所需的源交易上下文。
    if (!spendResp.tx.inputs[0].sourceTransaction) {
      spendResp.tx.inputs[0].sourceTransaction = new Transaction();
      spendResp.tx.inputs[0].sourceTransaction.outputs = [];
    }
    const redeem = new MultiSig().lock([serverPriv.toPublicKey(), aPriv.toPublicKey(), escrowPriv.toPublicKey()], 2);
    spendResp.tx.inputs[0].sourceTransaction.outputs[0] = {
      satoshis: poolValue,
      lockingScript: redeem as any,
    } as any;

    const bSig = await tripleSpendTXFeePoolBSign(
      spendResp.tx,
      poolValue,
      serverPriv.toPublicKey(),
      aPriv.toPublicKey(),
      escrowPriv.toPublicKey(),
      escrowPriv,
    );

    const serverSig = new MultiSig().signOne(
      spendResp.tx,
      0,
      serverPriv,
      TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID,
    );

    expect(serverVerifyClientASig(
      spendResp.tx,
      poolValue,
      serverPriv.toPublicKey(),
      aPriv.toPublicKey(),
      escrowPriv.toPublicKey(),
      Array.from(spendResp.clientSignBytes),
    )).toBe(true);

    expect(serverVerifyClientBSig(
      spendResp.tx,
      poolValue,
      serverPriv.toPublicKey(),
      aPriv.toPublicKey(),
      escrowPriv.toPublicKey(),
      Array.from(bSig),
    )).toBe(true);

    expect(clientVerifyServerSig(
      spendResp.tx,
      poolValue,
      serverPriv.toPublicKey(),
      aPriv.toPublicKey(),
      escrowPriv.toPublicKey(),
      Array.from(serverSig),
    )).toBe(true);
  });
});
