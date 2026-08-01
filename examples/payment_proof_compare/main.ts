import { buildOptionalOpReturnScript } from '../../src/libs/OP_RETURN';

console.log(`Buyer/Seller payment proof: ${buildOptionalOpReturnScript(Uint8Array.from([0, 1, 255]))?.toHex()}`);
