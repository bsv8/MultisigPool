import type { PublicKey } from '@bsv/sdk/primitives';
import LockingScript from '@bsv/sdk/script/LockingScript';
import type { ArbitratedPoolRoles } from '../types';
import MultiSig from '../libs/MULTISIG';
import P2PKH from '../libs/P2PKH';
import Transaction from '@bsv/sdk/transaction/Transaction';

function keyHex(key: PublicKey): string { return Buffer.from(key.encode(true) as number[]).toString('hex'); }
export function validateArbitratedPoolRoles(roles: ArbitratedPoolRoles): void { if (!roles?.buyer || !roles.seller || !roles.arbiter) throw new Error('buyer, seller and arbiter public keys are required'); const keys = [roles.buyer, roles.seller, roles.arbiter].map(keyHex); if (new Set(keys).size !== 3) throw new Error('buyer, seller and arbiter public keys must be different'); }
export function buildArbitratedPoolLock(roles: ArbitratedPoolRoles): LockingScript { validateArbitratedPoolRoles(roles); return new MultiSig().lock([roles.buyer, roles.seller, roles.arbiter], 2); }
export function cloneArbitratedPoolTransaction(tx: Transaction): Transaction { return new Transaction(tx.version, tx.inputs.map((input) => ({ ...input })), tx.outputs.map((output) => ({ ...output })), tx.lockTime, tx.metadata, tx.merklePath); }
export function requireSource(tx: Transaction, amount: number, lockingScript: LockingScript): void { const source = tx.inputs[0]?.sourceTransaction?.outputs[tx.inputs[0].sourceOutputIndex]; if (!source || source.satoshis !== amount || source.lockingScript.toHex() !== lockingScript.toHex()) throw new Error('state source output does not match configured pool'); }

export function buildArbitratedPoolOutputScripts(roles: ArbitratedPoolRoles): { buyer: LockingScript; seller: LockingScript; arbiter: LockingScript } {
  validateArbitratedPoolRoles(roles);
  return {
    buyer: new P2PKH().lock(roles.buyer),
    seller: new P2PKH().lock(roles.seller),
    arbiter: new P2PKH().lock(roles.arbiter),
  };
}

function readPushData(bytes: number[], offset: number): { length: number; next: number } | null {
  const opcode = bytes[offset];
  if (opcode === undefined) return null;
  if (opcode > 0 && opcode < 0x4c) return { length: opcode, next: offset + 1 };
  if (opcode === 0x4c && bytes[offset + 1] !== undefined) return { length: bytes[offset + 1], next: offset + 2 };
  if (opcode === 0x4d && bytes[offset + 2] !== undefined) return { length: bytes[offset + 1] | (bytes[offset + 2] << 8), next: offset + 3 };
  if (opcode === 0x4e && bytes[offset + 4] !== undefined) return {
    length: bytes[offset + 1] | (bytes[offset + 2] << 8) | (bytes[offset + 3] << 16) | (bytes[offset + 4] * 0x1000000),
    next: offset + 5,
  };
  return null;
}

export function isArbitratedPoolPaymentProofScript(script: LockingScript): boolean {
  const bytes = Array.from(script.toBinary());
  if (bytes.length < 3 || bytes[0] !== 0 || bytes[1] !== 0x6a) return false;
  const push = readPushData(bytes, 2);
  return push !== null && push.length > 0 && push.next + push.length === bytes.length;
}

export function validateArbitratedPoolStateOutputs(tx: Transaction, roles: ArbitratedPoolRoles): void {
  const outputScripts = buildArbitratedPoolOutputScripts(roles);
  if (tx.outputs.length !== 3 && tx.outputs.length !== 4) throw new Error('arbitrated pool state must have exactly three or four outputs');
  const expected = [outputScripts.buyer, outputScripts.seller, outputScripts.arbiter];
  for (let index = 0; index < expected.length; index += 1) {
    const output = tx.outputs[index];
    if (!output || output.satoshis === undefined || output.satoshis < 0 || !Number.isSafeInteger(output.satoshis) || output.lockingScript.toHex() !== expected[index].toHex()) {
      throw new Error(`arbitrated pool output ${index} does not match its role`);
    }
  }
  if (tx.outputs.length === 4) {
    const proof = tx.outputs[3];
    if (!proof || proof.satoshis !== 0 || !isArbitratedPoolPaymentProofScript(proof.lockingScript as LockingScript)) throw new Error('invalid payment proof output');
  }
}
