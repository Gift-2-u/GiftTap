/**
 * Username + password auth (client-side via Supabase).
 * Signup always creates a Solana wallet so wallet_address NOT NULL is satisfied.
 */

import CryptoJS from 'crypto-js';
import { Keypair } from '@solana/web3.js';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { supabase } from './supabaseClient';
import { vaultSaltFor, applyAuthSession, setSessionToken } from './playerIdentity';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const SOLANA_PATH = "m/44'/501'/0'/0'";

/** Same mint path as create-user-wallet Edge — always 12 BIP39 words (never raw base58). */
function mintMnemonicWallet() {
  const mnemonic = bip39.generateMnemonic();
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const seedHex = Array.from(seed)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const { key } = derivePath(SOLANA_PATH, seedHex);
  const keypair = Keypair.fromSeed(key);
  return {
    publicKey: keypair.publicKey.toBase58(),
    secret: mnemonic,
    mnemonic,
  };
}

function bytesToB64(bytes) {
  let s = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return `pbkdf2_sha256$100000$${bytesToB64(salt)}$${bytesToB64(bits)}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
  const iterations = parseInt(parts[1], 10);
  const salt = b64ToBytes(parts[2]);
  const expected = parts[3];
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return bytesToB64(bits) === expected;
}

function encryptVault(secret, playerId) {
  return CryptoJS.AES.encrypt(secret, vaultSaltFor(playerId)).toString();
}

/**
 * Create Solana wallet for signup (no JWT yet).
 * Always returns a 12-word BIP39 mnemonic — never a raw base58 secret key.
 * (Edge create-user-wallet needs a session JWT, so signup mints locally the same way.)
 */
async function createSolanaWallet(_playerId, _username) {
  return mintMnemonicWallet();
}

export function formatAuthError(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error && err.message && err.message !== '[object Object]') {
    return err.message;
  }
  if (err.message && typeof err.message === 'string') return err.message;
  if (err.error && typeof err.error === 'string') return err.error;
  if (err.details && typeof err.details === 'string') return err.details;
  if (err.hint && typeof err.hint === 'string') return err.hint;
  if (err.code) return `${err.code}: ${err.message || err.details || 'request failed'}`;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Sign up failed. Check the browser console (F12).';
  }
}

/** Players choose their own name at signup — no auto Elf_ prefix. */
export function suggestUsername() {
  return '';
}

/**
 * Create account + wallet in one step (wallet_address is required NOT NULL in DB).
 */
export async function registerAccount(username, password, captchaToken = '') {
  const cleanName = String(username || '').trim();
  const pass = String(password || '');

  if (!USERNAME_RE.test(cleanName)) {
    throw new Error('Username must be 3–20 characters: letters, numbers, underscore only.');
  }
  if (pass.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }
  if (cleanName.toLowerCase() === 'player') {
    throw new Error('Username "Player" is reserved. Pick a unique name.');
  }

  const base = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !anon) {
    throw new Error('App is missing Supabase config.');
  }

  // Create wallet locally first (Edge create-user-wallet needs JWT after account exists)
  let wallet;
  try {
    wallet = await createSolanaWallet(null, cleanName);
  } catch (e) {
    console.warn('mintMnemonicWallet retry', e?.message || e);
    wallet = mintMnemonicWallet();
  }
  if (!wallet?.publicKey || !wallet?.secret || !String(wallet.secret).includes(' ')) {
    wallet = mintMnemonicWallet();
  }

  // Encrypt vault for optional pass-through to auth-register (stored in player_secrets)
  // player_id is assigned by Edge — re-encrypt after we know final id if needed.
  // auth-register will store vault under final playerId; client may re-set via wallet-vault.

  const res = await fetch(`${base}/functions/v1/auth-register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anon}`,
      apikey: anon,
    },
    body: JSON.stringify({
      username: cleanName,
      password: pass,
      wallet_address: wallet.publicKey,
      captcha_token: captchaToken || undefined,
      // vault re-keyed after we know player_id — send null for now if salt uses id
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `Sign up failed (${res.status})`);
  }

  const playerId = data.player_id;
  const encrypted_vault = encryptVault(wallet.secret, playerId);

  // Store vault via temporary: login then set_if_empty
  if (data.session_token) {
    setSessionToken(data.session_token, data.expires_at);
  }
  applyAuthSession({
    playerId,
    username: data.username || cleanName,
    sessionToken: data.session_token,
    expiresAt: data.expires_at,
  });

  // Put vault in player_secrets via wallet-vault Edge
  try {
    const vaultRes = await fetch(`${base}/functions/v1/wallet-vault`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anon}`,
        apikey: anon,
        'x-gift-session': data.session_token || '',
      },
      body: JSON.stringify({ action: 'set_if_empty', encrypted_vault }),
    });
    await vaultRes.json().catch(() => ({}));
  } catch (e) {
    console.warn('post-register vault:', e?.message || e);
  }

  return {
    success: true,
    player_id: playerId,
    username: data.username || cleanName,
    wallet_address: data.wallet_address || wallet.publicKey,
    mnemonic: wallet.secret,
    session_token: data.session_token || null,
    expires_at: data.expires_at || null,
  };
}

