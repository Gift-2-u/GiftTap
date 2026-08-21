/**
 * Mint GiftLocksmith Wave 1 from Core Candy Machine (mainnet).
 * Pays 0.10 SOL via solPayment guard to treasury (must match on-chain CM).
 *
 * Royalties: collection FQPYWS… has 5% (500 bps) → AdvMvv6… (Metaplex: applies to
 * all assets in the collection). CM mint does not set per-asset plugins.
 * To pin 5% on each asset for explorers: scripts/nft/gift-locksmith/fix-royalties.mjs
 *
 * CRITICAL: Always pre-check SOL before sendAndConfirm so players
 * without 0.10+fees never pay rent/bot-tax/network fees for a failed mint.
 *
 * Candy Machine botTax is 0.001 SOL — if we send a mint with too little SOL,
 * solPayment fails but the tx can still "succeed" and charge bot tax.
 * That is why the button must stay off under the minimum.
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
import {
  LOCKSMITH_COLLECTION,
} from './locksmith';

export const LOCKSMITH_WAVE1 = {
  candyMachine: 'AQbpmorxtBaaipqm4WcmCyBzci8Qf8km9qF8kAidsMkC',
  candyGuard: 'CBK1Zwsnwwks3BLmhHASzD9Rsq8i2Xgs6RWMZGNSQRJ9',
  collection: LOCKSMITH_COLLECTION,
  treasury: 'AdvMvv6GzGvdLRtuxaso1Eubk7jmn6LCZEeEFHn22yeb',
  /** On-chain solPayment guard amount (must match candy guard) */
  /** Free wall→5 + Common Walk2u Shoe + Walk2u path (above single climb 0.025) */
  priceSol: 0.10,
  /**
   * Rent for Core asset + CU priority + botTax(0.001) + slack.
   * Never allow a mint attempt without price + this buffer.
   */
  feeBufferSol: 0.02,
  maxPerWallet: 5,
  itemsAvailable: 500,
  wave: 1,
  name: 'GiftLocksmith',
  imageUri:
    'https://gateway.irys.xyz/HXQ5D7Iu_vkgUsW4I6W7LQ0Vn3J5rTQJXkgxMwh28k4',
};

/** Minimum SOL the game wallet must hold before we allow a mint attempt. */
export function minSolForLocksmithMint() {
  return LOCKSMITH_WAVE1.priceSol + LOCKSMITH_WAVE1.feeBufferSol;
}

/**
 * @param {string} walletAddress - base58 pubkey
 * @returns {Promise<number>} SOL balance (float)
 */
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

/**
 * Throws a clear error if wallet cannot afford mint + fees.
 * Call this BEFORE building / sending any mint transaction.
 * @param {string} walletAddress
 * @returns {Promise<{ sol: number, need: number }>}
 */
export async function assertWalletCanMintLocksmith(walletAddress) {
  const need = minSolForLocksmithMint();
  let sol = 0;
  try {
    sol = await getWalletSolBalance(walletAddress);
  } catch (e) {
    throw new Error(
      `Could not check wallet SOL balance. Try again in a moment. (${e?.message || e})`,
    );
  }
  if (!(sol >= need)) {
    throw new Error(
      `Not enough SOL to mint GiftLocksmith. Need at least ${need.toFixed(2)} SOL ` +
        `(${LOCKSMITH_WAVE1.priceSol} mint + ~${LOCKSMITH_WAVE1.feeBufferSol} network/rent). ` +
        `Your game wallet has ${Number(sol).toFixed(4)} SOL. ` +
        `Deposit SOL first — mint is blocked so you do not lose bot-tax/network fees.`,
    );
  }
  return { sol, need };
}

/**
 * Resolve the public key that will sign the mint (from phrase or base58 secret).
 * @param {string} secretPhraseOrBase58
 * @returns {string} base58 pubkey
 */
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
 * Mint one GiftLocksmith from Wave 1 Core Candy Machine.
 * Never sends a transaction if the signing wallet has less than price + fee buffer.
 *
 * @param {string} secretPhraseOrBase58 - game wallet mnemonic or base58 secret
 * @returns {Promise<{ asset: string, signature: string, owner: string, priceSol: number, name: string }>}
 */
export async function mintLocksmithWave1(secretPhraseOrBase58) {
  if (!secretPhraseOrBase58) {
    throw new Error('Wallet secret not available. Unlock your game wallet first.');
  }

  // Resolve signer FIRST and gate on THAT wallet (not a stale playerWallet prop)
  const umi = umiFromSecret(secretPhraseOrBase58);
  const owner = umi.identity.publicKey.toString();

  // HARD STOP #1: never build/send without enough SOL
  await assertWalletCanMintLocksmith(owner);

  // HARD STOP #2: re-check immediately before network submit (balance can change)
  await assertWalletCanMintLocksmith(owner);

  const asset = generateSigner(umi);
  const candyMachine = publicKey(LOCKSMITH_WAVE1.candyMachine);
  const collection = publicKey(LOCKSMITH_WAVE1.collection);
  const treasury = publicKey(LOCKSMITH_WAVE1.treasury);

  const builder = transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 400_000 }))
    .add(
      mintV1(umi, {
        candyMachine,
        asset,
        collection,
        candyGuard: publicKey(LOCKSMITH_WAVE1.candyGuard),
        mintArgs: {
          solPayment: some({ destination: treasury }),
          mintLimit: some({ id: LOCKSMITH_WAVE1.wave }),
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
    priceSol: LOCKSMITH_WAVE1.priceSol,
    name: LOCKSMITH_WAVE1.name,
  };
}
