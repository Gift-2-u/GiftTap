/**
 * Mint Star Badge from Core Candy Machine (mainnet).
 * 0.10 SOL — one Star for Fate/Echo/Rush/Shadow sockets (UI outside art).
 * CM addresses filled after scripts/nft/gift-star/setup-wave1.mjs
 */
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore } from '@metaplex-foundation/mpl-core';
import {
  mintV1,
  mplCandyMachine,
} from '@metaplex-foundation/mpl-core-candy-machine';
import { setComputeUnitLimit } from '@metaplex-foundation/mpl-toolbox';
import {
  generateSigner,
  keypairIdentity,
  publicKey,
  some,
  transactionBuilder,
} from '@metaplex-foundation/umi';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { keypairFromMnemonic } from './solanaWallet';
import { RPC_URL } from './rpc';
import { LOCKSMITH_COLLECTION } from './locksmith';
import { STAR_MINT_SOL } from './shardBadge';

export const STAR_COLLECTION = LOCKSMITH_COLLECTION;

/** Wave 1 — null CM until setup-wave1.mjs writes public/star-cm.json */
export const STAR_WAVE1 = {
  candyMachine: null,
  candyGuard: null,
  collection: STAR_COLLECTION,
  treasury: 'AdvMvv6GzGvdLRtuxaso1Eubk7jmn6LCZEeEFHn22yeb',
  priceSol: STAR_MINT_SOL || 0.1,
  feeBufferSol: 0.02,
  maxPerWallet: 10,
  itemsAvailable: 50000,
  wave: 1,
  name: 'Star Badge',
  imageUrl: '/shop/socket-star2.jpg?v=1',
  imageUri: null,
};

let _cmLoaded = false;

export async function loadStarCmConfig() {
  if (_cmLoaded || typeof fetch === 'undefined') return STAR_WAVE1;
  try {
    const res = await fetch('/star-cm.json', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data.candyMachine) STAR_WAVE1.candyMachine = data.candyMachine;
      if (data.candyGuard) STAR_WAVE1.candyGuard = data.candyGuard;
      if (data.imageUri) STAR_WAVE1.imageUri = data.imageUri;
      if (data.treasury) STAR_WAVE1.treasury = data.treasury;
      if (data.priceSol != null) STAR_WAVE1.priceSol = Number(data.priceSol);
      if (data.itemsAvailable != null) {
        STAR_WAVE1.itemsAvailable = Number(data.itemsAvailable);
      }
      if (data.maxPerWallet != null) {
        STAR_WAVE1.maxPerWallet = Number(data.maxPerWallet);
      }
    }
  } catch {
    /* keep defaults */
  }
  _cmLoaded = true;
  return STAR_WAVE1;
}

export function isStarMintLive() {
  return !!(STAR_WAVE1.candyMachine && STAR_WAVE1.candyGuard);
}

export function minSolForStarMint() {
  return STAR_WAVE1.priceSol + STAR_WAVE1.feeBufferSol;
}

export async function getWalletSolBalance(walletAddress) {
  if (!walletAddress || String(walletAddress).length < 32) {
    throw new Error('No game wallet address');
  }
  const connection = new Connection(RPC_URL, 'confirmed');
  const lamports = await connection.getBalance(
    new PublicKey(String(walletAddress).trim()),
  );
  return lamports / LAMPORTS_PER_SOL;
}

export async function assertWalletCanMintStar(walletAddress) {
  const need = minSolForStarMint();
  const sol = await getWalletSolBalance(walletAddress);
  if (sol + 1e-12 < need) {
    throw new Error(
      `Need ~${need.toFixed(4)} SOL (Star ${STAR_WAVE1.priceSol} + fees). ` +
        `Deposit SOL first — mint is blocked so you do not lose bot-tax/network fees.`,
    );
  }
  return { sol, need };
}

function umiFromSecret(secretPhraseOrBase58) {
  const umi = createUmi(RPC_URL).use(mplCore()).use(mplCandyMachine());
  let secretKey;
  if (String(secretPhraseOrBase58).includes(' ')) {
    const kp = keypairFromMnemonic(String(secretPhraseOrBase58).trim());
    secretKey = kp.secretKey;
  } else {
    secretKey = bs58.decode(String(secretPhraseOrBase58).trim());
  }
  const umiKp = umi.eddsa.createKeypairFromSecretKey(secretKey);
  umi.use(keypairIdentity(umiKp));
  return umi;
}

export async function mintStarWave1(secretPhraseOrBase58) {
  if (!secretPhraseOrBase58) {
    throw new Error('Wallet secret not available. Unlock your game wallet first.');
  }
  await loadStarCmConfig();
  if (!isStarMintLive()) {
    throw new Error(
      'Star Badge mint is not live yet (Candy Machine not deployed).',
    );
  }

  const umi = umiFromSecret(secretPhraseOrBase58);
  const owner = umi.identity.publicKey.toString();
  await assertWalletCanMintStar(owner);
  await assertWalletCanMintStar(owner);

  const asset = generateSigner(umi);
  const builder = transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 400_000 }))
    .add(
      mintV1(umi, {
        candyMachine: publicKey(STAR_WAVE1.candyMachine),
        asset,
        collection: publicKey(STAR_WAVE1.collection),
        candyGuard: publicKey(STAR_WAVE1.candyGuard),
        mintArgs: {
          solPayment: some({ destination: publicKey(STAR_WAVE1.treasury) }),
          mintLimit: some({ id: STAR_WAVE1.wave }),
        },
      }),
    );

  const result = await builder.sendAndConfirm(umi, {
    confirm: { commitment: 'confirmed' },
    send: { skipPreflight: false },
  });

  const signature =
    typeof result.signature === 'string'
      ? result.signature
      : bs58.encode(result.signature);

  return {
    asset: asset.publicKey.toString(),
    signature,
    owner,
    priceSol: STAR_WAVE1.priceSol,
    name: STAR_WAVE1.name,
  };
}
