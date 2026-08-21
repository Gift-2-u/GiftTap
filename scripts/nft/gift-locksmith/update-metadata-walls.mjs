/**
 * Upload new GiftLocksmith metadata (walls + Walk2u shoe) and point
 * Wave 1 CM hidden settings + existing Locksmith assets at it.
 *
 *   export CONFIRM_MAINNET=yes
 *   node update-metadata-walls.mjs
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  mplCore,
  updateV1,
  updateCollectionV1,
  fetchAssetV1,
} from '@metaplex-foundation/mpl-core';
import {
  mplCandyMachine,
  fetchCandyMachine,
  updateCandyMachine,
} from '@metaplex-foundation/mpl-core-candy-machine';
import {
  keypairIdentity,
  publicKey,
  some,
  none,
  transactionBuilder,
} from '@metaplex-foundation/umi';
import { setComputeUnitPrice, setComputeUnitLimit } from '@metaplex-foundation/mpl-toolbox';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import bs58 from 'bs58';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CANDY_MACHINE = 'AQbpmorxtBaaipqm4WcmCyBzci8Qf8km9qF8kAidsMkC';
const COLLECTION = 'FQPYWSohCPnS57W2AWAqwmQM21KRxGi4YXcCaiXUghPD';
const IMAGE_URI = 'https://gateway.irys.xyz/HXQ5D7Iu_vkgUsW4I6W7LQ0Vn3J5rTQJXkgxMwh28k4';
const RPC_URL =
  process.env.RPC_URL ||
  process.env.VITE_SOLANA_RPC_URL ||
  'https://api.mainnet-beta.solana.com';
const KEYPAIR_PATH =
  process.env.KEYPAIR_PATH ||
  path.join(os.homedir(), '.config', 'solana', 'id.json');
const CONFIRM = (process.env.CONFIRM_MAINNET || '').toLowerCase();

const ITEM_META = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'metadata.json'), 'utf8'),
);

const COLLECTION_META = {
  name: 'Gift2u Elves',
  symbol: 'ELVES',
  description:
    'Gift2u Elves — Gen 1 utility classes for Gift Tap. GiftLocksmith unlocks free wall climbs and Walk2u shoes. Max 5000 Locksmiths across 3 waves.',
  image: IMAGE_URI,
  external_url: 'https://gift2u.fun',
  properties: {
    category: 'image',
    files: [{ uri: IMAGE_URI, type: 'image/jpeg' }],
  },
};

function loadSecret() {
  return new Uint8Array(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8')));
}

function sigOf(result) {
  return typeof result.signature === 'string'
    ? result.signature
    : bs58.encode(result.signature);
}

async function heliusSearchLocksmiths(rpc) {
  const out = [];
  let page = 1;
  for (;;) {
    const res = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `ls-search-${page}`,
        method: 'searchAssets',
        params: {
          grouping: ['collection', COLLECTION],
          page,
          limit: 1000,
          displayOptions: { showCollectionMetadata: true },
        },
      }),
    });
    const json = await res.json();
    const items = json?.result?.items || [];
    if (!items.length) break;
    for (const a of items) {
      const attrs = a?.content?.metadata?.attributes || [];
      const cls = attrs.find(
        (x) =>
          String(x?.trait_type || x?.traitType || '').toLowerCase() === 'class',
      );
      const name = String(a?.content?.metadata?.name || '');
      const classVal = String(cls?.value || '').toLowerCase();
      const isLock =
        classVal.includes('locksmith') ||
        name.toLowerCase().includes('locksmith');
      if (isLock && a.id) out.push(a.id);
    }
    if (items.length < 1000) break;
    page += 1;
    if (page > 20) break;
  }
  return [...new Set(out)];
}

async function main() {
  if (CONFIRM !== 'yes') {
    console.error('Set CONFIRM_MAINNET=yes to run on mainnet.');
    process.exit(1);
  }

  console.log('=== GiftLocksmith metadata → walls / Walk2u shoe ===');
  const umi = createUmi(RPC_URL)
    .use(mplCore())
    .use(mplCandyMachine())
    .use(irysUploader());
  const kp = umi.eddsa.createKeypairFromSecretKey(loadSecret());
  umi.use(keypairIdentity(kp));
  console.log('Signer', umi.identity.publicKey.toString());
  console.log('RPC', RPC_URL.slice(0, 48));

  const sendOpts = {
    send: { skipPreflight: false, maxRetries: 5 },
    confirm: { commitment: 'confirmed' },
  };

  console.log('\n1) Upload item metadata…');
  const itemUri = await umi.uploader.uploadJson(ITEM_META);
  console.log('itemUri', itemUri);

  console.log('\n2) Upload collection metadata…');
  const collectionUri = await umi.uploader.uploadJson(COLLECTION_META);
  console.log('collectionUri', collectionUri);

  console.log('\n3) Update candy machine hidden settings URI…');
  const cm = publicKey(CANDY_MACHINE);
  const cmAccount = await fetchCandyMachine(umi, cm);
  const hash = new Uint8Array(
    crypto.createHash('sha256').update(itemUri).digest(),
  );
  const data = {
    itemsAvailable: BigInt(cmAccount.data.itemsAvailable),
    maxEditionSupply: BigInt(cmAccount.data.maxEditionSupply ?? 0),
    isMutable: true,
    configLineSettings: none(),
    hiddenSettings: some({
      name: 'GiftLocksmith #$ID+1$',
      uri: itemUri,
      hash,
    }),
  };
  const cmTx = await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 400_000 }))
    .add(setComputeUnitPrice(umi, { microLamports: 100_000 }))
    .add(
      updateCandyMachine(umi, {
        candyMachine: cm,
        data,
      }),
    )
    .sendAndConfirm(umi, sendOpts);
  console.log('CM tx', sigOf(cmTx));

  console.log('\n4) Update collection URI…');
  const colTx = await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 300_000 }))
    .add(setComputeUnitPrice(umi, { microLamports: 100_000 }))
    .add(
      updateCollectionV1(umi, {
        collection: publicKey(COLLECTION),
        newUri: collectionUri,
      }),
    )
    .sendAndConfirm(umi, sendOpts);
  console.log('Collection tx', sigOf(colTx));

  console.log('\n5) Update existing Locksmith assets…');
  const ids = await heliusSearchLocksmiths(RPC_URL);
  console.log('Found', ids.length, 'Locksmith assets');
  const assetTxs = [];
  for (const id of ids) {
    try {
      const asset = publicKey(id);
      // ensure fetch works
      await fetchAssetV1(umi, asset);
      const tx = await transactionBuilder()
        .add(setComputeUnitLimit(umi, { units: 300_000 }))
        .add(setComputeUnitPrice(umi, { microLamports: 80_000 }))
        .add(
          updateV1(umi, {
            asset,
            collection: publicKey(COLLECTION),
            newUri: some(itemUri),
          }),
        )
        .sendAndConfirm(umi, sendOpts);
      const sig = sigOf(tx);
      assetTxs.push({ id, sig });
      console.log(' updated', id.slice(0, 8) + '…', sig.slice(0, 12) + '…');
    } catch (e) {
      console.warn(' failed', id, e?.message || e);
      assetTxs.push({ id, error: String(e?.message || e) });
    }
  }

  const out = {
    itemUri,
    collectionUri,
    candyMachineTx: sigOf(cmTx),
    collectionTx: sigOf(colTx),
    assetsUpdated: assetTxs,
    updatedAt: new Date().toISOString(),
  };
  const outPath = path.join(__dirname, 'metadata-walls-update-result.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  const wave1Path = path.join(__dirname, 'wave1-result.json');
  if (fs.existsSync(wave1Path)) {
    const w = JSON.parse(fs.readFileSync(wave1Path, 'utf8'));
    w.itemUri = itemUri;
    w.collectionUri = collectionUri;
    w.metadataUpdatedAt = out.updatedAt;
    w.note =
      'Wave 1 live @ 0.10 SOL. Metadata: free wall climbs + Walk2u shoes.';
    fs.writeFileSync(wave1Path, JSON.stringify(w, null, 2));
  }

  console.log('\n✅ Done. Saved', outPath);
}

main().catch((e) => {
  console.error('❌', e?.message || e);
  if (e?.logs) console.error(e.logs);
  process.exit(1);
});
