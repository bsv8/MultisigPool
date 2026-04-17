import { readFileSync } from 'fs';
import path from 'path';
import { PrivateKey } from '@bsv/sdk/primitives';

// Re-export high-level helpers from the pool implementation
import {
  tripleBuildFeePoolBaseTx,
  tripleBuildFeePoolSpendTX,
  tripleSpendTXFeePoolBSign,
  tripleFeePoolLoadArbitrationTx,
  tripleClientBFeePoolSpendTXUpdateSign,
  tripleServerFeePoolSpendTXUpdateSign,
  tripleMergeFeePoolSigForSpendTx,
} from '../../src/triple_endpoint';

interface FixtureUTXO {
  txid: string;
  vout: number;
  satoshis: number;
}
interface Fixture {
  clientPrivHex: string;
  serverPrivHex: string;
  escrowPrivHex: string;
  clientUtxos: FixtureUTXO[];
  feePerByte: number;
  endHeight: number;
  isMain: boolean;
  arbitration: {
    sequenceNumber: number;
    sellerAmount: number;
    arbiterFee: number;
    proofHex: string;
  };
}

/**
 * Read fixture.json that sits in the same directory as this runner.
 */
function loadFixture(): Fixture {
  const dir = path.resolve(__dirname);
  const data = readFileSync(path.join(dir, 'fixture.json'), 'utf8');
  return JSON.parse(data);
}

(async () => {
  const fixture = loadFixture();

  const clientPriv = PrivateKey.fromHex(fixture.clientPrivHex);
  const serverPriv = PrivateKey.fromHex(fixture.serverPrivHex);
  const escrowPriv = PrivateKey.fromHex(fixture.escrowPrivHex);

  const feeRate = fixture.feePerByte;
  const proofBytes = Uint8Array.from(Buffer.from(fixture.arbitration.proofHex, 'hex'));

  /* ------------------------------------------------------------------
   * Step-1  Build pool funding (base) transaction
   * ------------------------------------------------------------------ */
  const { tx: baseTx } = await tripleBuildFeePoolBaseTx(
    fixture.clientUtxos,
    serverPriv.toPublicKey(),      // server pubkey comes first per API
    clientPriv,                    // client private key (A-party)
    escrowPriv.toPublicKey(),      // third-party pubkey
    feeRate,
  );
  console.log('Step1Hex:', baseTx.toHex());

  /* ------------------------------------------------------------------
   * Step-2  Client constructs spend transaction (client side partially signed)
   * ------------------------------------------------------------------ */
  const poolValue = baseTx.outputs[0].satoshis as number;

  const spendResp = await tripleBuildFeePoolSpendTX(
    baseTx.id('hex'),              // previous txid
    poolValue,    // value locked in pool output
    fixture.endHeight,
    serverPriv.toPublicKey(),
    clientPriv,
    escrowPriv.toPublicKey(),
    feeRate,
  );

  const spendTx = spendResp.tx;
  const buyerSig = spendResp.clientSignBytes;

  /* ------------------------------------------------------------------
   * Step-3  Server adds its signature
   * ------------------------------------------------------------------ */
  const serverSig = await tripleSpendTXFeePoolBSign(
    spendTx,
    poolValue,                     // 使用原始池子金额（step1.Amount）而不是扣费后的金额
    serverPriv.toPublicKey(),
    clientPriv.toPublicKey(),
    escrowPriv.toPublicKey(),      // 传递 escrow 公钥而不是 server 私钥
    escrowPriv,                    // 使用 escrow 私钥进行签名，与 Go 保持一致
  );

  // 输出签名用于交叉比对
  console.log('BuyerSig:', Buffer.from(buyerSig).toString('hex'));
  console.log('SellerSig:', Buffer.from(serverSig).toString('hex'));

  /* ------------------------------------------------------------------
   * Step-4  仲裁更新交易（卖方金额 + 仲裁费 + OP_RETURN 证据）
   * ------------------------------------------------------------------ */
  const arbitrationTx = await tripleFeePoolLoadArbitrationTx(
    spendTx,
    serverPriv.toPublicKey(),
    clientPriv.toPublicKey(),
    escrowPriv.toPublicKey(),
    poolValue,
    fixture.arbitration.arbiterFee,
    undefined,
    fixture.arbitration.sequenceNumber,
    fixture.arbitration.sellerAmount,
    proofBytes,
  );
  console.log('ArbitrationTxHex:', arbitrationTx.toHex());

  /* ------------------------------------------------------------------
   * Step-5  仲裁者签名
   * ------------------------------------------------------------------ */
  const arbiterSig = await tripleServerFeePoolSpendTXUpdateSign(
    arbitrationTx,
    serverPriv,
    clientPriv.toPublicKey(),
    escrowPriv.toPublicKey(),
  );
  console.log('ArbiterSig:', Buffer.from(arbiterSig).toString('hex'));

  /* ------------------------------------------------------------------
   * Step-6  卖方确认后签名
   * ------------------------------------------------------------------ */
  const sellerArbSig = await tripleClientBFeePoolSpendTXUpdateSign(
    arbitrationTx,
    serverPriv.toPublicKey(),
    clientPriv.toPublicKey(),
    escrowPriv
  );
  console.log('SellerArbSig:', Buffer.from(sellerArbSig).toString('hex'));

  /* ------------------------------------------------------------------
   * Step-7  合成最终可广播交易
   * ------------------------------------------------------------------ */
  const finalArbitrationTx = tripleMergeFeePoolSigForSpendTx(arbitrationTx, arbiterSig, sellerArbSig);
  console.log('FinalArbitrationHex:', finalArbitrationTx.toHex());
})();