export async function loginAccount(username, password, captchaToken = '') {
  const cleanName = String(username || '').trim();
  const pass = String(password || '');

  if (!cleanName || !pass) {
    throw new Error('Username and password are required.');
  }

  const base = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !anon) {
    throw new Error('App is missing Supabase config. Check VITE_SUPABASE_URL / ANON_KEY.');
  }

  // HARD SECURITY: password is in player_secrets — only Edge can verify.
  // Never select password_hash from the client (column removed / unreadable).
  const res = await fetch(`${base}/functions/v1/auth-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anon}`,
      apikey: anon,
    },
    body: JSON.stringify({
      username: cleanName,
      password: pass,
      captcha_token: captchaToken || undefined,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `Login failed (${res.status})`);
  }
  if (!data.player_id) {
    throw new Error(data.error || 'Login failed — no player returned.');
  }
  if (data.session_token) {
    setSessionToken(data.session_token, data.expires_at);
  }
  applyAuthSession({
    playerId: data.player_id,
    username: data.username,
    sessionToken: data.session_token,
    expiresAt: data.expires_at,
  });
  return {
    success: true,
    player_id: data.player_id,
    username: data.username,
    wallet_address: data.wallet_address,
    has_beta_access: data.has_beta_access !== false,
    has_vault: !!data.has_vault,
    session_token: data.session_token || null,
    expires_at: data.expires_at || null,
  };
}

export async function claimAccountCredentials({ playerId, username, password }) {
  const cleanName = String(username || '').trim();
  const pass = String(password || '');
  const id = String(playerId || '');

  if (!id) throw new Error('Not logged in.');
  if (!USERNAME_RE.test(cleanName)) {
    throw new Error('Username must be 3–20 characters: letters, numbers, underscore only.');
  }
  if (pass.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }
  if (cleanName.toLowerCase() === 'player') {
    throw new Error('Username "Player" is reserved. Keep your Telegram name or pick a new unique one.');
  }

  // Unique among OTHER players
  const { data: taken, error: checkErr } = await supabase
    .from('players')
    .select('telegram_id')
    .ilike('username', cleanName)
    .maybeSingle();

  if (checkErr) throw new Error(formatAuthError(checkErr));
  if (taken && String(taken.telegram_id) !== id) {
    throw new Error('That username is already taken. Choose another or keep your current one.');
  }

  let password_hash;
  try {
    password_hash = await hashPassword(pass);
  } catch {
    throw new Error('Could not secure password. Use a modern browser.');
  }

  const { error: updateError } = await supabase
    .from('players')
    .update({
      username: cleanName,
      password_hash,
    })
    .eq('telegram_id', id);

  if (updateError) {
    const msg = formatAuthError(updateError);
    if (updateError.code === '23505' || /unique|duplicate/i.test(msg)) {
      throw new Error('That username is already taken.');
    }
    if (/password_hash/i.test(msg)) {
      throw new Error(
        'Database missing password_hash. Run SQL: alter table players add column if not exists password_hash text;',
      );
    }
    throw new Error(msg);
  }

  return { success: true, username: cleanName };
}

/** Check if this player still needs to set a password (TG restore). */
export async function playerNeedsPassword(playerId) {
  if (!playerId) return false;
  try {
    const base = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const tok = localStorage.getItem('gift2u_session_token');
    if (!base || !anon || !tok) return false;
    const res = await fetch(`${base}/functions/v1/wallet-vault`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anon}`,
        apikey: anon,
        'x-gift-session': tok,
      },
      body: JSON.stringify({ action: 'status' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return false;
    return data.has_password === false;
  } catch {
    return false;
  }
}
