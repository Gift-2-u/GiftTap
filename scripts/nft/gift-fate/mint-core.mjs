/**
 * Mint ONE Fate test asset (Metaplex Core) — same flow as GiftLocksmith.
 *
 *   export CONFIRM_MAINNET=yes
 *   export RPC_URL="https://mainnet.helius-rpc.com/?api-key=..."
 *   export RARITY=legendary   # common | rare | epic | legendary
 *   node mint-core.mjs
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  create,
  mplCore,
  ruleSet,
  fetchCollection,
} from '@metaplex-foundation/mpl-core';
import {
  createGenericFile,
  generateSigner,
  keypairIdentity,
  publicKey,
} from '@metaplex-foundation/umi';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import bs58 from 'bs58';
import {
  FATE_RARITIES,
  ROYALTY_BPS,
  FATE_TREASURY,
  GIFT2U_ELVES_COLLECTION,
} from './config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLUSTER = process.env.CLUSTER || 'mainnet';
const CONFIRM = (process.env.CONFIRM_MAINNET || '').toLowerCase();
const RARITY = (process.env.RARITY || 'legendary').toLowerCase();
const RPC_URL =
  process.env.RPC_URL ||
  process.env.VITE_SOLANA_RPC_URL ||
  'https://api.mainnet-beta.solana.com';
const KEYPAIR_PATH =
  process.env.KEYPAIR_PATH ||
  path.join(os.homedir(), '.config', 'solana', 'id.json');

function loadSecret() {
  if (!fs.existsSync(KEYPAIR_PATH)) {
    throw new Error(`Keypair not found: ${KEYPAIR_PATH}`);
  }
  const raw = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'));
  if (!Array.isArray(raw)) throw new Error('Keypair must be Solana CLI JSON array');
  return new Uint8Array(raw);
}

async function main() {
  if (CLUSTER === 'mainnet' && CONFIRM !== 'yes') {
    console.error('Set CONFIRM_MAINNET=yes to mint on mainnet.');
    process.exit(1);
  }
  const r = FATE_RARITIES[RARITY];
  if (!r) {
    console.error('RARITY must be common|rare|epic|legendary');
    process.exit(1);
  }

  // Prefer rarity-bordered art (Common grey / Rare blue / Epic purple / Legendary gold)
  let imagePath = path.join(__dirname, `Fate-${RARITY}.jpg`);
  if (!fs.existsSync(imagePath)) {
    imagePath = path.join(__dirname, 'Fate.jpg');
  }
  if (!fs.existsSync(imagePath)) throw new Error(`Missing ${imagePath}`);

  const metaPath = path.join(__dirname, `metadata-${RARITY}.json`);
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

  console.log('=== Fate test mint (Metaplex Core) ===');
  console.log('Rarity:', r.label);
  console.log('Image: ', path.basename(imagePath));
  console.log('RPC:   ', RPC_URL.replace(/api-key=[^&]+/i, 'api-key=***'));

  const umi = createUmi(RPC_URL).use(mplCore());
  umi.use(
    irysUploader({
      address:
        CLUSTER === 'mainnet'
          ? 'https://node1.irys.xyz'
          : 'https://devnet.irys.xyz',
    }),
  );
  const kp = umi.eddsa.createKeypairFromSecretKey(loadSecret());
  umi.use(keypairIdentity(kp));
  const creator = publicKey(umi.identity.publicKey);
  console.log('Wallet:', umi.identity.publicKey);

  console.log('\nUploading image…');
  const imageFile = createGenericFile(
    fs.readFileSync(imagePath),
    path.basename(imagePath),
    {
      contentType: 'image/jpeg',
    },
  );
  const [imageUri] = await umi.uploader.upload([imageFile]);
  console.log('Image URI:', imageUri);

  const fullMeta = {
    ...meta,
    image: imageUri,
    properties: {
      category: 'image',
      files: [{ uri: imageUri, type: 'image/jpeg' }],
    },
  };
  console.log('Uploading metadata…');
  const uri = await umi.uploader.uploadJson(fullMeta);
  console.log('URI:', uri);

  const asset = generateSigner(umi);
  // MUST pass full CollectionV1 (fetchCollection) — a bare publicKey is ignored
  // by mpl-core create() (it reads collection.publicKey), so ME shows no collection.
  const collection = await fetchCollection(umi, GIFT2U_ELVES_COLLECTION);
  const royaltyReceiver = publicKey(FATE_TREASURY || umi.identity.publicKey);

  console.log('\nCreating Core asset…');
  console.log('Collection:', collection.publicKey.toString());
  console.log('Collection name:', collection.name);
  console.log('Royalties:', ROYALTY_BPS, 'bps (5%) →', royaltyReceiver.toString());

  // Link into Gift2u Elves collection + asset-level 5% royalties on every mint
  // (including this first Common — same rule as Locksmith / future CM mints).
  const tx = await create(umi, {
    asset,
    name: meta.name || 'Fate',
    uri,
    collection,
    plugins: [
      {
        type: 'Royalties',
        basisPoints: ROYALTY_BPS,
        creators: [{ address: royaltyReceiver, percentage: 100 }],
        ruleSet: ruleSet('None'),
      },
    ],
  }).sendAndConfirm(umi);

  const signature =
    typeof tx.signature === 'string' ? tx.signature : bs58.encode(tx.signature);

  const out = {
    standard: 'metaplex-core',
    class: 'Fate',
    rarity: r.label,
    asset: asset.publicKey.toString(),
    owner: umi.identity.publicKey.toString(),
    collection: GIFT2U_ELVES_COLLECTION,
    royaltiesBps: ROYALTY_BPS,
    royaltyReceiver: royaltyReceiver.toString(),
    imageUri,
    uri,
    signature,
    treasuryHint: FATE_TREASURY,
    cluster: CLUSTER,
    explorer: `https://solscan.io/token/${asset.publicKey.toString()}`,
    coreExplorer: `https://core.metaplex.com/explorer/${asset.publicKey.toString()}`,
    collectionExplorer: `https://core.metaplex.com/explorer/${GIFT2U_ELVES_COLLECTION}`,
  };
  fs.writeFileSync(
    path.join(__dirname, 'mint-result.json'),
    JSON.stringify(out, null, 2),
  );
  console.log('\nDone → mint-result.json');
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
