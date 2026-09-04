/**
 * Shared game-wallet signing helpers for site + game.
 * HARD SECURITY: ciphertext only via wallet-vault unlock + account password.
 * AES key remains vaultSaltFor(playerId) (existing vaults). JWT alone cannot drain.
 */
import CryptoJS from 'crypto-js';
import bs58 from 'bs58';
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { vaultSaltFor, getPlayerId } from './playerIdentity';
import { keypairFromMnemonic } from './solanaWallet';
import { MINT_ADDRESS } from './config';
import { secureUnlockVault } from './secureApi';

export const RPC_URL =
  import.meta.env.VITE_SOLANA_RPC_URL ||
  'https://mainnet.helius-rpc.com/?api-key=538f6c8f-c773-46a2-939c-6d48c75b2226';

export const TREASURY = new PublicKey('8G7uEcPS6dwA5wW9bGoqi98EzBunF8trjbbFJkgkvBPm');

/** SPL mints — G2U always from config.js (canonical mint). */
export const TOKEN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  G2U: MINT_ADDRESS.toBase58(),
};

/** On-chain decimals for Jupiter amount math (G2U is 9 — NOT 6 like USDC). */
export const TOKEN_DECIMALS = {
  SOL: 9,
  USDC: 6,
  G2U: 9,
  GFT: 9,
};

export function tokenDecimals(symbol) {
  const key = String(symbol || '').toUpperCase();
  const n = TOKEN_DECIMALS[key];
  if (typeof n === 'number' && n >= 0) return n;
  // Safe default for unknown SPL: 6 (USDC-style). Never assume G2U is 6.
  return 6;
}

export function toAtomicAmount(uiAmount, symbol) {
  const amt = Number(uiAmount);
  if (!Number.isFinite(amt) || amt <= 0) return 0;
  const dec = tokenDecimals(symbol);
  return Math.floor(amt * 10 ** dec);
}

export function fromAtomicAmount(atomic, symbol, fractionDigits = 4) {
  const raw = typeof atomic === 'bigint' ? Number(atomic) : parseInt(String(atomic), 10);
  if (!Number.isFinite(raw) || raw <= 0) return (0).toFixed(fractionDigits);
  const dec = tokenDecimals(symbol);
  return (raw / 10 ** dec).toFixed(fractionDigits);
}

/** Jupiter platform fee ATAs (token accounts for each mint under TREASURY). */
export const TREASURY_TOKEN_ACCOUNTS = {
  USDC: 'H5nSSix2Q4xrSPJCn8f4tY2FNDRazeUot1MNcgATYKEq',
  G2U: getAssociatedTokenAddressSync(MINT_ADDRESS, TREASURY).toBase58(),
  SOL: 'GwEPP1njWswga8JoCnQ7AyvJJeqxkx8GzW5o5HFsN1F1',
};

function decryptWallet(encryptedData, aesKey) {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, aesKey);
    return bytes.toString(CryptoJS.enc.Utf8) || null;
  } catch {
    return null;
  }
}

/**
 * Unlock game wallet keypair.
 * @param {object|string} [opts] — playerId string (legacy) OR
 *   { playerId?, phrase?, password? }
 * Prefer phrase already in RAM. Otherwise password → Edge unlock (never JWT-only get).
 */
export async function unlockGameKeypair(opts = {}) {
  const options =
    typeof opts === 'string' || opts == null
      ? { playerId: opts || getPlayerId() }
      : opts;
  const playerId = options.playerId || getPlayerId();
  if (!playerId) throw new Error('Not logged in to a Gift Tap account.');

  let secret =
    (options.phrase && String(options.phrase).trim()) ||
    (options.mnemonic && String(options.mnemonic).trim()) ||
    null;

  if (!secret) {
    let password = options.password ? String(options.password) : '';
    if (!password && typeof window !== 'undefined') {
      password =
        window.prompt(
          'Enter your account password to unlock your wallet for this transaction:',
        ) || '';
    }
    if (!password || password.length < 6) {
      throw new Error('Password required to unlock wallet');
    }
    const vaultRes = await secureUnlockVault(password);
    if (!vaultRes?.encrypted_vault) {
      throw new Error(
        vaultRes?.message ||
          'Game wallet vault not found. Open Gift Tap once to finish setup.',
      );
    }
    secret = decryptWallet(
      vaultRes.encrypted_vault,
      vaultSaltFor(String(playerId)),
    );
  }

  if (!secret) {
    throw new Error('Could not unlock game wallet. Wrong password or vault missing.');
  }

  if (secret.includes(' ')) {
    return keypairFromMnemonic(secret.trim());
  }
  return Keypair.fromSecretKey(bs58.decode(secret));
}

