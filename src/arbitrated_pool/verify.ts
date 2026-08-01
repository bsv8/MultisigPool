import { PublicKey } from '@bsv/sdk/primitives';
import Transaction from '@bsv/sdk/transaction/Transaction';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';
import Script from '@bsv/sdk/script/Script';
import { verifyInputSignature } from '../libs/VERIFY';
import type { ArbitratedPoolRoles } from '../types';
import { buildArbitratedPoolLock, cloneArbitratedPoolTransaction, requireSource, validateArbitratedPoolRoles, validateArbitratedPoolStateOutputs } from './script';

function verify(state: Transaction, amount: number, roles: ArbitratedPoolRoles, key: PublicKey, signature: number[]): boolean { validateArbitratedPoolRoles(roles); if (!signature?.length) throw new Error('signature is required'); if (state.inputs.length !== 1 || state.inputs[0].unlockingScript?.toBinary().length) throw new Error('state must have an empty unlocking script'); validateArbitratedPoolStateOutputs(state, roles); const copy = cloneArbitratedPoolTransaction(state); const lock = buildArbitratedPoolLock(roles); requireSource(state, amount, lock); const source = new Transaction(); source.outputs = [{ satoshis: amount, lockingScript: lock }]; copy.inputs[0].sourceTransaction = source; const valid = verifyInputSignature({ tx: copy, inputIndex: 0, lockingScript: lock as unknown as Script, sourceSatoshis: amount, publicKey: key, signatureBytes: signature, expectedSigHashFlag: TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID }); if (!valid) throw new Error('signature verification failed'); return true; }
export function verifyArbitratedPoolBuyerSignature(state: Transaction, amount: number, roles: ArbitratedPoolRoles, signature: number[]): boolean { return verify(state, amount, roles, roles.buyer, signature); }
export function verifyArbitratedPoolSellerSignature(state: Transaction, amount: number, roles: ArbitratedPoolRoles, signature: number[]): boolean { return verify(state, amount, roles, roles.seller, signature); }
export function verifyArbitratedPoolArbiterSignature(state: Transaction, amount: number, roles: ArbitratedPoolRoles, signature: number[]): boolean { return verify(state, amount, roles, roles.arbiter, signature); }
