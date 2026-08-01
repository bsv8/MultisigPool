import { PrivateKey } from '@bsv/sdk/primitives';
import { buildTwoPartyPoolFundingTx, buildTwoPartyPoolOpeningState, mergeTwoPartyPoolBuyerSellerSignatures, signTwoPartyPoolAsBuyer, signTwoPartyPoolAsSeller } from '../../src/two_party_pool';

const buyer = PrivateKey.fromHex('01'.padStart(64, '0'));
const seller = PrivateKey.fromHex('02'.padStart(64, '0'));
const roles = { buyer: buyer.toPublicKey(), seller: seller.toPublicKey() };

async function main(): Promise<void> {
  const funding = await buildTwoPartyPoolFundingTx([{ txid: 'aa'.repeat(32), vout: 0, satoshis: 20000 }], 19000, buyer, roles, 1);
  const state = await buildTwoPartyPoolOpeningState(funding.tx, funding.poolAmount, roles, 0, 1);
  const buyerSignature = signTwoPartyPoolAsBuyer(state, funding.poolAmount, roles, buyer);
  const sellerSignature = signTwoPartyPoolAsSeller(state, funding.poolAmount, roles, seller);
  const finalState = mergeTwoPartyPoolBuyerSellerSignatures(state, funding.poolAmount, roles, buyerSignature, sellerSignature);
  console.log(`LockHex ${state.inputs[0].sourceTransaction!.outputs[0].lockingScript.toHex()}`);
  console.log(`FundingHex ${funding.tx.toHex()}`);
  console.log(`StateHex ${state.toHex()}`);
  console.log(`BuyerSignatureHex ${Buffer.from(buyerSignature).toString('hex')}`);
  console.log(`SellerSignatureHex ${Buffer.from(sellerSignature).toString('hex')}`);
  console.log(`FinalHex ${finalState.toHex()}`);
}

void main();
