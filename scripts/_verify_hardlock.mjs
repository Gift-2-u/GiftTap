/**
 * Live hard-lock probe (anon key only).
 * Expect: INSERT/UPDATE denied; SELECT players OK; player_secrets denied; secure_economy true.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function env(k) {
  for (const f of ['.env', '.env.local']) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    const m = fs.readFileSync(p, 'utf8').match(new RegExp(`^${k}=(.*)$`, 'm'));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return process.env[k] || '';
}

const url = env('VITE_SUPABASE_URL').replace(/\/$/, '');
const anon = env('VITE_SUPABASE_ANON_KEY');
if (!url || !anon) {
  console.error('MISSING_ENV');
  process.exit(1);
}

const headers = {
  apikey: anon,
  Authorization: `Bearer ${anon}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function tryReq(name, method, pathName, body) {
  const res = await fetch(url + pathName, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text.slice(0, 300);
  }
  const snippet =
    typeof data === 'string' ? data : JSON.stringify(data).slice(0, 350);
  console.log(`\n== ${name} ==`);
  console.log('status', res.status);
  console.log(snippet);
  return { status: res.status, data, ok: res.ok };
}

const results = {};

results.settings = await tryReq(
  'game_settings.secure_economy',
  'GET',
  '/rest/v1/game_settings?select=id,secure_economy&id=eq.1',
);

const fakeId = `hardlock_probe_${Date.now()}`;
results.insert = await tryReq('anon INSERT players', 'POST', '/rest/v1/players', {
  telegram_id: fakeId,
  username: 'hardlock_probe',
  shard_balance: 999999,
});

results.update = await tryReq(
  'anon UPDATE players',
  'PATCH',
  `/rest/v1/players?telegram_id=eq.${encodeURIComponent(fakeId)}`,
  { shard_balance: 1 },
);

results.secrets = await tryReq(
  'anon SELECT player_secrets',
  'GET',
  '/rest/v1/player_secrets?select=telegram_id&limit=1',
);

results.select = await tryReq(
  'anon SELECT players',
  'GET',
  '/rest/v1/players?select=telegram_id,username&limit=1',
);

// Verdict
const secure =
  Array.isArray(results.settings.data) &&
  results.settings.data[0]?.secure_economy === true;

const insertBlocked = !results.insert.ok; // 401/403/42501 expected
const updateBlockedOrNoop =
  !results.update.ok ||
  (Array.isArray(results.update.data) && results.update.data.length === 0);
const secretsBlocked =
  !results.secrets.ok ||
  (Array.isArray(results.secrets.data) && results.secrets.data.length === 0);
const selectOk = results.select.ok;

console.log('\n======== VERDICT ========');
console.log('secure_economy true:', secure ? 'PASS' : 'FAIL/UNKNOWN');
console.log('anon INSERT blocked:', insertBlocked ? 'PASS' : 'FAIL — INSERT WORKS');
console.log(
  'anon UPDATE blocked/noop:',
  updateBlockedOrNoop ? 'PASS' : 'FAIL — UPDATE WORKS',
);
console.log(
  'player_secrets blocked/empty:',
  secretsBlocked ? 'PASS' : 'WARN — readable?',
);
console.log('anon SELECT players:', selectOk ? 'PASS' : 'FAIL');

const hardOk = secure && insertBlocked && selectOk;
console.log('\nHARD LOCK LIVE:', hardOk ? 'YES' : 'NO / PARTIAL — check FAIL lines');
process.exit(hardOk ? 0 : 2);
