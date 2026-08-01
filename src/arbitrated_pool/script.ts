import type { PublicKey } from '@bsv/sdk/primitives';
import LockingScript from '@bsv/sdk/script/LockingScript';
import type { ArbitratedPoolRoles } from '../types';
import MultiSig from '../libs/MULTISIG';
import Transaction from '@bsv/sdk/transaction/Transaction';

function keyHex(key: PublicKey): string { return Buffer.from(key.encode(true) as number[]).toString('hex'); }
export function validateArbitratedPoolRoles(roles: ArbitratedPoolRoles): void { if (!roles?.buyer || !roles.seller || !roles.arbiter) throw new Error('buyer, seller and arbiter public keys are required'); const keys = [roles.buyer, roles.seller, roles.arbiter].map(keyHex); if (new Set(keys).size !== 3) throw new Error('buyer, seller and arbiter public keys must be different'); }
export function buildArbitratedPoolLock(roles: ArbitratedPoolRoles): LockingScript { validateArbitratedPoolRoles(roles); return new MultiSig().lock([roles.buyer, roles.seller, roles.arbiter], 2); }
export function cloneArbitratedPoolTransaction(tx: Transaction): Transaction { return new Transaction(tx.version, tx.inputs.map((input) => ({ ...input })), tx.outputs.map((output) => ({ ...output })), tx.lockTime, tx.metadata, tx.merklePath); }
export function requireSource(tx: Transaction, amount: number, lockingScript: LockingScript): void { const source = tx.inputs[0]?.sourceTransaction?.outputs[tx.inputs[0].sourceOutputIndex]; if (!source || source.satoshis !== amount || source.lockingScript.toHex() !== lockingScript.toHex()) throw new Error('state source output does not match configured pool'); }
