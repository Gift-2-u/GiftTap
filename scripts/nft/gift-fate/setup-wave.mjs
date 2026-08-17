/**
 * Create Core Candy Machine for one Fate rarity × wave
 * (same guards as GiftLocksmith: solPayment + botTax + mintLimit).
 *
 *   export CONFIRM_MAINNET=yes
 *   export RPC_URL="..."
 *   # optional reuse: export COLLECTION_ADDRESS=...
 *   node setup-wave.mjs legendary 1
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createCollection, mplCore, ruleSet } from '@metaplex-foundation/mpl-core';
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
} from '@metaplex-foundation/umi';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import bs58 from 'bs58';
import {
  FATE_RARITIES,
  waveItems,
  wavePrice,
  ROYALTY_BPS,
  FATE_TREASURY,
  GIFT2U_ELVES_COLLECTION,
} from './config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rarityKey = (process.argv[2] || '').toLowerCase();
const WAVE = Number(process.argv[3] || 0);
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
  return new Uint8Array(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8')));
}
function sigOf(result) {
  return typeof result.signature === 'string'
    ? result.signature
    : bs58.encode(result.signature);
}

async function main() {
  if (!FATE_RARITIES[rarityKey] || ![1, 2, 3].includes(WAVE)) {
    console.error('Usage: node setup-wave.mjs <common|rare|epic|legendary> <1|2|3>');
    process.exit(1);
  }
  if (CLUSTER === 'mainnet' && CONFIRM !== 'yes') {
    console.error('Set CONFIRM_MAINNET=yes for mainnet.');
    process.exit(1);
  }

  const r = FATE_RARITIES[rarityKey];
  const ITEMS = waveItems(rarityKey, WAVE);
  const PRICE_SOL = wavePrice(rarityKey, WAVE);
  const tag = `wave${WAVE}-${rarityKey}`;
  const partialPath = path.join(__dirname, `${tag}-partial.json`);
  const outPath = path.join(__dirname, `${tag}-result.json`);

  console.log(`=== Fate ${r.label} Wave ${WAVE} (Core CM) ===`);
  console.log(`Items: ${ITEMS} | Price: ${PRICE_SOL} SOL`);
  console.log('RPC:', RPC_URL.replace(/api-key=[^&]+/i, 'api-key=***'));

  const umi = createUmi(RPC_URL).use(mplCore()).use(mplCandyMachine());
  umi.use(
    irysUploader({
      address:
        CLUSTER === 'mainnet'
          ? 'https://node1.irys.xyz'
          : 'https://devnet.irys.xyz',
    }),
  );
  umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(loadSecret())));
  const treasury = publicKey(process.env.TREASURY || FATE_TREASURY || umi.identity.publicKey);
  console.log('Authority:', umi.identity.publicKey);
  console.log('Treasury: ', treasury);

  // Prefer rarity-bordered art (empty badge socket)
  let imagePath = path.join(__dirname, `Fate-${rarityKey}.jpg`);
  if (!fs.existsSync(imagePath)) {
    imagePath = path.join(__dirname, 'Fate.jpg');
  }
  if (!fs.existsSync(imagePath)) throw new Error(`Missing ${imagePath}`);

  const partial = fs.existsSync(partialPath)
    ? JSON.parse(fs.readFileSync(partialPath, 'utf8'))
    : {};

  let imageUri = partial.imageUri;
  if (!imageUri) {
    console.log('\nUploading image…', path.basename(imagePath));
    const imageFile = createGenericFile(
      fs.readFileSync(imagePath),
      path.basename(imagePath),
      {
        contentType: 'image/jpeg',
      },
    );
    [imageUri] = await umi.uploader.upload([imageFile]);
  }
  console.log('Image URI:', imageUri);

  const metaTemplate = JSON.parse(
    fs.readFileSync(path.join(__dirname, `metadata-${rarityKey}.json`), 'utf8'),
  );

  let collectionUri = partial.collectionUri;
  if (!collectionUri) {
    collectionUri = await umi.uploader.uploadJson({
      name: 'Gift2u Elves',
      symbol: 'ELVES',
      description:
        'Gift2u Elves — Gen 1 utility classes for Gift Tap. Fate (Luck) jackpot class. Locksmith and more.',
      image: imageUri,
      external_url: 'https://gift2u.fun',
      properties: {
        category: 'image',
        files: [{ uri: imageUri, type: 'image/jpeg' }],
      },
    });
  }
  console.log('Collection URI:', collectionUri);

  let itemUri = partial.itemUri;
  if (!itemUri) {
    itemUri = await umi.uploader.uploadJson({
      ...metaTemplate,
      image: imageUri,
      attributes: [
        ...(metaTemplate.attributes || []),
        { trait_type: 'Wave', value: String(WAVE) },
      ],
      properties: {
        category: 'image',
        files: [{ uri: imageUri, type: 'image/jpeg' }],
      },
    });
  }
  console.log('Item URI:', itemUri);

  // Always default to Gift2u Elves (Locksmith collection) unless overridden
  let collectionAddress =
    process.env.COLLECTION_ADDRESS ||
    partial.collection ||
    GIFT2U_ELVES_COLLECTION ||
    null;
  let collectionTxSig = partial.collectionTx || null;

  if (collectionAddress) {
    console.log('\nReusing Core Collection:', collectionAddress);
  } else {
    const collection = generateSigner(umi);
    console.log('\nCreating Core Collection…');
    const colTx = await createCollection(umi, {
      collection,
      name: 'Gift2u Elves · Fate',
      uri: collectionUri,
      plugins: [
        {
          type: 'Royalties',
          basisPoints: ROYALTY_BPS,
          creators: [{ address: treasury, percentage: 100 }],
          ruleSet: ruleSet('None'),
        },
      ],
    }).sendAndConfirm(umi);
    collectionAddress = collection.publicKey.toString();
    collectionTxSig = sigOf(colTx);
    console.log('Collection:', collectionAddress);
  }

  fs.writeFileSync(
    partialPath,
    JSON.stringify(
      {
        rarity: rarityKey,
        wave: WAVE,
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

  const candyMachine = generateSigner(umi);
  const hash = crypto.createHash('sha256').update(itemUri).digest();
  const sendOpts = {
    send: { skipPreflight: false },
    confirm: { commitment: 'confirmed' },
  };

  console.log('\n1/3 Creating Core Candy Machine…');
  const cmTx = await (
    await createCandyMachine(umi, {
      candyMachine,
      collection: publicKey(collectionAddress),
      collectionUpdateAuthority: umi.identity,
      itemsAvailable: ITEMS,
      isMutable: true,
      hiddenSettings: some({
        name: `Fate ${r.label} #$ID+1$`,
        uri: itemUri,
        hash,
      }),
    })
  ).sendAndConfirm(umi, sendOpts);
  console.log('Candy Machine:', candyMachine.publicKey.toString());

  console.log(`\n2/3 Creating Candy Guard (${PRICE_SOL} SOL)…`);
  const guardTx = await createCandyGuard(umi, {
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
  }).sendAndConfirm(umi, sendOpts);

  console.log('\n3/3 Wrapping CM with Guard…');
  const candyGuard = findCandyGuardPda(umi, { base: candyMachine.publicKey });
  const wrapTx = await wrap(umi, {
    candyGuard,
    candyMachine: candyMachine.publicKey,
  }).sendAndConfirm(umi, sendOpts);

  const out = {
    standard: 'metaplex-core',
    class: 'Fate',
    rarity: r.label,
    rarityKey,
    wave: WAVE,
    itemsAvailable: ITEMS,
    priceSol: PRICE_SOL,
    treasury: treasury.toString(),
    collection: collectionAddress,
    collectionUri,
    candyMachine: candyMachine.publicKey.toString(),
    candyGuard: publicKey(candyGuard).toString(),
    itemUri,
    imageUri,
    collectionTx: collectionTxSig,
    candyMachineTx: sigOf(cmTx),
    guardTx: sigOf(guardTx),
    wrapTx: sigOf(wrapTx),
    cluster: CLUSTER,
    guards: {
      solPayment: PRICE_SOL,
      botTax: 0.001,
      mintLimit: { id: WAVE, limit: 5 },
    },
    note: 'Same pattern as GiftLocksmith setup-wave1.mjs',
  };
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log('\nDone →', outPath);
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
