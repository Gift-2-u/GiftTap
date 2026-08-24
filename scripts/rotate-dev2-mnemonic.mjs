/**
 * One-shot: rotate DEV2 in-game wallet to a real BIP39 12-word phrase.
 * Prints the mnemonic ONCE — save it. Updates wallet_address + encrypted_vault via SQL API.
 */
import fs from 'fs';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { Keypair } from '@solana/web3.js';
import CryptoJS from 'crypto-js';

const TOKEN = fs.readFileSync('/home/tower/.supabase/access-token', 'utf8').trim();
const PROJECT = 'ncwlbwzxfpcnxkyrmdck';
const URL = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;

function vaultSaltFor(playerId) {
  return `${String(playerId || '').trim()}_GIFT_memecoin_secure_salt_2026`;
}

async function q(sql) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${text}`);
  }
  return json;
}

function esc(s) {
  return String(s).replace(/'/g, "''");
}

function mintMnemonicWallet() {
  const mnemonic = bip39.generateMnemonic();
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const seedHex = Array.from(seed)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const { key } = derivePath("m/44'/501'/0'/0'", seedHex);
  const keypair = Keypair.fromSeed(key);
  return {
    mnemonic,
    publicKey: keypair.publicKey.toBase58(),
  };
}

const rows = await q(
  "select telegram_id, username, wallet_address from players where lower(username)='dev2' limit 5",
);
console.log('players', rows);
if (!Array.isArray(rows) || !rows.length) {
  throw new Error('dev2 not found');
}
const playerId = String(rows[0].telegram_id);
const { mnemonic, publicKey } = mintMnemonicWallet();
const enc = CryptoJS.AES.encrypt(mnemonic, vaultSaltFor(playerId)).toString();

// Rotate wallet + vault (inventory/stats untouched)
await q(`
  SELECT public.gift_rotate_ingame_wallet(
    '${esc(playerId)}'::text,
    '${esc(publicKey)}'::text
  );
`);

await q(`
  UPDATE public.player_secrets
  SET encrypted_vault = '${esc(enc)}',
      updated_at = now()
  WHERE telegram_id::text = '${esc(playerId)}';
`);

const check = await q(`
  select p.username, p.wallet_address,
    (s.encrypted_vault is not null and length(s.encrypted_vault) > 20) as has_vault
  from players p
  left join player_secrets s on s.telegram_id::text = p.telegram_id::text
  where p.telegram_id::text = '${esc(playerId)}'
`);

console.log('updated', check);
console.log('\n========== SAVE THESE 12 WORDS FOR DEV2 ==========');
console.log(mnemonic);
console.log('==================================================\n');
console.log('publicKey', publicKey);
console.log('playerId', playerId);
