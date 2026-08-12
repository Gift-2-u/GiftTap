/**
 * Username + password auth (client-side via Supabase).
 * Signup always creates a Solana wallet so wallet_address NOT NULL is satisfied.
 */

import CryptoJS from 'crypto-js';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { supabase } from './supabaseClient';
import { vaultSaltFor, applyAuthSession, setSessionToken } from './playerIdentity';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

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
 * Create Solana wallet. Prefer edge function (12-word phrase); fallback Keypair.generate().
 */
async function createSolanaWallet(playerId, username) {
  const base = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (base && anon) {
    try {
      const res = await fetch(`${base}/functions/v1/create-user-wallet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anon}`,
        },
        body: JSON.stringify({ telegram_id: playerId, username }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.publicKey && (data.mnemonic || data.secretKey)) {
        return {
          publicKey: data.publicKey,
          secret: data.mnemonic || data.secretKey,
        };
      }
      console.warn('create-user-wallet failed, using local keypair:', data.error || res.status);
    } catch (e) {
      console.warn('create-user-wallet network error, using local keypair:', e);
    }
  }

  // Fallback — always produces a valid wallet_address (base58 secret, not 12 words)
  const kp = Keypair.generate();
  return {
    publicKey: kp.publicKey.toBase58(),
    secret: bs58.encode(kp.secretKey),
  };
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
export async function registerAccount(username, password) {
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

  const { data: existing, error: checkErr } = await supabase
    .from('players')
    .select('telegram_id')
    .ilike('username', cleanName)
    .maybeSingle();

  if (checkErr) throw new Error(formatAuthError(checkErr));
  if (existing) throw new Error('That username is already taken. Choose another.');

  const playerId = crypto.randomUUID();

  let password_hash;
  try {
    password_hash = await hashPassword(pass);
  } catch {
    throw new Error('Could not secure password. Use a modern browser (or HTTPS).');
  }

  // REQUIRED: wallet before insert (DB not-null on wallet_address)
  const wallet = await createSolanaWallet(playerId, cleanName);
  if (!wallet.publicKey) {
    throw new Error('Could not create wallet. Try again.');
  }

  const encrypted_vault = encryptVault(wallet.secret, playerId);

  const row = {
    telegram_id: playerId,
    username: cleanName,
    password_hash,
    wallet_address: wallet.publicKey,
    encrypted_vault,
    has_beta_access: true, // public launch — open to everyone
    shard_balance: 0,
    season_shards: 0,
    lifetime_taps: 0,
    sol_balance: 0,
    usdc_balance: 0,
  };

  const { error: insertError } = await supabase.from('players').insert(row);

  if (insertError) {
    const msg = formatAuthError(insertError);
    if (msg.includes('password_hash') || insertError.message?.includes('password_hash')) {
      throw new Error(
        'Database missing password_hash column. In Supabase SQL run: alter table players add column if not exists password_hash text;',
      );
    }
    if (insertError.code === '23505' || /unique|duplicate/i.test(msg)) {
      throw new Error('That username is already taken. Choose another.');
    }
    throw new Error(msg);
  }

  // Issue session JWT via edge login when available
  let session_token = null;
  let expires_at = null;
  try {
    const logged = await loginAccount(cleanName, pass);
    session_token = logged.session_token || null;
    expires_at = logged.expires_at || null;
  } catch (e) {
    console.warn('post-register session:', e?.message || e);
    applyAuthSession({ playerId, username: cleanName });
  }

  return {
    success: true,
    player_id: playerId,
    username: cleanName,
    wallet_address: wallet.publicKey,
    /** Pass to UI so user can back up (12 words or base58 secret) */
    mnemonic: wallet.secret,
    session_token,
    expires_at,
  };
}

export async function loginAccount(username, password) {
  const cleanName = String(username || '').trim();
  const pass = String(password || '');

  if (!cleanName || !pass) {
    throw new Error('Username and password are required.');
  }

  const base = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // Prefer Edge auth-login (issues session JWT for hard security)
  if (base && anon) {
    try {
      const res = await fetch(`${base}/functions/v1/auth-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anon}`,
          apikey: anon,
        },
        body: JSON.stringify({ username: cleanName, password: pass }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.message || `Login failed (${res.status})`);
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
        has_beta_access: !!data.has_beta_access,
        has_vault: !!data.has_vault,
        session_token: data.session_token || null,
        expires_at: data.expires_at || null,
      };
    } catch (e) {
      // Fall through to client verify if edge unavailable
      console.warn('auth-login edge:', e?.message || e);
    }
  }

  const { data: row, error } = await supabase
    .from('players')
    .select('telegram_id, username, password_hash, wallet_address, has_beta_access, encrypted_vault')
    .ilike('username', cleanName)
    .maybeSingle();

  if (error) throw new Error(formatAuthError(error));
  if (!row) throw new Error('No account with that username.');
  if (!row.password_hash) {
    throw new Error(
      'This account has no password. Use the "12 words" tab once, or create a new account.',
    );
  }

  const ok = await verifyPassword(pass, row.password_hash);
  if (!ok) throw new Error('Wrong password.');

  // No Edge JWT — still bind identity and CLEAR any previous account session token
  applyAuthSession({
    playerId: row.telegram_id,
    username: row.username,
    sessionToken: null,
  });

  return {
    success: true,
    player_id: row.telegram_id,
    username: row.username,
    wallet_address: row.wallet_address,
    has_beta_access: !!row.has_beta_access,
    has_vault: !!row.encrypted_vault,
    session_token: null,
    expires_at: null,
  };
}

/**
 * For Telegram / 12-word restored accounts:
 * keep or change username + set password so they can log in on any device.
 */
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
  const { data, error } = await supabase
    .from('players')
    .select('password_hash')
    .eq('telegram_id', String(playerId))
    .maybeSingle();
  if (error || !data) return false;
  return !data.password_hash;
}
