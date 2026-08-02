/**
 * Mint ONE GiftLocksmith as a Metaplex Core asset (mainnet).
 *
 *   export CONFIRM_MAINNET=yes
 *   export RPC_URL="https://mainnet.helius-rpc.com/?api-key=..."
 *   node mint-core.mjs
 *
 * Later: Core Collection + Core Candy Machine for waves 500 / 1500 / 3000.
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
} from '@metaplex-foundation/mpl-core';
import {
  createGenericFile,
  generateSigner,
  keypairIdentity,
  publicKey,
} from '@metaplex-foundation/umi';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import bs58 from 'bs58';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  if (!fs.existsSync(KEYPAIR_PATH)) {
    throw new Error(`Keypair not found: ${KEYPAIR_PATH}`);
  }
  const raw = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'));
  if (!Array.isArray(raw)) {
    throw new Error('Keypair must be Solana CLI JSON byte array.');
  }
  return new Uint8Array(raw);
}

async function main() {
  if (CLUSTER === 'mainnet' && CONFIRM !== 'yes') {
    console.error(`
Refusing mainnet mint without confirmation.

  export CONFIRM_MAINNET=yes
  export RPC_URL="your-mainnet-rpc"
  node mint-core.mjs
`);
    process.exit(1);
  }

  const imagePath = path.join(__dirname, 'GiftLocksmith.jpg');
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Missing image: ${imagePath}`);
  }

  const meta = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'metadata.json'), 'utf8'),
  );

  console.log('Standard: Metaplex Core');
  console.log('Cluster: ', CLUSTER);
  console.log('RPC:     ', RPC_URL.replace(/api-key=[^&]+/i, 'api-key=***'));
  console.log('Keypair: ', KEYPAIR_PATH);
  console.log('Name:    ', meta.name);

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
  console.log('Wallet:  ', umi.identity.publicKey);

  const imageBytes = fs.readFileSync(imagePath);
  const imageFile = createGenericFile(imageBytes, 'GiftLocksmith.jpg', {
    contentType: 'image/jpeg',
  });

  console.log('\nUploading image (Irys)…');
  const [imageUri] = await umi.uploader.upload([imageFile]);
  console.log('Image URI:', imageUri);

  const offChain = {
    name: meta.name,
    symbol: meta.symbol,
    description: meta.description,
    image: imageUri,
    external_url: meta.external_url || 'https://gift2u.fun',
    attributes: meta.attributes || [],
    properties: {
      category: 'image',
      files: [{ uri: imageUri, type: 'image/jpeg' }],
    },
  };

  console.log('Uploading metadata…');
  const metadataUri = await umi.uploader.uploadJson(offChain);
  console.log('Metadata:', metadataUri);

  const asset = generateSigner(umi);
  const royaltyBps = meta.seller_fee_basis_points ?? 500;

  console.log('\nCreating Core asset on-chain…');
  const result = await create(umi, {
    asset,
    name: meta.name,
    uri: metadataUri,
    plugins: [
      {
        type: 'Royalties',
        basisPoints: royaltyBps,
        creators: [{ address: creator, percentage: 100 }],
        ruleSet: ruleSet('None'),
      },
    ],
  }).sendAndConfirm(umi);

  const sig =
    typeof result.signature === 'string'
      ? result.signature
      : bs58.encode(result.signature);

  const out = {
    standard: 'metaplex-core',
    name: meta.name,
    symbol: meta.symbol,
    asset: asset.publicKey.toString(),
    metadataUri,
    imageUri,
    signature: sig,
    owner: umi.identity.publicKey.toString(),
    cluster: CLUSTER,
    royaltiesBps: royaltyBps,
    solscan: `https://solscan.io/account/${asset.publicKey}`,
    solscanTx: `https://solscan.io/tx/${sig}`,
    coreExplorer: `https://core.metaplex.com/explorer/${asset.publicKey}`,
    wavesPlan: {
      wave1: { supply: 500, priceNote: 'lowest' },
      wave2: { supply: 1500, priceNote: 'higher' },
      wave3: { supply: 3000, priceNote: 'highest' },
      maxGen1: 5000,
    },
  };

  const outPath = path.join(__dirname, 'mint-result.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  console.log('\n✅ Core GiftLocksmith minted\n');
  console.log(JSON.stringify(out, null, 2));
  console.log(`\nSaved: ${outPath}`);
}

main().catch((err) => {
  console.error('\n❌ Mint failed:', err?.message || err);
  if (err?.cause) console.error(err.cause);
  process.exit(1);
});
