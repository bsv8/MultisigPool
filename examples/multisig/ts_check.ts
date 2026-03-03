import { readFileSync } from 'fs';
import { PrivateKey, PublicKey } from '@bsv/sdk/primitives';
import Script from '@bsv/sdk/script/Script';
import MultiSig from '../../src/libs/MULTISIG';

interface Output {
  pub_keys: string[];
  m: number;
  lock_script: string;
  fake_unlock: string;
}

const data: Output = JSON.parse(readFileSync(0, 'utf8'));

// Recreate public keys
const pubs: PublicKey[] = data.pub_keys.map((hex) => PublicKey.fromString(hex));

const ms = new MultiSig();
const lock = ms.lock(pubs, data.m);

if (lock.toHex() !== data.lock_script) {
  throw new Error('Lock script mismatch');
}

const fake = MultiSig.createFakeSign(data.m);
if (fake.toHex() !== data.fake_unlock) {
  throw new Error('Fake unlock script mismatch');
}

console.log('Go vs TS multisig logic: OK');
