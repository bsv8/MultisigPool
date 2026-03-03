import fs from 'fs';
import path from 'path';
import { PrivateKey, PublicKey } from '@bsv/sdk/primitives';
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

interface FixtureUTXO {
  txid: string;
  vout: number;
  satoshis: number;
}
interface Fixture {
  clientPrivHex: string;
  serverPrivHex: string;
  clientUtxos: FixtureUTXO[];
  endHeight: number;
  feeRate: number;
  isMain: boolean;
}

function createUnlockScript(sigServer: number[], sigClient: number[]): Script {
  const s = new Script([]);
  s.writeOpCode(OP.OP_0);
  s.writeBin(sigServer);
  s.writeBin(sigClient);
  return s;
}

(async () => {
  const fixturePath = path.resolve(__dirname, 'fixture.json');
  const raw = fs.readFileSync(fixturePath, 'utf-8');
  const f: Fixture = JSON.parse(raw);

  const clientPriv = PrivateKey.fromHex(f.clientPrivHex);
  const serverPriv = PrivateKey.fromHex(f.serverPrivHex);

  // Step1
  // compute feepoolAmount from fixture utxos - keep small buffer
  let total = 0;
  for (const u of f.clientUtxos) {
    total += u.satoshis;
  }
  let feepoolAmount = 0;
  if (total > 500) {
    feepoolAmount = total - 500;
  } else {
    feepoolAmount = total;
  }

  const res1 = await buildDualFeePoolBaseTx(
    f.clientUtxos,
    clientPriv,
    serverPriv.toPublicKey(),
    feepoolAmount,
    f.feeRate,
  );

  // Step2 (without final unlock)
  const serverAmount = 100;
  const res2 = await buildDualFeePoolSpendTX(
    res1.tx,
    res1.amount,
    serverAmount,
    f.endHeight,
    clientPriv,
    serverPriv.toPublicKey(),
    f.feeRate,
  );

  // sign with both priv keys
  // const multisigScript = base.createDualMultisigScript([
  //   serverPriv.toPublicKey(),
  //   clientPriv.toPublicKey(),
  // ]);

  // // prepare source output
  // if (!res2.tx.inputs[0].sourceTransaction) {
  //   res2.tx.inputs[0].sourceTransaction = new Transaction();
  //   res2.tx.inputs[0].sourceTransaction!.outputs = [];
  // }
  // res2.tx.inputs[0].sourceTransaction!.outputs[0] = {
  //   satoshis: res1.amount,
  //   lockingScript: multisigScript as any,
  // } as any;

  // const scope = TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID;
  // const sighashData = TransactionSignature.format({
  //   sourceTXID: res2.tx.inputs[0].sourceTXID || '',
  //   sourceOutputIndex: res2.tx.inputs[0].sourceOutputIndex,
  //   sourceSatoshis: res1.amount,
  //   transactionVersion: res2.tx.version,
  //   otherInputs: [],
  //   outputs: res2.tx.outputs,
  //   inputIndex: 0,
  //   subscript: multisigScript,
  //   inputSequence: res2.tx.inputs[0].sequence || 1,
  //   lockTime: res2.tx.lockTime,
  //   scope,
  // });

  // console.log('TS sighash:', Buffer.from(sighashData).toString('hex'));

  // const msgHash = hash256(sighashData);
  // console.log('TS sighash32:', msgHash.toString('hex'));
  // const bnHash = new BigNumber(Buffer.from(msgHash).toString('hex'), 16);
  // const sigServerObj = ECDSA.sign(bnHash, serverPriv, true);
  // const sigServer = sigServerObj.toDER() as number[];
  // sigServer.push(scope);
  // const sigClientObj = ECDSA.sign(bnHash, clientPriv, true);
  // const sigClient = sigClientObj.toDER() as number[];
  // sigClient.push(scope);

  // const unlockScript = createUnlockScript(sigServer, sigClient);
  // res2.tx.inputs[0].unlockingScript!.chunks = unlockScript.chunks;

  console.log('Step1Hex', res1.tx.toHex());
  console.log('Step2Hex', Buffer.from(res2.clientSignBytes).toString('hex'));

  // Step3 Server sign
  const { spendTXServerSign } = await import('../../src/dual_endpoint/3server_sign');
  const serverSignBytes = spendTXServerSign(
    res2.tx,
    res1.amount,
    serverPriv,
    clientPriv.toPublicKey(),
  );

  console.log('Step3Hex', Buffer.from(serverSignBytes).toString('hex'));

  // Step4 Client update and re-sign
  const { loadTx, clientDualFeePoolSpendTXUpdateSign } = await import('../../src/dual_endpoint/4client_spend_tx_update');
  const newServerAmount = 150; // 修改服务器金额
  const newSequenceNumber = 2;  // 修改序列号
  
  const updatedTx = loadTx(
    res2.tx.toHex(),
    undefined, // locktime
    newSequenceNumber,
    newServerAmount,
    serverPriv.toPublicKey(),
    clientPriv.toPublicKey(),
    res1.amount
  );

  const clientUpdateSignBytes = clientDualFeePoolSpendTXUpdateSign(
    updatedTx,
    clientPriv,
    serverPriv.toPublicKey()
  );

  console.log('Step4Hex', Buffer.from(clientUpdateSignBytes).toString('hex'));

  // Step5 Server update sign
  const { serverDualFeePoolSpendTXUpdateSign } = await import('../../src/dual_endpoint/5server_sign_update');
  const serverUpdateSignBytes = serverDualFeePoolSpendTXUpdateSign(
    updatedTx,
    serverPriv,
    clientPriv.toPublicKey()
  );

  console.log('Step5Hex', Buffer.from(serverUpdateSignBytes).toString('hex'));
})();