export function getConnection() {
  return new Connection(RPC_URL, 'confirmed');
}

/** Send SOL from game wallet (+ small platform fee). */
export async function sendSolFromGameWallet({ toAddress, amountSol, password, phrase } = {}) {
  const amount = parseFloat(amountSol);
  if (!toAddress || !amount || amount <= 0) throw new Error('Enter destination and amount.');

  let dest;
  try {
    dest = new PublicKey(toAddress.trim());
  } catch {
    throw new Error('Invalid Solana address.');
  }

  const keypair = await unlockGameKeypair({ password, phrase });
  const connection = getConnection();
  const withdrawLamports = Math.floor(amount * LAMPORTS_PER_SOL);
  const feeLamports = Math.floor(0.0005 * LAMPORTS_PER_SOL);
  const bal = await connection.getBalance(keypair.publicKey);
  const need = withdrawLamports + feeLamports + 1_000_000;
  if (bal < need) {
    throw new Error(`Insufficient SOL. Need at least ${(need / LAMPORTS_PER_SOL).toFixed(4)} SOL.`);
  }

  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: dest,
      lamports: withdrawLamports,
    }),
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: TREASURY,
      lamports: feeLamports,
    }),
  );

  const latest = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = latest.blockhash;
  tx.feePayer = keypair.publicKey;

  const sig = await sendAndConfirmTransaction(connection, tx, [keypair]);
  return { signature: sig, publicKey: keypair.publicKey.toBase58() };
}

/** Jupiter swap from game wallet (SOL / USDC / G2U). */
export async function swapFromGameWallet({ fromToken, toToken, amount, password, phrase } = {}) {
  const amt = parseFloat(amount);
  if (!amt || amt <= 0) throw new Error('Enter an amount to swap.');
  if (fromToken === toToken) throw new Error('Choose two different tokens.');

  const keypair = await unlockGameKeypair({ password, phrase });
  const connection = getConnection();
  const inputMint = TOKEN_MINTS[fromToken];
  const outputMint = TOKEN_MINTS[toToken];
  if (!inputMint || !outputMint || String(inputMint).includes('YOUR_')) {
    throw new Error('That token is not available for swap yet.');
  }

  const amountIn = toAtomicAmount(amt, fromToken);
  if (!amountIn) throw new Error('Enter an amount to swap.');

  // Do NOT pass platformFeeBps until Jupiter referral fee ATAs exist for every
  // output mint (treasury currently has no $G2U ATA → SOL→G2U always 400).
  const quoteRes = await fetch(
    `https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountIn}&slippageBps=500`,
  );
  const quoteResponse = await quoteRes.json();
  if (quoteResponse.error || quoteResponse.errorMessage) {
    throw new Error(
      quoteResponse.error ||
        quoteResponse.errorMessage ||
        'Jupiter quote failed',
    );
  }
  if (!quoteResponse.outAmount) throw new Error('No swap route available.');

  const swapBody = {
    quoteResponse,
    userPublicKey: keypair.publicKey.toString(),
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: { autoMultiplier: 2 },
  };

  const swapRes = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(swapBody),
  });
  const swapJson = await swapRes.json().catch(() => ({}));
  if (!swapRes.ok || !swapJson?.swapTransaction) {
    throw new Error(
      swapJson?.error ||
        swapJson?.errorMessage ||
        swapJson?.message ||
        `Failed to build swap transaction (${swapRes.status})`,
    );
  }
  const { swapTransaction } = swapJson;

  const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
  tx.sign([keypair]);
  const raw = tx.serialize();
  const signature = await connection.sendRawTransaction(raw, {
    skipPreflight: true,
    maxRetries: 2,
  });

  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    {
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
      signature,
    },
    'confirmed',
  );

  return { signature, publicKey: keypair.publicKey.toBase58() };
}

export async function quoteJupiter({ fromToken, toToken, amount }) {
  const amt = parseFloat(amount);
  if (!amt || amt <= 0) return '';
  const inputMint = TOKEN_MINTS[fromToken];
  const outputMint = TOKEN_MINTS[toToken];
  if (!inputMint || !outputMint || String(inputMint).includes('YOUR_')) return '';
  const amountIn = toAtomicAmount(amt, fromToken);
  if (!amountIn) return '';
  const res = await fetch(
    `https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountIn}&slippageBps=200`,
  );
  const quote = await res.json();
  if (!quote?.outAmount) return '';
  return fromAtomicAmount(quote.outAmount, toToken, 4);
}
