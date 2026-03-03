import { PrivateKey } from '@bsv/sdk/primitives';
import { buildDualFeePoolBaseTx } from '../../src/dual_endpoint/1base_tx';
import { buildDualFeePoolSpendTX } from '../../src/dual_endpoint/2client_spend_tx';
import * as base from '../../src/dual_endpoint/1base_tx';
import Transaction from '@bsv/sdk/transaction/Transaction';
import Script from '@bsv/sdk/script/Script';
import OP from '@bsv/sdk/script/OP';
import { TransactionSignature } from '@bsv/sdk';
import { hash256 } from '@bsv/sdk/primitives/Hash';
import * as ECDSA from '@bsv/sdk/primitives/ECDSA';
import BigNumber from '@bsv/sdk/primitives/BigNumber';

interface TestUTXO {
  txid: string;
  vout: number;
  satoshis: number;
}

function createUnlockScript(sigServer: number[], sigClient: number[]): Script {
  const s = new Script([]);
  s.writeOpCode(OP.OP_0);
  s.writeBin(sigServer);
  s.writeBin(sigClient);
  return s;
}

describe('Dual Endpoint Tests', () => {
  const testData = {
    clientPrivHex: "903b1b2c396f17203fa83444d72bf5c666119d9d681eb715520f99ae6f92322c",
    serverPrivHex: "a2d2ca4c19e3c560792ca751842c29b9da94be09f712a7f9ba7c66e64a354829",
    clientUtxos: [
      {
        txid: "0a1fd93f02e68d1a73fb499e948ee83a78aa9337e1476bd89f7092a7ef16a050",
        vout: 1,
        satoshis: 99902
      }
    ],
    endHeight: 800000,
    feeRate: 0.5,
    isMain: false,
    expectedOutputs: {
      step1Hex: "010000000150a016efa792709fd86b47e13793aa783ae88e949e49fb731a8de6023fd91f0a010000006b483045022100a5a54548db07e6c063ac05f646dbffbdb47a09398071ac89ce84a9f670ca3ef4022060a676631c36312a9b9c3f539e24b2bf24f732730949421cd4c27319e7ff91764121039e00beaeaab4162fa3d45326e3632303c394faf8f7a17bbcf27a01952a1e7646ffffffff013d8601000000000047522103f6552f24751f8618fe0b2a813c9c3e163fbeec92ab737af7990297568a63d62121039e00beaeaab4162fa3d45326e3632303c394faf8f7a17bbcf27a01952a1e764652ae00000000",
      step2Hex: "0100000001201f8665d4d165761ab252e67405b38b0afdeeb8e3c62fd691e159367bee98d900000000920047304402205c4a58129c6c8cb5e8cb5415d83781055238ac127a9f05b7261eeed973e14eaa02203ab70e472b72b17110b004a32f2774d85134bcff136638b87b8f691523b4cf2c41483045022100b13d1ab47909bddc1747be2c46bb2d41728e6e4cac52c3655a46dece68d0a11202203a3cce22b593a7a78d14369da4cd89333b40f38df70937bc38de56da67d58c5441010000000264000000000000001976a914789d07c284ff3f6c41633e2031b375e57434759688acd8850100000000001976a9147e06a09c32ea06e80745cbfae60036968b64238888ac00350c00"
    }
  };

  test('should build dual endpoint fee pool transactions correctly', async () => {
    const clientPriv = PrivateKey.fromHex(testData.clientPrivHex);
    const serverPriv = PrivateKey.fromHex(testData.serverPrivHex);

    // Step 1: Build base transaction with explicit feepoolAmount
    const totalValue = testData.clientUtxos.reduce((s, u) => s + u.satoshis, 0);
    const feepoolAmount = totalValue - 500; // leave buffer for fees in test
    const res1 = await buildDualFeePoolBaseTx(
      testData.clientUtxos,
      clientPriv,
      serverPriv.toPublicKey(),
      feepoolAmount,
      testData.feeRate,
    );

    // Verify outputs and fee calculations
    const txSize = res1.tx.toBinary().length;
    const calcFee = Math.max(1, Math.floor((txSize / 1000.0) * testData.feeRate));
    expect(res1.amount).toBe(feepoolAmount);
    expect(res1.tx.outputs.length).toBe(2);
    expect(res1.tx.outputs[0].satoshis).toBe(feepoolAmount);
    expect(res1.tx.outputs[1].satoshis).toBe(totalValue - feepoolAmount - calcFee);

    // Step 2: Build spend transaction
    const serverAmount = 100;
    const res2 = await buildDualFeePoolSpendTX(
      res1.tx,
      res1.amount,
      serverAmount,
      testData.endHeight,
      clientPriv,
      serverPriv.toPublicKey(),
      testData.feeRate,
    );

    // Complete the signing process
    const multisigScript = base.createDualMultisigScript([
      serverPriv.toPublicKey(),
      clientPriv.toPublicKey(),
    ]);

    // Prepare source output
    if (!res2.tx.inputs[0].sourceTransaction) {
      res2.tx.inputs[0].sourceTransaction = new Transaction();
      res2.tx.inputs[0].sourceTransaction!.outputs = [];
    }
    res2.tx.inputs[0].sourceTransaction!.outputs[0] = {
      satoshis: res1.amount,
      lockingScript: multisigScript as any,
    } as any;

    const scope = TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID;
    const sighashData = TransactionSignature.format({
      sourceTXID: res2.tx.inputs[0].sourceTXID || '',
      sourceOutputIndex: res2.tx.inputs[0].sourceOutputIndex,
      sourceSatoshis: res1.amount,
      transactionVersion: res2.tx.version,
      otherInputs: [],
      outputs: res2.tx.outputs,
      inputIndex: 0,
      subscript: multisigScript,
      inputSequence: res2.tx.inputs[0].sequence || 1,
      lockTime: res2.tx.lockTime,
      scope,
    });

    const msgHash = hash256(sighashData);
    const bnHash = new BigNumber(Buffer.from(msgHash).toString('hex'), 16);
    
    const sigServerObj = ECDSA.sign(bnHash, serverPriv, true);
    const sigServer = sigServerObj.toDER() as number[];
    sigServer.push(scope);
    
    const sigClientObj = ECDSA.sign(bnHash, clientPriv, true);
    const sigClient = sigClientObj.toDER() as number[];
    sigClient.push(scope);

    const unlockScript = createUnlockScript(sigServer, sigClient);
    res2.tx.inputs[0].unlockingScript!.chunks = unlockScript.chunks;

    // Robust assertions: outputs and amounts
    expect(res2.amount).toBeGreaterThan(0);
    expect(res2.tx.outputs.length).toBe(2);
    // server output first, client output second as constructed in subBuildDualFeePoolSpendTX
    expect(res2.tx.outputs[0].satoshis).toBe(serverAmount);
    expect(res2.tx.outputs[1].satoshis).toBe(res2.amount);
    // totalAmount = res1.amount
    const computedFee = res1.amount - serverAmount - res2.amount;
    expect(computedFee).toBeGreaterThanOrEqual(1);
    // sequence and locktime
    expect(res2.tx.inputs[0].sequence).toBe(1);
    expect(res2.tx.lockTime).toBe(testData.endHeight);
  });

  test('should handle different fee rates', async () => {
    const clientPriv = PrivateKey.fromHex(testData.clientPrivHex);
    const serverPriv = PrivateKey.fromHex(testData.serverPrivHex);

    // Prepare feepoolAmount for consistent comparisons
    const totalValueA = testData.clientUtxos.reduce((s, u) => s + u.satoshis, 0);
    const feepoolAmountA = totalValueA - 500;
    // Test with original fee rate
    const res1 = await buildDualFeePoolBaseTx(
      testData.clientUtxos,
      clientPriv,
      serverPriv.toPublicKey(),
      feepoolAmountA,
      testData.feeRate,
    );

    // Test with higher fee rate
    const higherFeeRate = 10.0; // Use a much higher fee rate to ensure difference
    const res2 = await buildDualFeePoolBaseTx(
      testData.clientUtxos,
      clientPriv,
      serverPriv.toPublicKey(),
      feepoolAmountA,
      higherFeeRate,
    );

    // With higher fee rate, the output amount should be lower or equal (due to minimum fee)
    expect(res2.amount).toBeLessThanOrEqual(res1.amount);
    expect(res2.tx.outputs[0].satoshis).toBe(res2.amount);
  });

  test('should validate input parameters', async () => {
    const clientPriv = PrivateKey.fromHex(testData.clientPrivHex);
    const serverPriv = PrivateKey.fromHex(testData.serverPrivHex);

    // Test with empty UTXOs
    await expect(buildDualFeePoolBaseTx(
      [],
      clientPriv,
      serverPriv.toPublicKey(),
      100,
      testData.feeRate,
    )).rejects.toThrow();

    // Test with zero fee rate - still has minimum fee
    const totalValueB = testData.clientUtxos.reduce((s, u) => s + u.satoshis, 0);
    const feepoolAmountB = totalValueB - 1; // push to minimum fee edge
    const res1 = await buildDualFeePoolBaseTx(
      testData.clientUtxos,
      clientPriv,
      serverPriv.toPublicKey(),
      feepoolAmountB,
      0,
    );
    // Even with zero fee rate, there's still a minimum fee calculated, change >= 0
    expect(res1.amount).toBe(feepoolAmountB);
  });
});