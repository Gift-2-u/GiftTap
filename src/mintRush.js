/**
 * Mint Rush Wave 1 (per rarity) from Core Candy Machine — same pattern as GiftLocksmith.
 *
 * CM addresses live in RUSH_CM (filled after `deploy-one.mjs`).
 * Until a rarity has candyMachine + candyGuard, mint throws a clear "not live" error.
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
import { RUSH_COLLECTION, RUSH_WAVE1 } from './rush';

export const RUSH_TREASURY = 'AdvMvv6GzGvdLRtuxaso1Eubk7jmn6LCZEeEFHn22yeb';
export const RUSH_FEE_BUFFER_SOL = 0.02;
export const RUSH_MAX_PER_WALLET = 5;
export const RUSH_WAVE = 1;

/**
 * Wave 1 candy machines — set candyMachine + candyGuard after deploy-one.mjs.
 * Leave null until that rarity is live on-chain.
 */
export const RUSH_CM = {
  common: {
    ...RUSH_WAVE1.common,
    candyMachine: '2T5papzGBSCZjCa1dg3gFMro5A3JH3WQdRbu96WwVp59',
    candyGuard: 'BncE3BaFZxjQcqAzZZ1qme6hKPKSQBWnwP6EetbonKM2',
    collection: RUSH_COLLECTION,
    treasury: RUSH_TREASURY,
    feeBufferSol: RUSH_FEE_BUFFER_SOL,
    maxPerWallet: RUSH_MAX_PER_WALLET,
    wave: RUSH_WAVE,
    name: 'Rush',
  },
  rare: {
    ...RUSH_WAVE1.rare,
    candyMachine: '2Y4iJvjLKLaxYWTvRLtav6C5SiVsUhJLbPuJH4E5ZsUG',
    candyGuard: '5wHXqT3HgPgWsSapaYYwj5nFHF4vr6pQFfVJw3u471xL',
    collection: RUSH_COLLECTION,
    treasury: RUSH_TREASURY,
    feeBufferSol: RUSH_FEE_BUFFER_SOL,
    maxPerWallet: RUSH_MAX_PER_WALLET,
    wave: RUSH_WAVE,
    name: 'Rush',
  },
  epic: {
    ...RUSH_WAVE1.epic,
    candyMachine: '2VcyUk4utKyRb3Qrmri2AkPoxd6h8dyECzDxWsqsBQjh',
    candyGuard: 'DRkLMNRAWDZ9tEUQxF6vyuAuvhU4XYWaVZ7mcWLpD4aC',
    collection: RUSH_COLLECTION,
    treasury: RUSH_TREASURY,
    feeBufferSol: RUSH_FEE_BUFFER_SOL,
    maxPerWallet: RUSH_MAX_PER_WALLET,
    wave: RUSH_WAVE,
    name: 'Rush',
  },
  legendary: {
    ...RUSH_WAVE1.legendary,
    candyMachine: 'rc52ZEQgV3ENxwKhZ4s4tiAJcGLaJFADLZFcwLdPNAv',
    candyGuard: 'HWixbiJrVsRofFTJgbQKWBYwXKAvNNJj8Q2iqScWbQGf',
    collection: RUSH_COLLECTION,
    treasury: RUSH_TREASURY,
    feeBufferSol: RUSH_FEE_BUFFER_SOL,
    maxPerWallet: RUSH_MAX_PER_WALLET,
    wave: RUSH_WAVE,
    name: 'Rush',
  },
};

// Optional runtime overrides from /rush-cm.json (public) — deployed after setup-wave
let _cmLoaded = false;
export async function loadRushCmConfig() {
  if (_cmLoaded || typeof fetch === 'undefined') return RUSH_CM;
  try {
    const res = await fetch('/rush-cm.json', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      for (const key of Object.keys(RUSH_CM)) {
        if (data[key]?.candyMachine) {
          RUSH_CM[key].candyMachine = data[key].candyMachine;
          RUSH_CM[key].candyGuard = data[key].candyGuard || null;
          if (data[key].imageUri) RUSH_CM[key].imageUri = data[key].imageUri;
        }
      }
    }
  } catch {
    /* optional file */
  }
  _cmLoaded = true;
  return RUSH_CM;
}

