import Transaction from '@bsv/sdk/transaction/Transaction';
import Script from '@bsv/sdk/script/Script';
import LockingScript from '@bsv/sdk/script/LockingScript';
import UnlockingScript from '@bsv/sdk/script/UnlockingScript';
import { buildOptionalOpReturnScript } from '../libs/OP_RETURN';
import { estimateSerializedTxSize } from '../libs/TX_SIZE';
import { Protocol, validatePoolProtocol, Version, type ArbitratedPoolRoles, type ArbitratedPoolStateInput } from '../types';
import {
  buildArbitratedPoolLock,
  buildArbitratedPoolOutputScripts,
  cloneArbitratedPoolTransaction,
  requireSource,
  validateArbitratedPoolRoles,
  validateArbitratedPoolStateOutputs,
} from './script';

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

function empty(): UnlockingScript { return new UnlockingScript(); }

function fake(): UnlockingScript {
  const script = new Script([]);
  script.writeOpCode(0);
  script.writeBin(new Array(73).fill(0));
  script.writeBin(new Array(73).fill(0));
  const unlocking = new UnlockingScript();
  unlocking.chunks = script.chunks;
  return unlocking;
}

function assertSafeInteger(name: string, value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be a safe integer`);
}

function assertAmount(name: string, value: unknown, positive = false): asserts value is number {
  assertSafeInteger(name, value);
  if ((positive && value <= 0) || (!positive && value < 0)) throw new Error(`${name} must not be negative`);
}

function assertStateInput(input: ArbitratedPoolStateInput): void {
  validatePoolProtocol(input);
  assertAmount('pool amount', input.poolAmount, true);
  assertAmount('seller amount', input.sellerAmount);
  assertAmount('arbiter amount', input.arbiterAmount);
  assertSafeInteger('sequence', input.sequence);
  if (input.sequence < 0 || input.sequence > 0xffffffff) throw new Error('sequence must be a uint32');
  assertSafeInteger('fee rate', input.feeRate);
  if (input.feeRate < 0) throw new Error('fee rate must not be negative');
  if (input.lockTime !== undefined) {
    assertSafeInteger('lock time', input.lockTime);
    if (input.lockTime < 0 || input.lockTime > 0xffffffff) throw new Error('lock time must be a uint32');
  }
  if (input.buyerAmount !== undefined) assertAmount('buyer amount', input.buyerAmount);
  validateArbitratedPoolRoles(input.roles);
}

function checkedAllocation(sellerAmount: number, arbiterAmount: number, poolAmount: number): number {
  if (sellerAmount > MAX_SAFE - arbiterAmount) throw new Error('allocated amount overflow');
  const allocatedAmount = sellerAmount + arbiterAmount;
  if (allocatedAmount > poolAmount) throw new Error('allocated amount exceeds pool amount');
  return allocatedAmount;
}

function checkedFee(size: number, rate: number): number {
  if (size < 0 || !Number.isSafeInteger(size)) throw new Error('serialized transaction size is invalid');
  if (rate === 0) return 0;
  if (size > Math.floor((MAX_SAFE - 999) / rate)) throw new Error('transaction fee overflow');
  const product = size * rate;
  if (product > MAX_SAFE - 999) throw new Error('transaction fee overflow');
  return Math.floor((product + 999) / 1000);
}

function clone(tx: Transaction): Transaction { return cloneArbitratedPoolTransaction(tx); }

export async function buildArbitratedPoolState(input: ArbitratedPoolStateInput): Promise<Transaction> {
  assertStateInput(input);
  if (!input.previousState) throw new Error('previous state is required');
  const state = clone(input.previousState);
  if (state.inputs.length !== 1 || !state.inputs[0]) throw new Error('arbitrated pool state must have exactly one input');
  validateArbitratedPoolStateOutputs(state, input.roles);
  if (input.sequence <= (state.inputs[0].sequence ?? 0)) throw new Error('payment sequence must increase');

  const lock = buildArbitratedPoolLock(input.roles);
  requireSource(state, input.poolAmount, lock);
  const outputScripts = buildArbitratedPoolOutputScripts(input.roles);
  const allocatedAmount = checkedAllocation(input.sellerAmount, input.arbiterAmount, input.poolAmount);
  const buyerBeforeFee = input.poolAmount - allocatedAmount;

  state.outputs[0].lockingScript = outputScripts.buyer;
  state.outputs[1].lockingScript = outputScripts.seller;
  state.outputs[2].lockingScript = outputScripts.arbiter;
  state.outputs[0].satoshis = buyerBeforeFee;
  state.outputs[1].satoshis = input.sellerAmount;
  state.outputs[2].satoshis = input.arbiterAmount;
  state.inputs[0].sequence = input.sequence;
  if (input.lockTime !== undefined) state.lockTime = input.lockTime;

  const proof = buildOptionalOpReturnScript(input.paymentProof);
  if (proof) {
    const outputScript = new LockingScript();
    outputScript.chunks = proof.chunks;
    if (state.outputs.length === 4) state.outputs[3] = { lockingScript: outputScript, satoshis: 0 };
    else state.addOutput({ lockingScript: outputScript, satoshis: 0 });
  }

  state.inputs[0].unlockingScript = fake();
  const fee = checkedFee(estimateSerializedTxSize(state), input.feeRate);
  if (fee > state.outputs[0].satoshis) throw new Error('buyer balance is insufficient for fee');
  state.outputs[0].satoshis -= fee;
  if (input.buyerAmount !== undefined && input.buyerAmount !== state.outputs[0].satoshis) throw new Error('buyer amount does not match canonical fee');
  state.inputs[0].unlockingScript = empty();
  return state;
}

export function buildArbitratedPoolOpeningState(fundingTx: Transaction, poolAmount: number, roles: ArbitratedPoolRoles, lockTime: number, feeRate: number): Promise<Transaction> {
  if (!fundingTx || fundingTx.outputs.length === 0) throw new Error('funding transaction is required');
  const state = new Transaction();
  state.addInput({ sourceTransaction: fundingTx, sourceTXID: fundingTx.id('hex'), sourceOutputIndex: 0, sequence: 1, unlockingScript: empty() });
  const outputScripts = buildArbitratedPoolOutputScripts(roles);
  state.addOutput({ lockingScript: outputScripts.buyer, satoshis: poolAmount });
  state.addOutput({ lockingScript: outputScripts.seller, satoshis: 0 });
  state.addOutput({ lockingScript: outputScripts.arbiter, satoshis: 0 });
  state.lockTime = lockTime;
  return buildArbitratedPoolState({ protocol: Protocol, version: Version, previousState: state, sequence: 2, sellerAmount: 0, arbiterAmount: 0, poolAmount, roles, feeRate });
}

export function buildArbitratedPoolFinalState(input: ArbitratedPoolStateInput): Promise<Transaction> { return buildArbitratedPoolState(input); }
