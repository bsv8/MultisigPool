import { readFileSync } from 'fs';
import path from 'path';
import { PrivateKey } from '@bsv/sdk/primitives';
import { buildDualFeePoolBaseTx, buildDualFeePoolSpendTXWithProof } from '../../src/dual_endpoint';
import { tripleBuildFeePoolBaseTx, tripleBuildFeePoolSpendTXWithProof } from '../../src/triple_endpoint';

interface UtxoFixture {
  txid: string;
  vout: number;
  satoshis: number;
}

interface Fixture {
  paymentProofHex: string;
  dual: {
    clientPrivHex: string;
    serverPrivHex: string;
    clientUtxos: UtxoFixture[];
    endHeight: number;
    feeRate: number;
    isMain: boolean;
    serverAmount: number;
    feepoolAmount: number;
  };
  triple: {
    clientPrivHex: string;
    serverPrivHex: string;
    escrowPrivHex: string;
    clientUtxos: UtxoFixture[];
    feeRate: number;
    isMain: boolean;
  };
}

function loadFixture(): Fixture {
  const fixturePath = path.resolve(__dirname, 'fixture.json');
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture;
}

(async () => {
  const fixture = loadFixture();
  const proof = Uint8Array.from(Buffer.from(fixture.paymentProofHex, 'hex'));

  const dualClientPriv = PrivateKey.fromHex(fixture.dual.clientPrivHex);
  const dualServerPriv = PrivateKey.fromHex(fixture.dual.serverPrivHex);
  const dualBase = await buildDualFeePoolBaseTx(
    fixture.dual.clientUtxos,
    dualClientPriv,
    dualServerPriv.toPublicKey(),
    fixture.dual.feepoolAmount,
    fixture.dual.feeRate,
  );
  const dualSpend = await buildDualFeePoolSpendTXWithProof(
    dualBase.tx,
    dualBase.amount,
    fixture.dual.serverAmount,
    fixture.dual.endHeight,
    dualClientPriv,
    dualServerPriv.toPublicKey(),
    fixture.dual.feeRate,
    proof,
  );
  console.log(`DualOutputCount: ${dualSpend.tx.outputs.length}`);
  console.log(`DualProofScriptHex: ${dualSpend.tx.outputs[dualSpend.tx.outputs.length - 1].lockingScript.toHex()}`);
  console.log(`DualClientAmount: ${dualSpend.amount}`);

  const tripleClientPriv = PrivateKey.fromHex(fixture.triple.clientPrivHex);
  const tripleServerPriv = PrivateKey.fromHex(fixture.triple.serverPrivHex);
  const tripleEscrowPriv = PrivateKey.fromHex(fixture.triple.escrowPrivHex);
  const tripleBase = await tripleBuildFeePoolBaseTx(
    fixture.triple.clientUtxos,
    tripleServerPriv.toPublicKey(),
    tripleClientPriv,
    tripleEscrowPriv.toPublicKey(),
    fixture.triple.feeRate,
  );
  const poolValue = tripleBase.tx.outputs[0].satoshis as number;
  const tripleSpend = await tripleBuildFeePoolSpendTXWithProof(
    tripleBase.tx.id('hex'),
    poolValue,
    0,
    tripleServerPriv.toPublicKey(),
    tripleClientPriv,
    tripleEscrowPriv.toPublicKey(),
    fixture.triple.feeRate,
    proof,
  );
  console.log(`TripleOutputCount: ${tripleSpend.tx.outputs.length}`);
  console.log(`TripleProofScriptHex: ${tripleSpend.tx.outputs[tripleSpend.tx.outputs.length - 1].lockingScript.toHex()}`);
  console.log(`TripleClientAmount: ${tripleSpend.amount}`);
})();
