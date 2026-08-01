import Transaction from '@bsv/sdk/transaction/Transaction';
import Script from '@bsv/sdk/script/Script';
import type ScriptChunk from '@bsv/sdk/script/ScriptChunk';
import LockingScript from '@bsv/sdk/script/LockingScript';
import UnlockingScript from '@bsv/sdk/script/UnlockingScript';
import P2PKH from '../libs/P2PKH';
import { buildOptionalOpReturnScript } from '../libs/OP_RETURN';
import { estimateSerializedTxSize } from '../libs/TX_SIZE';
import { Protocol, validatePoolProtocol, Version, type ArbitratedPoolRoles, type ArbitratedPoolStateInput } from '../types';
import { buildArbitratedPoolLock, requireSource, validateArbitratedPoolRoles } from './script';

function empty(): UnlockingScript { return new UnlockingScript(); }
function fake(): UnlockingScript { const script = new Script([]); script.writeOpCode(0); script.writeBin(new Array(73).fill(0)); script.writeBin(new Array(73).fill(0)); const unlocking = new UnlockingScript(); unlocking.chunks = script.chunks; return unlocking; }
function clone(tx: Transaction): Transaction { return new Transaction(tx.version, tx.inputs.map((input) => ({ ...input })), tx.outputs.map((output) => ({ ...output })), tx.lockTime, tx.metadata, tx.merklePath); }
function scripts(roles: ArbitratedPoolRoles): { buyer: LockingScript; seller: LockingScript } { validateArbitratedPoolRoles(roles); return { buyer: new P2PKH().lock(roles.buyer), seller: new P2PKH().lock(roles.seller) }; }
function stateFee(size: number, rate: number): number { if (rate < 0) throw new Error('invalid fee rate'); return Math.ceil((size * rate) / 1000); }

export async function buildArbitratedPoolState(input: ArbitratedPoolStateInput): Promise<Transaction> {
  validatePoolProtocol(input);
  if (!input.previousState || !Number.isSafeInteger(input.poolAmount) || input.poolAmount <= 0 || !Number.isSafeInteger(input.sellerAmount) || input.sellerAmount < 0) throw new Error('previous state and pool amount are required'); const state = clone(input.previousState); if (state.inputs.length !== 1 || (state.outputs.length !== 2 && state.outputs.length !== 3)) throw new Error('arbitrated pool state must have one input and two value outputs'); if (input.sequence <= (state.inputs[0].sequence ?? 0)) throw new Error('payment sequence must increase');
  const outputScripts = scripts(input.roles); if (state.outputs[0].lockingScript.toHex() !== outputScripts.buyer.toHex() || state.outputs[1].lockingScript.toHex() !== outputScripts.seller.toHex()) throw new Error('previous state outputs do not match buyer and seller roles');
  const lock = buildArbitratedPoolLock(input.roles); requireSource(state, input.poolAmount, lock); state.outputs[0].lockingScript = outputScripts.buyer; state.outputs[1].lockingScript = outputScripts.seller; if (input.sellerAmount > input.poolAmount) throw new Error('seller amount exceeds pool amount'); state.outputs[0].satoshis = input.poolAmount - input.sellerAmount; state.outputs[1].satoshis = input.sellerAmount; state.inputs[0].sequence = input.sequence; if (input.lockTime !== undefined) state.lockTime = input.lockTime;
  const proof = buildOptionalOpReturnScript(input.paymentProof); if (proof) { const outputScript = new LockingScript(); outputScript.chunks = proof.chunks; if (state.outputs.length === 3) state.outputs[2] = { lockingScript: outputScript, satoshis: 0 }; else state.addOutput({ lockingScript: outputScript, satoshis: 0 }); } state.inputs[0].unlockingScript = fake(); const fee = stateFee(estimateSerializedTxSize(state), input.feeRate); if (fee > state.outputs[0].satoshis) throw new Error('buyer balance is insufficient for fee'); state.outputs[0].satoshis -= fee; if (input.buyerAmount !== undefined && input.buyerAmount !== state.outputs[0].satoshis) throw new Error('buyer amount does not match canonical fee'); state.inputs[0].unlockingScript = empty(); return state;
}
export function buildArbitratedPoolOpeningState(fundingTx: Transaction, poolAmount: number, roles: ArbitratedPoolRoles, lockTime: number, feeRate: number): Promise<Transaction> { const state = new Transaction(); state.addInput({ sourceTransaction: fundingTx, sourceTXID: fundingTx.id('hex'), sourceOutputIndex: 0, sequence: 1, unlockingScript: empty() }); const outputScripts = scripts(roles); state.addOutput({ lockingScript: outputScripts.buyer, satoshis: poolAmount }); state.addOutput({ lockingScript: outputScripts.seller, satoshis: 0 }); state.lockTime = lockTime; return buildArbitratedPoolState({ protocol: Protocol, version: Version, previousState: state, sequence: 2, sellerAmount: 0, poolAmount, roles, feeRate }); }
export function buildArbitratedPoolFinalState(input: ArbitratedPoolStateInput): Promise<Transaction> { return buildArbitratedPoolState(input); }
