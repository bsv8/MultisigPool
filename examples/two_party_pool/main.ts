import { PrivateKey } from '@bsv/sdk/primitives';
import { buildTwoPartyPoolFundingTx, buildTwoPartyPoolOpeningState, signTwoPartyPoolAsBuyer, signTwoPartyPoolAsSeller, mergeTwoPartyPoolBuyerSellerSignatures } from '../../src/two_party_pool';

const buyer = PrivateKey.fromHex('01'.padStart(64, '0'));
const seller = PrivateKey.fromHex('02'.padStart(64, '0'));
const roles = { buyer: buyer.toPublicKey(), seller: seller.toPublicKey() };
async function main(): Promise<void> {
  const funding = await buildTwoPartyPoolFundingTx([{ txid: 'aa'.repeat(32), vout: 0, satoshis: 20000 }], 19000, buyer, roles, 1);
  const state = await buildTwoPartyPoolOpeningState(funding.tx, funding.poolAmount, roles, 0, 1);
  const buyerSignature = signTwoPartyPoolAsBuyer(state, funding.poolAmount, roles, buyer);
  const sellerSignature = signTwoPartyPoolAsSeller(state, funding.poolAmount, roles, seller);
  const finalState = mergeTwoPartyPoolBuyerSellerSignatures(state, funding.poolAmount, roles, buyerSignature, sellerSignature);
  console.log(`Buyer/Seller 2-of-2 state: ${finalState.toHex()}`);
}

void main();
