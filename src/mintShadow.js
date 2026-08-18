/**
 * Mint Shadow Wave 1 (per rarity) from Core Candy Machine — same pattern as GiftLocksmith.
 *
 * CM addresses live in SHADOW_CM (filled after `deploy-one.mjs`).
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
import { SHADOW_COLLECTION, SHADOW_WAVE1 } from './shadow';

export const SHADOW_TREASURY = 'AdvMvv6GzGvdLRtuxaso1Eubk7jmn6LCZEeEFHn22yeb';
export const SHADOW_FEE_BUFFER_SOL = 0.02;
export const SHADOW_MAX_PER_WALLET = 5;
export const SHADOW_WAVE = 1;

/**
 * Wave 1 candy machines — set candyMachine + candyGuard after deploy-one.mjs.
 * Leave null until that rarity is live on-chain.
 */
export const SHADOW_CM = {
  common: {
    ...SHADOW_WAVE1.common,
    candyMachine: '6eCDTALwmkSndK6guUFkmNMo9AoqAWJoNR7PaqHumVqD',
    candyGuard: 'D7h5id6Q4NQPk9V9Md6iBRTpJuUjhvNyCG4Hxe9gqRXn',
    collection: SHADOW_COLLECTION,
    treasury: SHADOW_TREASURY,
    feeBufferSol: SHADOW_FEE_BUFFER_SOL,
    maxPerWallet: SHADOW_MAX_PER_WALLET,
    wave: SHADOW_WAVE,
    name: 'Shadow',
  },
  rare: {
    ...SHADOW_WAVE1.rare,
    candyMachine: 'JDHEEd1G6JS11iKyG9zJkTenu4rviDiRnqMeLwNVQaFN',
    candyGuard: 'Asp1DhQ3NQGEXsS2d44cPR2z3mBA2EKCVdZuy1nqMVWh',
    collection: SHADOW_COLLECTION,
    treasury: SHADOW_TREASURY,
    feeBufferSol: SHADOW_FEE_BUFFER_SOL,
    maxPerWallet: SHADOW_MAX_PER_WALLET,
    wave: SHADOW_WAVE,
    name: 'Shadow',
  },
  epic: {
    ...SHADOW_WAVE1.epic,
    candyMachine: '8xk34iDpSrk45QUPuRej8uyJzdeTNXmyawut6LEwSyoJ',
    candyGuard: 'J43issbB3sirTufUzaV4XMPXD4urnHastRafFHcGsedS',
    collection: SHADOW_COLLECTION,
    treasury: SHADOW_TREASURY,
    feeBufferSol: SHADOW_FEE_BUFFER_SOL,
    maxPerWallet: SHADOW_MAX_PER_WALLET,
    wave: SHADOW_WAVE,
    name: 'Shadow',
  },
  legendary: {
    ...SHADOW_WAVE1.legendary,
    candyMachine: 'Gocvd4T3Ro2LYyzAig6rc2DV8XNnhCkd6xok8cgDxjby',
    candyGuard: 'H6sBHdVpqMZijtAeEcjP4bY4pJeY4NkgSv8dMS1c6En3',
    collection: SHADOW_COLLECTION,
    treasury: SHADOW_TREASURY,
    feeBufferSol: SHADOW_FEE_BUFFER_SOL,
    maxPerWallet: SHADOW_MAX_PER_WALLET,
    wave: SHADOW_WAVE,
    name: 'Shadow',
  },
};

// Optional runtime overrides from /shadow-cm.json (public) — deployed after setup-wave
let _cmLoaded = false;
export async function loadShadowCmConfig() {
  if (_cmLoaded || typeof fetch === 'undefined') return SHADOW_CM;
  try {
    const res = await fetch('/shadow-cm.json', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      for (const key of Object.keys(SHADOW_CM)) {
        if (data[key]?.candyMachine) {
          SHADOW_CM[key].candyMachine = data[key].candyMachine;
          SHADOW_CM[key].candyGuard = data[key].candyGuard || null;
          if (data[key].imageUri) SHADOW_CM[key].imageUri = data[key].imageUri;
        }
      }
    }
  } catch {
    /* optional file */
  }
  _cmLoaded = true;
  return SHADOW_CM;
}

export function isShadowMintLive(rarityKey) {
  const c = SHADOW_CM[rarityKey];
  return !!(c?.candyMachine && c?.candyGuard);
}

export function minSolForShadowMint(rarityKey) {
  const c = SHADOW_CM[rarityKey] || SHADOW_CM.common;
  return (Number(c.priceSol) || 0) + (Number(c.feeBufferSol) || SHADOW_FEE_BUFFER_SOL);
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

export async function assertWalletCanMintShadow(walletAddress, rarityKey) {
  const cfg = SHADOW_CM[rarityKey];
  if (!cfg) throw new Error('Unknown Shadow rarity');
  if (!isShadowMintLive(rarityKey)) {
    throw new Error(
      `Shadow ${cfg.label} Wave 1 mint is not live yet (candy machine not deployed).`,
    );
  }
  const need = minSolForShadowMint(rarityKey);
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
      `Not enough SOL to mint Shadow ${cfg.label}. Need at least ${need.toFixed(2)} SOL ` +
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
 * Mint one Shadow of the given rarity from Wave 1 CM.
 * @param {string} secretPhraseOrBase58
 * @param {'common'|'rare'|'epic'|'legendary'} rarityKey
 */
export async function mintShadowWave1(secretPhraseOrBase58, rarityKey = 'common') {
  if (!secretPhraseOrBase58) {
    throw new Error('Wallet secret not available. Unlock your game wallet first.');
  }
  await loadShadowCmConfig();
  const cfg = SHADOW_CM[rarityKey];
  if (!cfg) throw new Error('Unknown Shadow rarity');
  if (!isShadowMintLive(rarityKey)) {
    throw new Error(
      `Shadow ${cfg.label} is listed but Wave 1 candy machine is not live yet.`,
    );
  }

  const umi = umiFromSecret(secretPhraseOrBase58);
  const owner = umi.identity.publicKey.toString();
  await assertWalletCanMintShadow(owner, rarityKey);
  await assertWalletCanMintShadow(owner, rarityKey);

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
    name: `Shadow ${cfg.label}`,
    rarity: cfg.label,
  };
}
