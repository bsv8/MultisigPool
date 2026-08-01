import { PrivateKey } from '@bsv/sdk/primitives';
import Transaction from '@bsv/sdk/transaction/Transaction';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';
import UnlockingScript from '@bsv/sdk/script/UnlockingScript';
import type ScriptChunk from '@bsv/sdk/script/ScriptChunk';
import MultiSig from '../libs/MULTISIG';
import type { ArbitratedPoolRoles } from '../types';
import { buildArbitratedPoolLock, cloneArbitratedPoolTransaction, requireSource, validateArbitratedPoolRoles } from './script';
import { verifyArbitratedPoolArbiterSignature, verifyArbitratedPoolBuyerSignature, verifyArbitratedPoolSellerSignature } from './verify';

function clone(tx: Transaction): Transaction { return cloneArbitratedPoolTransaction(tx); }
function keyMatch(key: PrivateKey, expected: { toString(): string }, role: string): void { if (!key || key.toPublicKey().toString() !== expected.toString()) throw new Error(`${role} private key does not match ${role} public key`); }
function sign(state: Transaction, amount: number, roles: ArbitratedPoolRoles, key: PrivateKey, expected: { toString(): string }, role: string): number[] { validateArbitratedPoolRoles(roles); keyMatch(key, expected, role); if (state.inputs.length !== 1 || state.inputs[0].unlockingScript?.toBinary().length) throw new Error('state must have an empty unlocking script'); const lock = buildArbitratedPoolLock(roles); requireSource(state, amount, lock); const copy = clone(state); const source = new Transaction(); source.outputs = [{ satoshis: amount, lockingScript: lock }]; copy.inputs[0].sourceTransaction = source; return Array.from(new MultiSig().signOne(copy, 0, key, TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID)); }
export function signArbitratedPoolAsBuyer(state: Transaction, amount: number, roles: ArbitratedPoolRoles, key: PrivateKey): number[] { return sign(state, amount, roles, key, roles.buyer, 'buyer'); }
export function signArbitratedPoolAsSeller(state: Transaction, amount: number, roles: ArbitratedPoolRoles, key: PrivateKey): number[] { return sign(state, amount, roles, key, roles.seller, 'seller'); }
export function signArbitratedPoolAsArbiter(state: Transaction, amount: number, roles: ArbitratedPoolRoles, key: PrivateKey): number[] { return sign(state, amount, roles, key, roles.arbiter, 'arbiter'); }
function attach(state: Transaction, first: number[], second: number[]): Transaction { if (Buffer.from(first).equals(Buffer.from(second))) throw new Error('duplicate signatures are not permitted'); const copy = clone(state); const script = MultiSig.buildSignScript([Buffer.from(first), Buffer.from(second)]); const unlocking = new UnlockingScript(); unlocking.chunks = script.chunks; copy.inputs[0].unlockingScript = unlocking; return copy; }
function rejectDuplicate(first: number[], second: number[]): void { if (Buffer.from(first).equals(Buffer.from(second))) throw new Error('duplicate signatures are not permitted'); }
export function mergeArbitratedPoolBuyerSellerSignatures(state: Transaction, amount: number, roles: ArbitratedPoolRoles, buyer: number[], seller: number[]): Transaction { rejectDuplicate(buyer, seller); verifyArbitratedPoolBuyerSignature(state, amount, roles, buyer); verifyArbitratedPoolSellerSignature(state, amount, roles, seller); return attach(state, buyer, seller); }
export function mergeArbitratedPoolBuyerArbiterSignatures(state: Transaction, amount: number, roles: ArbitratedPoolRoles, buyer: number[], arbiter: number[]): Transaction { rejectDuplicate(buyer, arbiter); verifyArbitratedPoolBuyerSignature(state, amount, roles, buyer); verifyArbitratedPoolArbiterSignature(state, amount, roles, arbiter); return attach(state, buyer, arbiter); }
export function mergeArbitratedPoolSellerArbiterSignatures(state: Transaction, amount: number, roles: ArbitratedPoolRoles, seller: number[], arbiter: number[]): Transaction { rejectDuplicate(seller, arbiter); verifyArbitratedPoolSellerSignature(state, amount, roles, seller); verifyArbitratedPoolArbiterSignature(state, amount, roles, arbiter); return attach(state, seller, arbiter); }
