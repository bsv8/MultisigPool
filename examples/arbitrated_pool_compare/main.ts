import { PrivateKey } from '@bsv/sdk/primitives';
import { buildArbitratedPoolFundingTx, buildArbitratedPoolOpeningState, signArbitratedPoolAsBuyer, signArbitratedPoolAsSeller, signArbitratedPoolAsArbiter, mergeArbitratedPoolBuyerSellerSignatures, mergeArbitratedPoolBuyerArbiterSignatures, mergeArbitratedPoolSellerArbiterSignatures } from '../../src/arbitrated_pool';

const buyer = PrivateKey.fromHex('01'.padStart(64, '0'));
const seller = PrivateKey.fromHex('02'.padStart(64, '0'));
const arbiter = PrivateKey.fromHex('03'.padStart(64, '0'));
const roles = { buyer: buyer.toPublicKey(), seller: seller.toPublicKey(), arbiter: arbiter.toPublicKey() };
async function main(): Promise<void> {
  const funding = await buildArbitratedPoolFundingTx([{ txid: 'bb'.repeat(32), vout: 0, satoshis: 30000 }], 29000, buyer, roles, 1);
  const state = await buildArbitratedPoolOpeningState(funding.tx, funding.poolAmount, roles, 0, 1);
  const buyerSignature = signArbitratedPoolAsBuyer(state, funding.poolAmount, roles, buyer);
  const sellerSignature = signArbitratedPoolAsSeller(state, funding.poolAmount, roles, seller);
  const arbiterSignature = signArbitratedPoolAsArbiter(state, funding.poolAmount, roles, arbiter);
  mergeArbitratedPoolBuyerSellerSignatures(state, funding.poolAmount, roles, buyerSignature, sellerSignature);
  mergeArbitratedPoolBuyerArbiterSignatures(state, funding.poolAmount, roles, buyerSignature, arbiterSignature);
  const finalState = mergeArbitratedPoolSellerArbiterSignatures(state, funding.poolAmount, roles, sellerSignature, arbiterSignature);
  console.log(`Buyer/Seller/Arbiter 2-of-3 state: ${finalState.toHex()}`);
}

void main();
