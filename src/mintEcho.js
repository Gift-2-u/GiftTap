/**
 * Mint Echo Wave 1 (per rarity) from Core Candy Machine — same pattern as GiftLocksmith.
 *
 * CM addresses live in ECHO_CM (filled after `deploy-one.mjs`).
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
import { ECHO_COLLECTION, ECHO_WAVE1 } from './echo';

export const ECHO_TREASURY = 'AdvMvv6GzGvdLRtuxaso1Eubk7jmn6LCZEeEFHn22yeb';
export const ECHO_FEE_BUFFER_SOL = 0.02;
export const ECHO_MAX_PER_WALLET = 5;
export const ECHO_WAVE = 1;

/**
 * Wave 1 candy machines — set candyMachine + candyGuard after deploy-one.mjs.
 * Leave null until that rarity is live on-chain.
 */
export const ECHO_CM = {
  common: {
    ...ECHO_WAVE1.common,
    candyMachine: '2paivyfk7tLazrxs8rXDQx1CLMFXcbuXVpE8n3EvhqUM',
    candyGuard: '7zJVBJxM6TrXpjeMDcLBaHiVZ1Si8YAoVjyTJEY5nUtF',
    collection: ECHO_COLLECTION,
    treasury: ECHO_TREASURY,
    feeBufferSol: ECHO_FEE_BUFFER_SOL,
    maxPerWallet: ECHO_MAX_PER_WALLET,
    wave: ECHO_WAVE,
    name: 'Echo',
  },
  rare: {
    ...ECHO_WAVE1.rare,
    candyMachine: 'CtrcxAdhVSUGhT4iddHn4Hg46o7mBPQrqhzkhuqPAktN',
    candyGuard: '9k6j5gR69etyubH7fgsZDA876JaeCSdwDrkwZgwLQ47V',
    collection: ECHO_COLLECTION,
    treasury: ECHO_TREASURY,
    feeBufferSol: ECHO_FEE_BUFFER_SOL,
    maxPerWallet: ECHO_MAX_PER_WALLET,
    wave: ECHO_WAVE,
    name: 'Echo',
  },
  epic: {
    ...ECHO_WAVE1.epic,
    candyMachine: 'H1T9ocEqMwNeqVvJzhmsjxb1cHgVtz1qiSyqs71ineGy',
    candyGuard: '7S2yBiVbo2HQfo4Y7LtR1DkwBcEGvtZkz4y5Fa1NDipS',
    collection: ECHO_COLLECTION,
    treasury: ECHO_TREASURY,
    feeBufferSol: ECHO_FEE_BUFFER_SOL,
    maxPerWallet: ECHO_MAX_PER_WALLET,
    wave: ECHO_WAVE,
    name: 'Echo',
  },
  legendary: {
    ...ECHO_WAVE1.legendary,
    candyMachine: 'EndYgu5PtEnSnv2XyQSmnfoUJ6kLi1WectCGkTpmoL8G',
    candyGuard: 'CJwCnfkrVUSqY2AHqruMGTgud1WbumGtauNUCE4Vc9wZ',
    collection: ECHO_COLLECTION,
    treasury: ECHO_TREASURY,
    feeBufferSol: ECHO_FEE_BUFFER_SOL,
    maxPerWallet: ECHO_MAX_PER_WALLET,
    wave: ECHO_WAVE,
    name: 'Echo',
  },
};

// Optional runtime overrides from /echo-cm.json (public) — deployed after setup-wave
let _cmLoaded = false;
export async function loadEchoCmConfig() {
  if (_cmLoaded || typeof fetch === 'undefined') return ECHO_CM;
  try {
    const res = await fetch('/echo-cm.json', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      for (const key of Object.keys(ECHO_CM)) {
        if (data[key]?.candyMachine) {
          ECHO_CM[key].candyMachine = data[key].candyMachine;
          ECHO_CM[key].candyGuard = data[key].candyGuard || null;
          if (data[key].imageUri) ECHO_CM[key].imageUri = data[key].imageUri;
        }
      }
    }
  } catch {
    /* optional file */
  }
  _cmLoaded = true;
  return ECHO_CM;
}

export function isEchoMintLive(rarityKey) {
  const c = ECHO_CM[rarityKey];
  return !!(c?.candyMachine && c?.candyGuard);
}

export function minSolForEchoMint(rarityKey) {
  const c = ECHO_CM[rarityKey] || ECHO_CM.common;
  return (Number(c.priceSol) || 0) + (Number(c.feeBufferSol) || ECHO_FEE_BUFFER_SOL);
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

export async function assertWalletCanMintEcho(walletAddress, rarityKey) {
  const cfg = ECHO_CM[rarityKey];
  if (!cfg) throw new Error('Unknown Echo rarity');
  if (!isEchoMintLive(rarityKey)) {
    throw new Error(
      `Echo ${cfg.label} Wave 1 mint is not live yet (candy machine not deployed).`,
    );
  }
  const need = minSolForEchoMint(rarityKey);
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
      `Not enough SOL to mint Echo ${cfg.label}. Need at least ${need.toFixed(2)} SOL ` +
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
 * Mint one Echo of the given rarity from Wave 1 CM.
 * @param {string} secretPhraseOrBase58
 * @param {'common'|'rare'|'epic'|'legendary'} rarityKey
 */
export async function mintEchoWave1(secretPhraseOrBase58, rarityKey = 'common') {
  if (!secretPhraseOrBase58) {
    throw new Error('Wallet secret not available. Unlock your game wallet first.');
  }
  await loadEchoCmConfig();
  const cfg = ECHO_CM[rarityKey];
  if (!cfg) throw new Error('Unknown Echo rarity');
  if (!isEchoMintLive(rarityKey)) {
    throw new Error(
      `Echo ${cfg.label} is listed but Wave 1 candy machine is not live yet.`,
    );
  }

  const umi = umiFromSecret(secretPhraseOrBase58);
  const owner = umi.identity.publicKey.toString();
  await assertWalletCanMintEcho(owner, rarityKey);
  await assertWalletCanMintEcho(owner, rarityKey);

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
    name: `Echo ${cfg.label}`,
    rarity: cfg.label,
  };
}
