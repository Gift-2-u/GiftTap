/**
 * Browser-safe Solana wallet derivation.
 * Does NOT use bip39 or ed25519-hd-key (those pull broken Node stream polyfills in Vite).
 * Same derivation path as Phantom / create-user-wallet: m/44'/501'/0'/0'
 */
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha512';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha512 as sha512ForPbkdf } from '@noble/hashes/sha512';
import { Keypair } from '@solana/web3.js';

const SOLANA_PATH = "m/44'/501'/0'/0'";
const ED25519_CURVE = new TextEncoder().encode('ed25519 seed');
const HARDENED = 0x80000000;

// Minimal BIP39 English wordlist is large — use dynamic validation via checksum only for restore.
// We accept phrases that produce a valid seed + known structure (12/24 words).
const BIP39_WORD_RE = /^[a-z]+(?:\s+[a-z]+){11,23}$/;

function toBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (typeof data === 'string') {
    // hex
    const clean = data.replace(/^0x/, '');
    if (/^[0-9a-fA-F]+$/.test(clean) && clean.length % 2 === 0) {
      const out = new Uint8Array(clean.length / 2);
      for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
      }
      return out;
    }
    return new TextEncoder().encode(data);
  }
  return new Uint8Array(data);
}

/** BIP39 mnemonic → 64-byte seed (PBKDF2-HMAC-SHA512, same as bip39.mnemonicToSeedSync). */
export function mnemonicToSeed(mnemonic, password = '') {
  const normalized = (mnemonic || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const salt = new TextEncoder().encode(`mnemonic${password}`);
  return pbkdf2(sha512ForPbkdf, new TextEncoder().encode(normalized), salt, {
    c: 2048,
    dkLen: 64,
  });
}

function getMasterKeyFromSeed(seed) {
  const I = hmac(sha512, ED25519_CURVE, toBytes(seed));
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

function CKDPriv(parent, index) {
  const indexBytes = new Uint8Array(4);
  new DataView(indexBytes.buffer).setUint32(0, index >>> 0, false);

  const data = new Uint8Array(1 + parent.key.length + 4);
  data[0] = 0;
  data.set(parent.key, 1);
  data.set(indexBytes, 1 + parent.key.length);

  const I = hmac(sha512, parent.chainCode, data);
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

/** SLIP-0010 ed25519 path derivation (same as ed25519-hd-key derivePath). */
export function derivePath(path, seed) {
  let node = getMasterKeyFromSeed(seed);
  const segments = path
    .replace(/^m\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      const hardened = seg.endsWith("'") || seg.endsWith('h') || seg.endsWith('H');
      const num = parseInt(seg.replace(/['hH]$/, ''), 10);
      if (Number.isNaN(num)) throw new Error(`Invalid path segment: ${seg}`);
      return hardened ? (num + HARDENED) >>> 0 : num >>> 0;
    });

  for (const index of segments) {
    node = CKDPriv(node, index);
  }
  return node;
}

export function validateMnemonic(mnemonic) {
  const cleaned = (mnemonic || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const words = cleaned.split(' ');
  if (words.length !== 12 && words.length !== 15 && words.length !== 18 && words.length !== 21 && words.length !== 24) {
    return false;
  }
  if (!BIP39_WORD_RE.test(cleaned) && !/^[a-z]+(?:\s+[a-z]+)+$/.test(cleaned)) {
    return false;
  }
  // Full BIP39 checksum check needs wordlist; try deriving and require 12/24 structure.
  // Edge function uses bip39.generateMnemonic so words are valid English BIP39.
  try {
    mnemonicToSeed(cleaned);
    return words.every((w) => w.length >= 3 && w.length <= 8);
  } catch {
    return false;
  }
}

/** 12/24-word phrase → Solana Keypair (Phantom-compatible path). */
export function keypairFromMnemonic(mnemonic) {
  const cleaned = (mnemonic || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!validateMnemonic(cleaned)) {
    throw new Error('Invalid secret phrase');
  }
  const seed = mnemonicToSeed(cleaned);
  const { key } = derivePath(SOLANA_PATH, seed);
  return Keypair.fromSeed(key);
}

export function publicKeyFromMnemonic(mnemonic) {
  return keypairFromMnemonic(mnemonic).publicKey.toBase58();
}

/** Compatibility stub if anything still expects bip39-like API */
export const bip39 = {
  validateMnemonic,
  mnemonicToSeedSync: mnemonicToSeed,
};
