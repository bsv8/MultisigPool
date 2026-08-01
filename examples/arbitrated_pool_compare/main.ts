import { PrivateKey } from '@bsv/sdk/primitives';
import { buildArbitratedPoolFundingTx, buildArbitratedPoolOpeningState, buildArbitratedPoolState, signArbitratedPoolAsBuyer, signArbitratedPoolAsSeller, signArbitratedPoolAsArbiter, mergeArbitratedPoolBuyerSellerSignatures, mergeArbitratedPoolBuyerArbiterSignatures, mergeArbitratedPoolSellerArbiterSignatures } from '../../src/arbitrated_pool';

const buyer = PrivateKey.fromHex('01'.padStart(64, '0'));
const seller = PrivateKey.fromHex('02'.padStart(64, '0'));
const arbiter = PrivateKey.fromHex('03'.padStart(64, '0'));
const roles = { buyer: buyer.toPublicKey(), seller: seller.toPublicKey(), arbiter: arbiter.toPublicKey() };
async function main(): Promise<void> {
  const funding = await buildArbitratedPoolFundingTx([{ txid: 'bb'.repeat(32), vout: 0, satoshis: 30000 }], 29000, buyer, roles, 1);
  const state = await buildArbitratedPoolOpeningState(funding.tx, funding.poolAmount, roles, 0, 1);
  const paidState = await buildArbitratedPoolState({ protocol: 'bitfs.pool.v4', version: 4, previousState: state, sequence: 3, sellerAmount: 200, arbiterAmount: 100, poolAmount: funding.poolAmount, roles, feeRate: 1 });
  const buyerSignature = signArbitratedPoolAsBuyer(paidState, funding.poolAmount, roles, buyer);
  const sellerSignature = signArbitratedPoolAsSeller(paidState, funding.poolAmount, roles, seller);
  const arbiterSignature = signArbitratedPoolAsArbiter(paidState, funding.poolAmount, roles, arbiter);
  mergeArbitratedPoolBuyerSellerSignatures(paidState, funding.poolAmount, roles, buyerSignature, sellerSignature);
  mergeArbitratedPoolBuyerArbiterSignatures(paidState, funding.poolAmount, roles, buyerSignature, arbiterSignature);
  const finalState = mergeArbitratedPoolSellerArbiterSignatures(paidState, funding.poolAmount, roles, sellerSignature, arbiterSignature);
  console.log(`BuyerAmount ${paidState.outputs[0].satoshis}`);
  console.log(`SellerAmount ${paidState.outputs[1].satoshis}`);
  console.log(`ArbiterAmount ${paidState.outputs[2].satoshis}`);
  console.log(`Buyer/Seller/Arbiter 2-of-3 state: ${finalState.toHex()}`);
}

void main();
