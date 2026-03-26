import { PrivateKey } from '@bsv/sdk/primitives';
import Transaction from '@bsv/sdk/transaction/Transaction';
import Script from '@bsv/sdk/script/Script';
import MultiSig from '../../src/libs/MULTISIG';
import {
  tripleBuildFeePoolBaseTx,
  tripleBuildFeePoolSpendTX,
  tripleBuildFeePoolSpendTXWithProof,
  tripleSpendTXFeePoolBSign,
} from '../../src/triple_endpoint';
import { buildOptionalOpReturnScript } from '../../src/libs/OP_RETURN';

interface TestUTXO {
  txid: string;
  vout: number;
  satoshis: number;
}

describe('Triple Endpoint Tests', () => {
  const testData = {
    clientPrivHex: "a682814ac246ca65543197e593aa3b2633b891959c183416f54e2c63a8de1d8c",
    serverPrivHex: "903b1b2c396f17203fa83444d72bf5c666119d9d681eb715520f99ae6f92322c",
    escrowPrivHex: "a2d2ca4c19e3c560792ca751842c29b9da94be09f712a7f9ba7c66e64a354829",
    clientUtxos: [
      {
        txid: "ffcfe296a596f01e5cef2d14f39bc61f55c8f0535a5f723c1b5b043b77053595",
        vout: 1,
        satoshis: 19996
      }
    ],
    feePerByte: 1.2,
  };

  test('should build triple endpoint fee pool transactions correctly', async () => {
    const clientPriv = PrivateKey.fromHex(testData.clientPrivHex);
    const serverPriv = PrivateKey.fromHex(testData.serverPrivHex);
    const escrowPriv = PrivateKey.fromHex(testData.escrowPrivHex);

    // Step 1: Build pool funding (base) transaction
    const { tx: baseTx } = await tripleBuildFeePoolBaseTx(
      testData.clientUtxos,
      serverPriv.toPublicKey(),      // server pubkey comes first per API
      clientPriv,                    // client private key (A-party)
      escrowPriv.toPublicKey(),      // third-party pubkey
      testData.feePerByte,
    );

    expect(baseTx.outputs.length).toBe(1);
    expect(baseTx.outputs[0].satoshis).toBeGreaterThan(0);
    expect(baseTx.inputs.length).toBe(1);

    // Step 2: Client constructs spend transaction (client side partially signed)
    const poolValue = baseTx.outputs[0].satoshis as number;

    const spendResp = await tripleBuildFeePoolSpendTX(
      baseTx.id('hex'),              // previous txid
      poolValue,                     // value locked in pool output
      0,                             // lock-time / end height (0 for immediate)
      serverPriv.toPublicKey(),
      clientPriv,
      escrowPriv.toPublicKey(),
      testData.feePerByte,
    );

    const spendTx = spendResp.tx;
    const clientSig = spendResp.clientSignBytes;

    expect(clientSig.length).toBeGreaterThan(60);
    expect(spendTx.outputs.length).toBe(2);
    expect(spendTx.outputs[0].satoshis).toBe(0);
    expect(spendTx.outputs[1].satoshis).toBe(spendResp.amount);
    expect(spendResp.amount).toBeGreaterThan(0);

    // Step 3: Server adds its signature
    const serverSig = await tripleSpendTXFeePoolBSign(
      spendTx,
      poolValue,                     // 使用原始池子金额
      serverPriv.toPublicKey(),
      clientPriv.toPublicKey(),
      escrowPriv.toPublicKey(),      // 传递 escrow 公钥
      escrowPriv,                    // 使用 escrow 私钥进行签名
    );

    // Combine signatures into final unlocking script
    const unlockingScript = MultiSig.buildSignScript([clientSig, serverSig]);
    (spendTx.inputs[0] as any).unlockingScript = unlockingScript as unknown as Script;

    expect(serverSig.length).toBeGreaterThan(60);
    expect(spendTx.inputs[0].unlockingScript).toBeDefined();
    expect(spendTx.toHex().length).toBeGreaterThan(300);
  });

  test('should handle different fee rates', async () => {
    const clientPriv = PrivateKey.fromHex(testData.clientPrivHex);
    const serverPriv = PrivateKey.fromHex(testData.serverPrivHex);
    const escrowPriv = PrivateKey.fromHex(testData.escrowPrivHex);

    // Test with original fee rate
    const { tx: baseTx1 } = await tripleBuildFeePoolBaseTx(
      testData.clientUtxos,
      serverPriv.toPublicKey(),
      clientPriv,
      escrowPriv.toPublicKey(),
      testData.feePerByte,
    );

    // Test with much higher fee rate to ensure difference
    const higherFeeRate = 50.0;
    const { tx: baseTx2 } = await tripleBuildFeePoolBaseTx(
      testData.clientUtxos,
      serverPriv.toPublicKey(),
      clientPriv,
      escrowPriv.toPublicKey(),
      higherFeeRate,
    );

    // With higher fee rate, the output amount should be lower or equal (due to minimum fee)
    const poolValue1 = baseTx1.outputs[0].satoshis as number;
    const poolValue2 = baseTx2.outputs[0].satoshis as number;
    expect(poolValue2).toBeLessThanOrEqual(poolValue1);
  });

  test('should validate input parameters', async () => {
    const clientPriv = PrivateKey.fromHex(testData.clientPrivHex);
    const serverPriv = PrivateKey.fromHex(testData.serverPrivHex);
    const escrowPriv = PrivateKey.fromHex(testData.escrowPrivHex);

    // Test with empty UTXOs
    await expect(tripleBuildFeePoolBaseTx(
      [],
      serverPriv.toPublicKey(),
      clientPriv,
      escrowPriv.toPublicKey(),
      testData.feePerByte,
    )).rejects.toThrow();

    // Test with zero fee rate - still has minimum fee
    const { tx: baseTx } = await tripleBuildFeePoolBaseTx(
      testData.clientUtxos,
      serverPriv.toPublicKey(),
      clientPriv,
      escrowPriv.toPublicKey(),
      0,
    );
    const poolValue = baseTx.outputs[0].satoshis as number;
    // Even with zero fee rate, there's still a minimum fee calculated
    expect(poolValue).toBeLessThanOrEqual(19996);
  });

  test('should create correct multisig script structure', async () => {
    const clientPriv = PrivateKey.fromHex(testData.clientPrivHex);
    const serverPriv = PrivateKey.fromHex(testData.serverPrivHex);
    const escrowPriv = PrivateKey.fromHex(testData.escrowPrivHex);

    const { tx: baseTx } = await tripleBuildFeePoolBaseTx(
      testData.clientUtxos,
      serverPriv.toPublicKey(),
      clientPriv,
      escrowPriv.toPublicKey(),
      testData.feePerByte,
    );

    // Check that the output script is a 2-of-3 multisig
    const outputScript = baseTx.outputs[0].lockingScript;
    const scriptHex = outputScript.toHex();
    
    // Should start with OP_2 (0x52) and end with OP_3 (0x53) OP_CHECKMULTISIG (0xae)
    expect(scriptHex.startsWith('52')).toBe(true);
    expect(scriptHex.endsWith('53ae')).toBe(true);
  });

  test('should append binary payment proof as the last output', async () => {
    const clientPriv = PrivateKey.fromHex(testData.clientPrivHex);
    const serverPriv = PrivateKey.fromHex(testData.serverPrivHex);
    const escrowPriv = PrivateKey.fromHex(testData.escrowPrivHex);
    const proof = Uint8Array.from([0x00, 0x01, 0xff, 0x10, 0x70, 0x61, 0x79, 0x80]);

    const { tx: baseTx } = await tripleBuildFeePoolBaseTx(
      testData.clientUtxos,
      serverPriv.toPublicKey(),
      clientPriv,
      escrowPriv.toPublicKey(),
      testData.feePerByte,
    );

    const poolValue = baseTx.outputs[0].satoshis as number;
    const spendResp = await tripleBuildFeePoolSpendTXWithProof(
      baseTx.id('hex'),
      poolValue,
      0,
      serverPriv.toPublicKey(),
      clientPriv,
      escrowPriv.toPublicKey(),
      testData.feePerByte,
      proof,
    );

    expect(spendResp.tx.outputs.length).toBe(3);
    expect(spendResp.tx.outputs[0].satoshis).toBe(0);
    expect(spendResp.tx.outputs[1].satoshis).toBe(spendResp.amount);
    expect(spendResp.tx.outputs[2].satoshis).toBe(0);
    expect(spendResp.tx.outputs[2].lockingScript.toHex()).toBe(buildOptionalOpReturnScript(proof)!.toHex());
  });
});
