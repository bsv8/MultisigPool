import * as fs from 'fs';
import * as path from 'path';
import { PrivateKey } from '@bsv/sdk/primitives';
import { buildDualFeePoolBaseTx, buildDualFeePoolSpendTX } from '../../src/dual_endpoint';

interface UTXO { 
  txid: string; 
  vout: number; 
  satoshis: number; 
}

interface Fixture {
  clientPrivHex: string;
  serverPrivHex: string;
  clientUtxos: UTXO[];
  endHeight: number;
  feeRate: number;
  isMain: boolean;
}

async function main() {
  const fixture: Fixture = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, './fixture.json'), 'utf-8'),
  );

  const clientPriv = PrivateKey.fromHex(fixture.clientPrivHex);
  const serverPriv = PrivateKey.fromHex(fixture.serverPrivHex);

  // Step-1
  // Calculate feepoolAmount: use total inputs - small buffer for fees
  const totalValue = fixture.clientUtxos.reduce((sum, utxo) => sum + utxo.satoshis, 0);
  const feepoolAmount = totalValue > 500 ? totalValue - 500 : totalValue;

  const res1 = await buildDualFeePoolBaseTx(
    fixture.clientUtxos,
    clientPriv,
    serverPriv.toPublicKey(),
    feepoolAmount,
    fixture.feeRate,
  );

  // Step-2
  const res2 = await buildDualFeePoolSpendTX(
    res1.tx,
    res1.amount,
    100, // server amount (hardcoded like Go version)
    fixture.endHeight,
    clientPriv,
    serverPriv.toPublicKey(),
    fixture.feeRate,
  );

  // Output results for comparison
  console.log(`Step1 - TxID: ${res1.tx.id('hex')}`);
  console.log(`Step1 - Amount: ${res1.amount}`);
  console.log(`Step1 - Index: ${res1.index}`);
  console.log(`Step1 - Hex: ${res1.tx.toHex()}`);
  console.log(`Step2 - TxID: ${res2.tx.id('hex')}`);
  console.log(`Step2 - Amount: ${res2.amount}`);
  console.log(`Step2 - ClientSignBytes: ${Buffer.from(res2.clientSignBytes).toString('hex')}`);
  console.log(`Step2 - Hex: ${res2.tx.toHex()}`);
}

main().catch(console.error); 