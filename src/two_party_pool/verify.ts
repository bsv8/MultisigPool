import { PublicKey } from '@bsv/sdk/primitives';
import Transaction from '@bsv/sdk/transaction/Transaction';
import TransactionSignature from '@bsv/sdk/primitives/TransactionSignature';
import Script from '@bsv/sdk/script/Script';
import { verifyInputSignature } from '../libs/VERIFY';
import type { TwoPartyPoolRoles } from '../types';
import { buildTwoPartyPoolLock, cloneTransaction, requireSource, setSource, validateTwoPartyPoolRoles } from './script';

function verify(state: Transaction, poolAmount: number, roles: TwoPartyPoolRoles, key: PublicKey, signature: number[]): boolean { validateTwoPartyPoolRoles(roles); if (!signature?.length) throw new Error('signature is required'); const copy = cloneTransaction(state); const lock = buildTwoPartyPoolLock(roles); requireSource(state, poolAmount, lock); setSource(copy, poolAmount, lock); const valid = verifyInputSignature({ tx: copy, inputIndex: 0, lockingScript: lock as unknown as Script, sourceSatoshis: poolAmount, publicKey: key, signatureBytes: signature, expectedSigHashFlag: TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID }); if (!valid) throw new Error('signature verification failed'); return true; }
export function verifyTwoPartyPoolBuyerSignature(state: Transaction, poolAmount: number, roles: TwoPartyPoolRoles, signature: number[]): boolean { return verify(state, poolAmount, roles, roles.buyer, signature); }
export function verifyTwoPartyPoolSellerSignature(state: Transaction, poolAmount: number, roles: TwoPartyPoolRoles, signature: number[]): boolean { return verify(state, poolAmount, roles, roles.seller, signature); }