export function isRushMintLive(rarityKey) {
  const c = RUSH_CM[rarityKey];
  return !!(c?.candyMachine && c?.candyGuard);
}

export function minSolForRushMint(rarityKey) {
  const c = RUSH_CM[rarityKey] || RUSH_CM.common;
  return (Number(c.priceSol) || 0) + (Number(c.feeBufferSol) || RUSH_FEE_BUFFER_SOL);
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

export async function assertWalletCanMintRush(walletAddress, rarityKey) {
  const cfg = RUSH_CM[rarityKey];
  if (!cfg) throw new Error('Unknown Rush rarity');
  if (!isRushMintLive(rarityKey)) {
    throw new Error(
      `Rush ${cfg.label} Wave 1 mint is not live yet (candy machine not deployed).`,
    );
  }
  const need = minSolForRushMint(rarityKey);
  let sol = 0;
  try {
    sol = await getWalletSolBalance(walletAddress);
  } catch (e) {
    throw new Error(
      `Could not check wallet SOL balance. (${e?.message || e})`,
    );
  }
  if (!(sol >= need)) {
    throw new Error(
      `Not enough SOL to mint Rush ${cfg.label}. Need at least ${need.toFixed(2)} SOL ` +
        `(${cfg.priceSol} mint + ~${cfg.feeBufferSol} network/rent). ` +
        `Your game wallet has ${Number(sol).toFixed(4)} SOL.`,
    );
  }
  return { sol, need };
}

export function publicKeyFromSecret(secretPhraseOrBase58) {
  if (!secretPhraseOrBase58) {
    throw new Error('Wallet secret not available. Unlock your game wallet first.');
  }
  if (String(secretPhraseOrBase58).includes(' ')) {
    const kp = keypairFromMnemonic(String(secretPhraseOrBase58).trim());
    return kp.publicKey.toBase58();
  }
  const secretKey = bs58.decode(String(secretPhraseOrBase58).trim());
  const umi = createUmi(RPC_URL);
  const umiKp = umi.eddsa.createKeypairFromSecretKey(secretKey);
  return umiKp.publicKey.toString();
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

/**
 * Mint one Rush of the given rarity from Wave 1 CM.
 * @param {string} secretPhraseOrBase58
 * @param {'common'|'rare'|'epic'|'legendary'} rarityKey
 */
export async function mintRushWave1(secretPhraseOrBase58, rarityKey = 'common') {
  if (!secretPhraseOrBase58) {
    throw new Error('Wallet secret not available. Unlock your game wallet first.');
  }
  await loadRushCmConfig();
  const cfg = RUSH_CM[rarityKey];
  if (!cfg) throw new Error('Unknown Rush rarity');
  if (!isRushMintLive(rarityKey)) {
    throw new Error(
      `Rush ${cfg.label} is listed but Wave 1 candy machine is not live yet.`,
    );
  }

  const umi = umiFromSecret(secretPhraseOrBase58);
  const owner = umi.identity.publicKey.toString();
  await assertWalletCanMintRush(owner, rarityKey);
  await assertWalletCanMintRush(owner, rarityKey);

  const asset = generateSigner(umi);
  const builder = transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 400_000 }))
    .add(
      mintV1(umi, {
        candyMachine: publicKey(cfg.candyMachine),
        asset,
        collection: publicKey(cfg.collection),
        candyGuard: publicKey(cfg.candyGuard),
        mintArgs: {
          solPayment: some({ destination: publicKey(cfg.treasury) }),
          mintLimit: some({ id: cfg.wave }),
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
    priceSol: cfg.priceSol,
    name: `Rush ${cfg.label}`,
    rarity: cfg.label,
  };
}
