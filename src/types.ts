import type Transaction from '@bsv/sdk/transaction/Transaction';
import type { PublicKey } from '@bsv/sdk/primitives';

import { Protocol, Version } from './version';

export { Protocol, ProtocolVersion, Version, ReleaseVersion } from './version';

export interface PoolProtocolMetadata {
  readonly protocol: typeof Protocol;
  readonly version: typeof Version;
}

export function validatePoolProtocol(metadata: { readonly protocol?: string; readonly version?: number } | undefined): asserts metadata is PoolProtocolMetadata {
  if (metadata?.protocol !== Protocol || metadata.version !== Version) {
    throw new Error(`unsupported pool protocol: expected ${Protocol} v${Version}`);
  }
}

export interface UTXO {
  readonly txid: string;
  readonly vout: number;
  readonly satoshis: number;
}

export interface TwoPartyPoolRoles {
  readonly buyer: PublicKey;
  readonly seller: PublicKey;
}

export interface ArbitratedPoolRoles {
  readonly buyer: PublicKey;
  readonly seller: PublicKey;
  readonly arbiter: PublicKey;
}

export interface FundingTxResult {
  readonly tx: Transaction;
  readonly poolAmount: number;
  readonly poolOutputIndex: number;
  readonly fee: number;
  readonly protocol: typeof Protocol;
  readonly version: typeof Version;
}

export interface TwoPartyPoolStateInput {
  readonly protocol: string;
  readonly version: number;
  readonly previousState: Transaction;
  readonly sequence: number;
  readonly lockTime?: number;
  readonly buyerAmount?: number;
  readonly sellerAmount: number;
  readonly poolAmount: number;
  readonly roles: TwoPartyPoolRoles;
  readonly feeRate: number;
  readonly paymentProof?: Uint8Array | number[] | null;
}

export interface ArbitratedPoolStateInput {
  readonly protocol: string;
  readonly version: number;
  readonly previousState: Transaction;
  readonly sequence: number;
  readonly lockTime?: number;
  readonly buyerAmount?: number;
  readonly sellerAmount: number;
  readonly poolAmount: number;
  readonly roles: ArbitratedPoolRoles;
  readonly feeRate: number;
  readonly paymentProof?: Uint8Array | number[] | null;
}
