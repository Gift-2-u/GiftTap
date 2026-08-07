/**
 * Create Core Collection + Core Candy Machine Wave 1
 *   500 items @ 0.25 SOL (hidden settings = same art/metadata for all)
 *
 *   export CONFIRM_MAINNET=yes
 *   export RPC_URL="..."
 *   node setup-wave1.mjs
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  createCollection,
  mplCore,
  ruleSet,
} from '@metaplex-foundation/mpl-core';
import {
  createCandyMachine,
  createCandyGuard,
  wrap,
  mplCandyMachine,
  findCandyGuardPda,
} from '@metaplex-foundation/mpl-core-candy-machine';
import {
  createGenericFile,
  generateSigner,
  keypairIdentity,
  publicKey,
  some,
  sol,
  transactionBuilder,
} from '@metaplex-foundation/umi';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import bs58 from 'bs58';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WAVE = 1;
const ITEMS = 500;
const PRICE_SOL = 0.25;

const CLUSTER = process.env.CLUSTER || 'mainnet';
const CONFIRM = (process.env.CONFIRM_MAINNET || '').toLowerCase();
const RPC_URL =
  process.env.RPC_URL ||
  process.env.VITE_SOLANA_RPC_URL ||
  'https://api.mainnet-beta.solana.com';
const KEYPAIR_PATH =
  process.env.KEYPAIR_PATH ||
  path.join(os.homedir(), '.config', 'solana', 'id.json');

function loadSecret() {
  const raw = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'));
  return new Uint8Array(raw);
}

function sigOf(result) {
  return typeof result.signature === 'string'
    ? result.signature
    : bs58.encode(result.signature);
}

async function main() {
  if (CLUSTER === 'mainnet' && CONFIRM !== 'yes') {
    console.error('Set CONFIRM_MAINNET=yes to run on mainnet.');
    process.exit(1);
  }

  const mintResultPath = path.join(__dirname, 'mint-result.json');
  const prior = fs.existsSync(mintResultPath)
    ? JSON.parse(fs.readFileSync(mintResultPath, 'utf8'))
    : {};

  const imagePath = path.join(__dirname, 'GiftLocksmith.jpg');
  if (!fs.existsSync(imagePath)) throw new Error('Missing GiftLocksmith.jpg');

  console.log('=== GiftLocksmith Wave 1 setup (Metaplex Core) ===');
  console.log('Items:', ITEMS, '| Price:', PRICE_SOL, 'SOL');
  console.log('RPC:  ', RPC_URL.replace(/api-key=[^&]+/i, 'api-key=***'));

  const umi = createUmi(RPC_URL).use(mplCore()).use(mplCandyMachine());
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
  const treasury = publicKey(umi.identity.publicKey);
  console.log('Authority / treasury:', umi.identity.publicKey);

  const partialPath = path.join(__dirname, 'wave1-partial.json');
  const partial = fs.existsSync(partialPath)
    ? JSON.parse(fs.readFileSync(partialPath, 'utf8'))
    : {};

  // --- Image / metadata (reuse uploads if present) ---
  let imageUri = partial.imageUri || prior.imageUri;
  if (!imageUri) {
    console.log('\nUploading image…');
    const imageFile = createGenericFile(
      fs.readFileSync(imagePath),
      'GiftLocksmith.jpg',
      { contentType: 'image/jpeg' },
    );
    [imageUri] = await umi.uploader.upload([imageFile]);
  }
  console.log('Image URI:', imageUri);

  let collectionUri = partial.collectionUri;
  if (!collectionUri) {
    const collectionMeta = {
      name: 'Gift2u Elves',
      symbol: 'ELVES',
      description:
        'Gift2u Elves — Gen 1 utility classes for Gift Tap. GiftLocksmith unlocks better G2Ushard → $G2U swap terms and vault APY. Max 5000 Locksmiths across 3 waves.',
      image: imageUri,
      external_url: 'https://gift2u.fun',
      properties: {
        category: 'image',
        files: [{ uri: imageUri, type: 'image/jpeg' }],
      },
    };
    console.log('\nUploading collection metadata…');
    collectionUri = await umi.uploader.uploadJson(collectionMeta);
  }
  console.log('Collection URI:', collectionUri);

  let itemUri = partial.itemUri;
  if (!itemUri) {
    const itemMeta = {
      name: 'GiftLocksmith',
      symbol: 'Locksmith',
      description:
        'GiftLocksmith unlocks the G2Ushard → $G2U swap and access to the Gift2u vault for improved APY. Gift2u Elves Gen 1 — Wave 1 of 3 (max 5000).',
      image: imageUri,
      external_url: 'https://gift2u.fun',
      attributes: [
        { trait_type: 'Collection', value: 'Gift2u Elves' },
        { trait_type: 'Class', value: 'GiftLocksmith' },
        { trait_type: 'Generation', value: 'Gen 1' },
        { trait_type: 'Rarity', value: 'Rare' },
        { trait_type: 'Wave', value: '1' },
        { trait_type: 'Utility', value: 'G2Ushard Swap + Vault APY' },
        { trait_type: 'Type', value: 'Utility' },
        { trait_type: 'Max Supply', value: '5000' },
      ],
      properties: {
        category: 'image',
        files: [{ uri: imageUri, type: 'image/jpeg' }],
      },
    };
    console.log('Uploading item metadata…');
    itemUri = await umi.uploader.uploadJson(itemMeta);
  }
  console.log('Item URI:', itemUri);

  // --- Core Collection (reuse if already created on a prior run) ---
  const existingCollection =
    process.env.COLLECTION_ADDRESS ||
    (fs.existsSync(path.join(__dirname, 'wave1-partial.json'))
      ? JSON.parse(
          fs.readFileSync(path.join(__dirname, 'wave1-partial.json'), 'utf8'),
        ).collection
      : null);

  let collectionAddress;
  let collectionTxSig = null;

  if (existingCollection) {
    collectionAddress = existingCollection;
    console.log('\nReusing Core Collection:', collectionAddress);
  } else {
    const collection = generateSigner(umi);
    console.log('\nCreating Core Collection…');
    const colBuilder = createCollection(umi, {
      collection,
      name: 'Gift2u Elves',
      uri: collectionUri,
      plugins: [
        {
          type: 'Royalties',
          basisPoints: 500,
          creators: [{ address: treasury, percentage: 100 }],
          ruleSet: ruleSet('None'),
        },
      ],
    });
    const colTx = await colBuilder.sendAndConfirm(umi);
    collectionAddress = collection.publicKey.toString();
    collectionTxSig = sigOf(colTx);
    console.log('Collection:', collectionAddress);
    console.log('Collection tx:', collectionTxSig);
    fs.writeFileSync(
      path.join(__dirname, 'wave1-partial.json'),
      JSON.stringify(
        {
          collection: collectionAddress,
          collectionUri,
          itemUri,
          imageUri,
          collectionTx: collectionTxSig,
        },
        null,
        2,
      ),
    );
  }

  // Persist partial even when reusing
  fs.writeFileSync(
    path.join(__dirname, 'wave1-partial.json'),
    JSON.stringify(
      {
        collection: collectionAddress,
        collectionUri,
        itemUri,
        imageUri,
        collectionTx: collectionTxSig,
      },
      null,
      2,
    ),
  );

  // --- Core Candy Machine Wave 1 (hidden settings = identical art) ---
  // Split into separate txs so they don't expire (create + guard + wrap)
  const candyMachine = generateSigner(umi);
  const hash = crypto.createHash('sha256').update(itemUri).digest();
  const sendOpts = {
    send: { skipPreflight: false },
    confirm: { commitment: 'confirmed' },
  };

  // Royalties: set on the COLLECTION (above) at 500 bps.
  // Metaplex Core: collection Royalties apply to every asset in the collection
  // unless an asset overrides with its own plugin. CM mint path does not attach
  // per-asset plugins — do NOT rely on mintV1 for royalties; collection is the source.
  // For explorer/DAS asset-level 5%, run: node fix-royalties.mjs
  console.log('\n1/3 Creating Core Candy Machine account…');
  const cmBuilder = await createCandyMachine(umi, {
    candyMachine,
    collection: publicKey(collectionAddress),
    collectionUpdateAuthority: umi.identity,
    itemsAvailable: ITEMS,
    isMutable: true,
    hiddenSettings: some({
      name: 'GiftLocksmith #$ID+1$',
      uri: itemUri,
      hash,
    }),
  });
  const cmTx = await cmBuilder.sendAndConfirm(umi, sendOpts);
  console.log('Candy Machine:', candyMachine.publicKey.toString());
  console.log('CM tx:', sigOf(cmTx));

  console.log('\n2/3 Creating Candy Guard (0.25 SOL payment)…');
  const guardBuilder = createCandyGuard(umi, {
    base: candyMachine,
    guards: {
      solPayment: some({
        lamports: sol(PRICE_SOL),
        destination: treasury,
      }),
      botTax: some({
        lamports: sol(0.001),
        lastInstruction: true,
      }),
      mintLimit: some({
        id: WAVE,
        limit: 5,
      }),
    },
  });
  const guardTx = await guardBuilder.sendAndConfirm(umi, sendOpts);
  console.log('Guard tx:', sigOf(guardTx));

  console.log('\n3/3 Wrapping Candy Machine with Guard…');
  const candyGuard = findCandyGuardPda(umi, {
    base: candyMachine.publicKey,
  });
  const wrapTx = await wrap(umi, {
    candyGuard,
    candyMachine: candyMachine.publicKey,
  }).sendAndConfirm(umi, sendOpts);
  console.log('Wrap tx:', sigOf(wrapTx));

  const out = {
    standard: 'metaplex-core',
    wave: WAVE,
    itemsAvailable: ITEMS,
    priceSol: PRICE_SOL,
    treasury: umi.identity.publicKey.toString(),
    collection: collectionAddress,
    collectionUri,
    candyMachine: candyMachine.publicKey.toString(),
    itemUri,
    imageUri,
    collectionTx: collectionTxSig,
    candyMachineTx: sigOf(cmTx),
    guardTx: sigOf(guardTx),
    wrapTx: sigOf(wrapTx),
    candyGuard: Array.isArray(candyGuard) ? candyGuard[0] : String(candyGuard),
    cluster: CLUSTER,
    guards: {
      solPayment: PRICE_SOL,
      botTax: 0.001,
      mintLimitPerWallet: 5,
    },
    solscanCollection: `https://solscan.io/account/${collectionAddress}`,
    solscanCandyMachine: `https://solscan.io/account/${candyMachine.publicKey}`,
    coreExplorerCollection: `https://core.metaplex.com/explorer/${collectionAddress}`,
    note: 'Hidden settings: all mints share same metadata. Names: GiftLocksmith #1 … #500. Payments go to treasury wallet.',
  };

  // Default existing collection from the successful first run
  if (!process.env.COLLECTION_ADDRESS && !existingCollection) {
    // already written
  }

  const outPath = path.join(__dirname, 'wave1-result.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log('\n✅ Wave 1 ready\n');
  console.log(JSON.stringify(out, null, 2));
  console.log(`\nSaved: ${outPath}`);
  console.log('\nMint page needs candyMachine address + RPC; buyers pay 0.25 SOL to treasury.');
}

main().catch((err) => {
  console.error('\n❌ Setup failed:', err?.message || err);
  if (err?.logs) console.error(err.logs);
  if (err?.cause) console.error(err.cause);
  process.exit(1);
});
