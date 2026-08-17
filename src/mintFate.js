/**
 * Mint Fate Wave 1 (per rarity) from Core Candy Machine — same pattern as GiftLocksmith.
 *
 * CM addresses live in FATE_CM (filled after `setup-wave.mjs`).
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
import { FATE_COLLECTION, FATE_WAVE1 } from './fate';

export const FATE_TREASURY = 'AdvMvv6GzGvdLRtuxaso1Eubk7jmn6LCZEeEFHn22yeb';
export const FATE_FEE_BUFFER_SOL = 0.02;
export const FATE_MAX_PER_WALLET = 5;
export const FATE_WAVE = 1;

/**
 * Wave 1 candy machines — set candyMachine + candyGuard after setup-wave.mjs.
 * Leave null until that rarity is live on-chain.
 */
export const FATE_CM = {
  common: {
    ...FATE_WAVE1.common,
    candyMachine: '8Xsen3GEmVKfrirGrENV18We8HN3SWx4gFHxuD8USuuU',
    candyGuard: '4v7c2tdq9a98nHX1yKJdLVn22KTfws6mUWA8X4YuVkpb',
    collection: FATE_COLLECTION,
    treasury: FATE_TREASURY,
    feeBufferSol: FATE_FEE_BUFFER_SOL,
    maxPerWallet: FATE_MAX_PER_WALLET,
    wave: FATE_WAVE,
    name: 'Fate',
  },
  rare: {
    ...FATE_WAVE1.rare,
    candyMachine: 'DyqirB4Vyn5JtYAEeUm2WQN2AMaBqfzgYURW2LQCCJbQ',
    candyGuard: 'B4LFV31ocac7edVuyMRLqhypF1WBgNQC79o1xmWD5NrQ',
    collection: FATE_COLLECTION,
    treasury: FATE_TREASURY,
    feeBufferSol: FATE_FEE_BUFFER_SOL,
    maxPerWallet: FATE_MAX_PER_WALLET,
    wave: FATE_WAVE,
    name: 'Fate',
  },
  epic: {
    ...FATE_WAVE1.epic,
    candyMachine: 'GC44BKsRbd4HVZzU9wZqZxcC9XwhwzfvrN39rVCEppfA',
    candyGuard: '5chT9VmQShvSmg6n6jLxP2TNSBNqaCGivW7jMPk8k4cQ',
    collection: FATE_COLLECTION,
    treasury: FATE_TREASURY,
    feeBufferSol: FATE_FEE_BUFFER_SOL,
    maxPerWallet: FATE_MAX_PER_WALLET,
    wave: FATE_WAVE,
    name: 'Fate',
  },
  legendary: {
    ...FATE_WAVE1.legendary,
    candyMachine: '7diXaptFs4NhBatC3H8F2vXsyzAxiSSYfxs6V7a3CjhN',
    candyGuard: 'G9iNpH2BGdZ2zCJzHAD6ygSTcjatMQa5EbZQyvq2rDpW',
    collection: FATE_COLLECTION,
    treasury: FATE_TREASURY,
    feeBufferSol: FATE_FEE_BUFFER_SOL,
    maxPerWallet: FATE_MAX_PER_WALLET,
    wave: FATE_WAVE,
    name: 'Fate',
  },
};

// Optional runtime overrides from /fate-cm.json (public) — deployed after setup-wave
let _cmLoaded = false;
export async function loadFateCmConfig() {
  if (_cmLoaded || typeof fetch === 'undefined') return FATE_CM;
  try {
    const res = await fetch('/fate-cm.json', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      for (const key of Object.keys(FATE_CM)) {
        if (data[key]?.candyMachine) {
          FATE_CM[key].candyMachine = data[key].candyMachine;
          FATE_CM[key].candyGuard = data[key].candyGuard || null;
          if (data[key].imageUri) FATE_CM[key].imageUri = data[key].imageUri;
        }
      }
    }
  } catch {
    /* optional file */
  }
  _cmLoaded = true;
  return FATE_CM;
}

export function isFateMintLive(rarityKey) {
  const c = FATE_CM[rarityKey];
  return !!(c?.candyMachine && c?.candyGuard);
}

export function minSolForFateMint(rarityKey) {
  const c = FATE_CM[rarityKey] || FATE_CM.common;
  return (Number(c.priceSol) || 0) + (Number(c.feeBufferSol) || FATE_FEE_BUFFER_SOL);
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

export async function assertWalletCanMintFate(walletAddress, rarityKey) {
  const cfg = FATE_CM[rarityKey];
  if (!cfg) throw new Error('Unknown Fate rarity');
  if (!isFateMintLive(rarityKey)) {
    throw new Error(
      `Fate ${cfg.label} Wave 1 mint is not live yet (candy machine not deployed).`,
    );
  }
  const need = minSolForFateMint(rarityKey);
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
      `Not enough SOL to mint Fate ${cfg.label}. Need at least ${need.toFixed(2)} SOL ` +
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
 * Mint one Fate of the given rarity from Wave 1 CM.
 * @param {string} secretPhraseOrBase58
 * @param {'common'|'rare'|'epic'|'legendary'} rarityKey
 */
export async function mintFateWave1(secretPhraseOrBase58, rarityKey = 'common') {
  if (!secretPhraseOrBase58) {
    throw new Error('Wallet secret not available. Unlock your game wallet first.');
  }
  await loadFateCmConfig();
  const cfg = FATE_CM[rarityKey];
  if (!cfg) throw new Error('Unknown Fate rarity');
  if (!isFateMintLive(rarityKey)) {
    throw new Error(
      `Fate ${cfg.label} is listed but Wave 1 candy machine is not live yet.`,
    );
  }

  const umi = umiFromSecret(secretPhraseOrBase58);
  const owner = umi.identity.publicKey.toString();
  await assertWalletCanMintFate(owner, rarityKey);
  await assertWalletCanMintFate(owner, rarityKey);

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
    name: `Fate ${cfg.label}`,
    rarity: cfg.label,
  };
}
