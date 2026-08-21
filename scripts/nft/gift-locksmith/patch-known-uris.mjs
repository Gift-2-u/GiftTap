import fs from 'fs';
import os from 'os';
import path from 'path';
import bs58 from 'bs58';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore, updateV1, fetchAssetV1 } from '@metaplex-foundation/mpl-core';
import {
  keypairIdentity,
  publicKey,
  some,
  transactionBuilder,
} from '@metaplex-foundation/umi';
import {
  setComputeUnitPrice,
  setComputeUnitLimit,
} from '@metaplex-foundation/mpl-toolbox';

const RPC = process.env.RPC_URL || process.env.VITE_SOLANA_RPC_URL;
const ITEM =
  'https://gateway.irys.xyz/5nS9GNZN7388HPiohoCJo63Uh7eGyoi4H7VcuBes5qLh';
const COLLECTION = 'FQPYWSohCPnS57W2AWAqwmQM21KRxGi4YXcCaiXUghPD';
const ids = [
  'Fsx9L4oS9pG4P4t338DwUtQpLX7oQTsxgGvK1JmTe3Tt',
  'D6CYXgSVrs8JVazWU8qAvS8Hvg3CT1B218QAUXamFsBc',
];

const umi = createUmi(RPC).use(mplCore());
const secret = new Uint8Array(
  JSON.parse(
    fs.readFileSync(path.join(os.homedir(), '.config/solana/id.json'), 'utf8'),
  ),
);
umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secret)));

for (const id of ids) {
  try {
    const asset = publicKey(id);
    const a = await fetchAssetV1(umi, asset);
    console.log(id.slice(0, 8), 'uri', a.uri);
    if (a.uri === ITEM) {
      console.log(' already new');
      continue;
    }
    const tx = await transactionBuilder()
      .add(setComputeUnitLimit(umi, { units: 300000 }))
      .add(setComputeUnitPrice(umi, { microLamports: 80000 }))
      .add(
        updateV1(umi, {
          asset,
          collection: publicKey(COLLECTION),
          newUri: some(ITEM),
        }),
      )
      .sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
    const sig =
      typeof tx.signature === 'string'
        ? tx.signature
        : bs58.encode(tx.signature);
    console.log(' updated', sig);
  } catch (e) {
    console.warn('fail', id, e.message || e);
  }
}
