import type { PublicKey } from '@bsv/sdk/primitives';
import Transaction from '@bsv/sdk/transaction/Transaction';
import Script from '@bsv/sdk/script/Script';
import LockingScript from '@bsv/sdk/script/LockingScript';
import OP from '@bsv/sdk/script/OP';
import type { TwoPartyPoolRoles } from '../types';
import MultiSig from '../libs/MULTISIG';

function keyHex(key: PublicKey): string { return Buffer.from(key.encode(true) as number[]).toString('hex'); }

export function validateTwoPartyPoolRoles(roles: TwoPartyPoolRoles): void {
  if (!roles?.buyer || !roles.seller) throw new Error('buyer and seller public keys are required');
  if (keyHex(roles.buyer) === keyHex(roles.seller)) throw new Error('buyer and seller public keys must be different');
}

export function buildTwoPartyPoolLock(roles: TwoPartyPoolRoles): LockingScript {
  validateTwoPartyPoolRoles(roles);
  return new MultiSig().lock([roles.buyer, roles.seller], 2);
}

export function createTwoPartyPoolLockingScript(roles: TwoPartyPoolRoles): Script { return buildTwoPartyPoolLock(roles); }

export function cloneTransaction(tx: Transaction): Transaction {
  return new Transaction(
    tx.version,
    tx.inputs.map((input) => ({ ...input })),
    tx.outputs.map((output) => ({ ...output })),
    tx.lockTime,
    tx.metadata,
    tx.merklePath,
  );
}

export function setSource(tx: Transaction, amount: number, lockingScript: LockingScript): void {
  if (tx.inputs.length !== 1) throw new Error('pool transaction must have exactly one input');
  const source = new Transaction();
  source.outputs = [{ satoshis: amount, lockingScript }];
  tx.inputs[0].sourceTransaction = source;
}

export function requireSource(tx: Transaction, amount: number, lockingScript: LockingScript): void {
  const source = tx.inputs[0]?.sourceTransaction?.outputs[tx.inputs[0].sourceOutputIndex];
  if (!source || source.satoshis !== amount || source.lockingScript.toHex() !== lockingScript.toHex()) throw new Error('state source output does not match configured pool');
}

export function emptyUnlockingScript(): UnlockingScript {
  return new UnlockingScript();
}

export function fakeTwoPartyUnlockingScript(): UnlockingScript {
  const script = new Script([]);
  script.writeOpCode(OP.OP_0);
  for (let i = 0; i < 2; i += 1) script.writeBin(new Array(73).fill(0));
  const unlocking = new UnlockingScript();
  unlocking.chunks = script.chunks;
  return unlocking;
}

import UnlockingScript from '@bsv/sdk/script/UnlockingScript';
import type ScriptChunk from '@bsv/sdk/script/ScriptChunk';
