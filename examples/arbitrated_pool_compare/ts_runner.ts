import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrivateKey } from '@bsv/sdk/primitives';
import { buildArbitratedPoolFundingTx, buildArbitratedPoolLock, buildArbitratedPoolOpeningState, buildArbitratedPoolState, mergeArbitratedPoolBuyerArbiterSignatures, mergeArbitratedPoolBuyerSellerSignatures, mergeArbitratedPoolSellerArbiterSignatures, signArbitratedPoolAsArbiter, signArbitratedPoolAsBuyer, signArbitratedPoolAsSeller } from '../../src/arbitrated_pool';
import { Protocol, Version } from '../../src/version';

type Fixture = {
  protocol: string;
  version: number;
  feeRate: number;
  buyerPrivHex: string;
  sellerPrivHex: string;
  arbiterPrivHex: string;
  buyerUtxos: { txid: string; vout: number; satoshis: number }[];
  poolAmount: number;
  lockTime: number;
  negotiationSequence: number;
  negotiationSellerAmount: number;
  negotiationArbiterAmount: number;
  paidArbiterSequence: number;
  paidArbiterSellerAmount: number;
  paidArbiterAmount: number;
  proofSequence: number;
  proofSellerAmount: number;
  proofArbiterAmount: number;
  paymentProofHex: string;
};

const fixture = JSON.parse(readFileSync(resolve(__dirname, '../../testdata/arbitrated_pool_v4_fixture.json'), 'utf8')) as Fixture;
if (fixture.protocol !== Protocol || fixture.version !== Version) throw new Error('fixture protocol does not match v4');
const buyer = PrivateKey.fromHex(fixture.buyerPrivHex);
const seller = PrivateKey.fromHex(fixture.sellerPrivHex);
const arbiter = PrivateKey.fromHex(fixture.arbiterPrivHex);
const roles = { buyer: buyer.toPublicKey(), seller: seller.toPublicKey(), arbiter: arbiter.toPublicKey() };

const main = async (): Promise<void> => {
  const funding = await buildArbitratedPoolFundingTx(fixture.buyerUtxos, fixture.poolAmount, buyer, roles, fixture.feeRate);
  const opening = await buildArbitratedPoolOpeningState(funding.tx, funding.poolAmount, roles, fixture.lockTime, fixture.feeRate);
  const build = (previousState: typeof opening, sequence: number, sellerAmount: number, arbiterAmount: number, paymentProof?: number[]) => buildArbitratedPoolState({ protocol: fixture.protocol, version: fixture.version, previousState, sequence, sellerAmount, arbiterAmount, poolAmount: funding.poolAmount, roles, feeRate: fixture.feeRate, paymentProof });
  const negotiation = await build(opening, fixture.negotiationSequence, fixture.negotiationSellerAmount, fixture.negotiationArbiterAmount);
  const paidArbiter = await build(negotiation, fixture.paidArbiterSequence, fixture.paidArbiterSellerAmount, fixture.paidArbiterAmount);
  const proofState = await build(paidArbiter, fixture.proofSequence, fixture.proofSellerAmount, fixture.proofArbiterAmount, Array.from(Buffer.from(fixture.paymentProofHex, 'hex')));
  const buyerSignature = signArbitratedPoolAsBuyer(paidArbiter, funding.poolAmount, roles, buyer);
  const sellerSignature = signArbitratedPoolAsSeller(paidArbiter, funding.poolAmount, roles, seller);
  const arbiterSignature = signArbitratedPoolAsArbiter(paidArbiter, funding.poolAmount, roles, arbiter);
  const finalBuyerSeller = mergeArbitratedPoolBuyerSellerSignatures(paidArbiter, funding.poolAmount, roles, buyerSignature, sellerSignature);
  const finalBuyerArbiter = mergeArbitratedPoolBuyerArbiterSignatures(paidArbiter, funding.poolAmount, roles, buyerSignature, arbiterSignature);
  const finalSellerArbiter = mergeArbitratedPoolSellerArbiterSignatures(paidArbiter, funding.poolAmount, roles, sellerSignature, arbiterSignature);
  const values: Record<string, string> = {
    LockHex: buildArbitratedPoolLock(roles).toHex(), FundingHex: funding.tx.toHex(), FundingTxID: funding.tx.id('hex'),
    OpeningStateHex: opening.toHex(), OpeningStateTxID: opening.id('hex'), NegotiationStateHex: negotiation.toHex(), NegotiationStateTxID: negotiation.id('hex'),
    PaidArbiterStateHex: paidArbiter.toHex(), PaidArbiterStateTxID: paidArbiter.id('hex'), ProofStateHex: proofState.toHex(), ProofStateTxID: proofState.id('hex'),
    BuyerSignatureHex: Buffer.from(buyerSignature).toString('hex'), SellerSignatureHex: Buffer.from(sellerSignature).toString('hex'), ArbiterSignatureHex: Buffer.from(arbiterSignature).toString('hex'),
    FinalBuyerSellerHex: finalBuyerSeller.toHex(), FinalBuyerArbiterHex: finalBuyerArbiter.toHex(), FinalSellerArbiterHex: finalSellerArbiter.toHex(),
  };
  for (const [key, value] of Object.entries(values)) console.log(`${key} ${value}`);
};

void main();
