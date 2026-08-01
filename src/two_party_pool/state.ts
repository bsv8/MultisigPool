import Transaction from '@bsv/sdk/transaction/Transaction';
import LockingScript from '@bsv/sdk/script/LockingScript';
import P2PKH from '../libs/P2PKH';
import { buildOptionalOpReturnScript } from '../libs/OP_RETURN';
import { estimateSerializedTxSize } from '../libs/TX_SIZE';
import { Protocol, validatePoolProtocol, Version, type TwoPartyPoolRoles, type TwoPartyPoolStateInput } from '../types';
import { buildTwoPartyPoolLock, cloneTransaction, emptyUnlockingScript, fakeTwoPartyUnlockingScript, requireSource, validateTwoPartyPoolRoles } from './script';

function fee(size: number, rate: number): number { if (size < 0 || rate < 0) throw new Error('invalid fee parameters'); const value = Math.ceil((size * rate) / 1000); return value; }

function stateScripts(roles: TwoPartyPoolRoles): { buyer: LockingScript; seller: LockingScript } { validateTwoPartyPoolRoles(roles); return { buyer: new P2PKH().lock(roles.buyer), seller: new P2PKH().lock(roles.seller) }; }

export async function buildTwoPartyPoolState(input: TwoPartyPoolStateInput): Promise<Transaction> {
  validatePoolProtocol(input);
  if (!input.previousState || !Number.isSafeInteger(input.poolAmount) || input.poolAmount <= 0 || !Number.isSafeInteger(input.sellerAmount) || input.sellerAmount < 0) throw new Error('previous state and pool amount are required');
  const state = cloneTransaction(input.previousState);
  if (state.inputs.length !== 1 || (state.outputs.length !== 2 && state.outputs.length !== 3)) throw new Error('two-party pool state must have one input and two value outputs');
  if (input.sequence <= (state.inputs[0].sequence ?? 0)) throw new Error('payment sequence must increase');
  const scripts = stateScripts(input.roles);
  if (state.outputs[0].lockingScript.toHex() !== scripts.buyer.toHex() || state.outputs[1].lockingScript.toHex() !== scripts.seller.toHex()) throw new Error('previous state outputs do not match buyer and seller roles');
  const lock = buildTwoPartyPoolLock(input.roles);
  requireSource(state, input.poolAmount, lock);
  state.outputs[0].lockingScript = scripts.buyer;
  state.outputs[1].lockingScript = scripts.seller;
  state.outputs[0].satoshis = input.poolAmount - input.sellerAmount;
  state.outputs[1].satoshis = input.sellerAmount;
  state.inputs[0].sequence = input.sequence;
  if (input.lockTime !== undefined) state.lockTime = input.lockTime;
  const proof = buildOptionalOpReturnScript(input.paymentProof);
  if (proof) { const outputScript = new LockingScript(); outputScript.chunks = proof.chunks; if (state.outputs.length === 3) state.outputs[2] = { lockingScript: outputScript, satoshis: 0 }; else state.addOutput({ lockingScript: outputScript, satoshis: 0 }); }
  state.inputs[0].unlockingScript = fakeTwoPartyUnlockingScript();
  const stateFee = fee(estimateSerializedTxSize(state), input.feeRate);
  if (stateFee > state.outputs[0].satoshis) throw new Error('buyer balance is insufficient for fee');
  state.outputs[0].satoshis -= stateFee;
  if (input.buyerAmount !== undefined && input.buyerAmount !== state.outputs[0].satoshis) throw new Error('buyer amount does not match canonical fee');
  state.inputs[0].unlockingScript = emptyUnlockingScript();
  return state;
}

export function buildTwoPartyPoolOpeningState(fundingTx: Transaction, poolAmount: number, roles: TwoPartyPoolRoles, lockTime: number, feeRate: number): Promise<Transaction> {
  const state = new Transaction();
  state.addInput({ sourceTransaction: fundingTx, sourceTXID: fundingTx.id('hex'), sourceOutputIndex: 0, sequence: 1, unlockingScript: emptyUnlockingScript() });
  const scripts = stateScripts(roles);
  state.addOutput({ lockingScript: scripts.buyer, satoshis: poolAmount });
  state.addOutput({ lockingScript: scripts.seller, satoshis: 0 });
  state.lockTime = lockTime;
  return buildTwoPartyPoolState({ protocol: Protocol, version: Version, previousState: state, sequence: 2, sellerAmount: 0, poolAmount, roles, feeRate });
}
