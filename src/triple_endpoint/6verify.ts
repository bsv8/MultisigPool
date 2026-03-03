import { PublicKey } from '@bsv/sdk/primitives';
import Transaction from '@bsv/sdk/transaction/Transaction';
import Script from '@bsv/sdk/script/Script';
import LockingScript from '@bsv/sdk/script/LockingScript';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';
import MultiSig from '../libs/MULTISIG';
import { verifyInputSignature } from '../libs/VERIFY';

function makeTripleRedeem(server: PublicKey, a: PublicKey, escrow: PublicKey): LockingScript {
  return new MultiSig().lock([server, a, escrow], 2);
}

export function serverVerifyClientASig(
  tx: Transaction,
  totalAmount: number,
  serverPublicKey: PublicKey,
  aPublicKey: PublicKey,
  escrowPublicKey: PublicKey,
  aSignBytes: number[],
): boolean {
  const redeem = makeTripleRedeem(serverPublicKey, aPublicKey, escrowPublicKey);
  return verifyInputSignature({
    tx,
    inputIndex: 0,
    lockingScript: redeem as unknown as Script,
    sourceSatoshis: totalAmount,
    publicKey: aPublicKey,
    signatureBytes: aSignBytes,
    expectedSigHashFlag: TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID,
  });
}

export function clientVerifyServerSig(
  tx: Transaction,
  totalAmount: number,
  serverPublicKey: PublicKey,
  aPublicKey: PublicKey,
  escrowPublicKey: PublicKey,
  serverSignBytes: number[],
): boolean {
  const redeem = makeTripleRedeem(serverPublicKey, aPublicKey, escrowPublicKey);
  return verifyInputSignature({
    tx,
    inputIndex: 0,
    lockingScript: redeem as unknown as Script,
    sourceSatoshis: totalAmount,
    publicKey: serverPublicKey,
    signatureBytes: serverSignBytes,
    expectedSigHashFlag: TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID,
  });
}

export function serverVerifyClientBSig(
  tx: Transaction,
  totalAmount: number,
  serverPublicKey: PublicKey,
  aPublicKey: PublicKey,
  escrowPublicKey: PublicKey,
  bSignBytes: number[],
): boolean {
  const redeem = makeTripleRedeem(serverPublicKey, aPublicKey, escrowPublicKey);
  return verifyInputSignature({
    tx,
    inputIndex: 0,
    lockingScript: redeem as unknown as Script,
    sourceSatoshis: totalAmount,
    publicKey: escrowPublicKey,
    signatureBytes: bSignBytes,
    expectedSigHashFlag: TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID,
  });
}

