/**
 * Mint one GiftLocksmith NFT (Metaplex Token Metadata).
 *
 * This mints a SINGLE NFT. A 5000 supply drop needs a collection + Candy Machine later.
 *
 *   export CONFIRM_MAINNET=yes
 *   export RPC_URL="https://mainnet.helius-rpc.com/?api-key=..."
 *   node mint.mjs
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createNft, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import {
  createGenericFile,
  generateSigner,
  keypairIdentity,
  percentAmount,
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
  node mint.mjs

Spends real SOL (~0.02–0.05 for upload + rent).
`);
    process.exit(1);
  }

  const imagePath = [
    path.join(__dirname, 'GiftLocksmith.jpg'),
    path.join(__dirname, 'image.png'),
    path.join(__dirname, 'image.jpg'),
  ].find((p) => fs.existsSync(p));

  if (!imagePath) {
    throw new Error(`Missing GiftLocksmith.jpg in ${__dirname}`);
  }

  const meta = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'metadata.json'), 'utf8'),
  );

  console.log('Cluster: ', CLUSTER);
  console.log('RPC:     ', RPC_URL.replace(/api-key=[^&]+/i, 'api-key=***'));
  console.log('Keypair: ', KEYPAIR_PATH);
  console.log('Image:   ', imagePath);
  console.log('Name:    ', meta.name);
  console.log('Symbol:  ', meta.symbol);

  const umi = createUmi(RPC_URL).use(mplTokenMetadata());
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
  console.log('Wallet:  ', umi.identity.publicKey);

  const imageBytes = fs.readFileSync(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
  const imageFile = createGenericFile(imageBytes, path.basename(imagePath), {
    contentType,
  });

  console.log('\nUploading image…');
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
      files: [{ uri: imageUri, type: contentType }],
    },
    seller_fee_basis_points: meta.seller_fee_basis_points ?? 500,
  };

  console.log('Uploading metadata…');
  const metadataUri = await umi.uploader.uploadJson(offChain);
  console.log('Metadata:', metadataUri);

  const mint = generateSigner(umi);
  const royaltyBps = meta.seller_fee_basis_points ?? 500;

  console.log('\nCreating NFT on-chain…');
  const result = await createNft(umi, {
    mint,
    name: meta.name,
    symbol: meta.symbol || 'Locksmith',
    uri: metadataUri,
    sellerFeeBasisPoints: percentAmount(royaltyBps / 100),
    isMutable: true,
  }).sendAndConfirm(umi);

  const sig =
    typeof result.signature === 'string'
      ? result.signature
      : bs58.encode(result.signature);

  const out = {
    name: meta.name,
    symbol: meta.symbol,
    mint: mint.publicKey.toString(),
    metadataUri,
    imageUri,
    signature: sig,
    owner: umi.identity.publicKey.toString(),
    cluster: CLUSTER,
    solscanToken: `https://solscan.io/token/${mint.publicKey}`,
    solscanTx: `https://solscan.io/tx/${sig}`,
    note: 'Single mint only. For 5000 supply use a collection + Candy Machine.',
  };

  const outPath = path.join(__dirname, 'mint-result.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  console.log('\n✅ Minted GiftLocksmith\n');
  console.log(JSON.stringify(out, null, 2));
  console.log(`\nSaved: ${outPath}`);
}

main().catch((err) => {
  console.error('\n❌ Mint failed:', err?.message || err);
  process.exit(1);
});
