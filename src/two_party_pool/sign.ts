import { PrivateKey } from '@bsv/sdk/primitives';
import UnlockingScript from '@bsv/sdk/script/UnlockingScript';
import Transaction from '@bsv/sdk/transaction/Transaction';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';
import MultiSig from '../libs/MULTISIG';
import type { TwoPartyPoolRoles } from '../types';
import { buildTwoPartyPoolLock, cloneTransaction, requireSource, setSource, validateTwoPartyPoolRoles } from './script';
import { verifyTwoPartyPoolBuyerSignature, verifyTwoPartyPoolSellerSignature } from './verify';

function keyHex(key: { toString(): string }): string { return key.toString(); }
function validateKey(key: PrivateKey, expected: Parameters<typeof keyHex>[0], role: string): void { if (!key || keyHex(key.toPublicKey()) !== keyHex(expected)) throw new Error(`${role} private key does not match ${role} public key`); }
function sign(state: Transaction, poolAmount: number, roles: TwoPartyPoolRoles, key: PrivateKey, expected: Parameters<typeof keyHex>[0], role: string): number[] { validateTwoPartyPoolRoles(roles); validateKey(key, expected, role); if (state.inputs.length !== 1 || state.inputs[0].unlockingScript?.toBinary().length) throw new Error('state must have an empty unlocking script'); const lock = buildTwoPartyPoolLock(roles); requireSource(state, poolAmount, lock); const copy = cloneTransaction(state); setSource(copy, poolAmount, lock); return Array.from(new MultiSig().signOne(copy, 0, key, TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID)); }

export function signTwoPartyPoolAsBuyer(state: Transaction, poolAmount: number, roles: TwoPartyPoolRoles, key: PrivateKey): number[] { return sign(state, poolAmount, roles, key, roles.buyer, 'buyer'); }
export function signTwoPartyPoolAsSeller(state: Transaction, poolAmount: number, roles: TwoPartyPoolRoles, key: PrivateKey): number[] { return sign(state, poolAmount, roles, key, roles.seller, 'seller'); }

function merge(state: Transaction, poolAmount: number, roles: TwoPartyPoolRoles, buyer: number[], seller: number[]): Transaction {
  if (Buffer.from(buyer).equals(Buffer.from(seller))) throw new Error('duplicate signatures are not permitted');
  verifyTwoPartyPoolBuyerSignature(state, poolAmount, roles, buyer);
  verifyTwoPartyPoolSellerSignature(state, poolAmount, roles, seller);
  return attach(state, buyer, seller);
}
function attach(state: Transaction, buyer: number[], seller: number[]): Transaction { const copy = cloneTransaction(state); const script = MultiSig.buildSignScript([Buffer.from(buyer), Buffer.from(seller)]); const unlocking = new UnlockingScript(); unlocking.chunks = script.chunks; copy.inputs[0].unlockingScript = unlocking; return copy; }

import type ScriptChunk from '@bsv/sdk/script/ScriptChunk';
export function mergeTwoPartyPoolBuyerSellerSignatures(state: Transaction, poolAmount: number, roles: TwoPartyPoolRoles, buyer: number[], seller: number[]): Transaction { return merge(state, poolAmount, roles, buyer, seller); }
