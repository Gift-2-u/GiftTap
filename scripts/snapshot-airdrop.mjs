/**
 * Snapshot $G2U airdrop allocations → airdrop_allocations (service_role).
 * Does NOT update players / last_updated.
 *
 * Usage:
 *   # L5: --pool is BASE per player (not a shared pot)
 *   # amount = base × (1 + bonus%/100)  e.g. 500000 + 30% → 650000
 *   node scripts/snapshot-airdrop.mjs --type l5 --pool 500000 --period launch
 *
 *   # Weekly / monthly: --pool is shared pot split by score weight
 *   node scripts/snapshot-airdrop.mjs --type weekly --pool 50000 --period 2026-W35
 *   node scripts/snapshot-airdrop.mjs --type monthly --pool 200000 --period 2026-08
 *
 * Dry run (no writes):
 *   node scripts/snapshot-airdrop.mjs --type l5 --pool 500000 --dry
 *
 * Requires .env: VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import {
  l5Weight,
  l5AmountFromBonus,
  L5_MAX_UNLOCKED,
} from './lib/airdropWeights.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const out = {};
  for (const f of ['.env', '.env.local']) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (!m) continue;
      out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) {
    return process.argv[i + 1];
  }
  return def;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function utcWeekId(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function utcMonthId(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function round6(n) {
  return Math.round(Number(n) * 1e6) / 1e6;
}

const env = loadEnv();
const url = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/$/, '');
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Need VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const type = String(arg('type', '')).toLowerCase();
const pool = Number(arg('pool', 0));
const dry = hasFlag('dry');
let period = arg('period', null);

if (!['l5', 'weekly', 'monthly'].includes(type)) {
  console.error('Usage: --type l5|weekly|monthly --pool <G2U> [--period id] [--dry]');
  process.exit(1);
}
if (!Number.isFinite(pool) || pool <= 0) {
  console.error('--pool must be a positive G2U amount');
  process.exit(1);
}
if (!period) {
  if (type === 'l5') period = 'launch';
  else if (type === 'weekly') period = utcWeekId();
  else period = utcMonthId();
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function fetchAllPlayers(select, filterFn) {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  for (;;) {
    let q = sb.from('players').select(select).range(from, from + pageSize - 1);
    if (type === 'l5') q = q.gte('max_unlocked_level', L5_MAX_UNLOCKED);
    const { data, error } = await q;
    if (error) throw error;
    const batch = data || [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return filterFn ? all.filter(filterFn) : all;
}

async function friendMaps(ids) {
  const friends1k = new Map();
  const friendsL5 = new Map();
  const chunk = 80;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const { data, error } = await sb
      .from('players')
      .select('referred_by, lifetime_taps, max_unlocked_level')
      .in('referred_by', slice);
    if (error) {
      console.warn('friends query', error.message);
      continue;
    }
    for (const f of data || []) {
      const by = String(f.referred_by || '').trim();
      if (!by) continue;
      if (Number(f.lifetime_taps) >= 1000) {
        friends1k.set(by, (friends1k.get(by) || 0) + 1);
      }
      if (Number(f.max_unlocked_level) >= L5_MAX_UNLOCKED) {
        friendsL5.set(by, (friendsL5.get(by) || 0) + 1);
      }
    }
  }
  return { friends1k, friendsL5 };
}

async function buildL5() {
  const players = await fetchAllPlayers(
    'telegram_id, username, lifetime_taps, max_unlocked_level, current_streak, has_made_purchase, completed_tasks, inventory',
  );
  const ids = players.map((p) => String(p.telegram_id));
  const { friends1k, friendsL5 } = await friendMaps(ids);
  const rows = [];
  for (const p of players) {
    const id = String(p.telegram_id);
    const w = l5Weight(p, friends1k.get(id) || 0, friendsL5.get(id) || 0);
    if (w <= 0) continue;
    rows.push({
      telegram_id: id,
      username: p.username || null,
      weight: w,
    });
  }
  return rows;
}

async function buildWeekly() {
  const { data: led, error } = await sb
    .from('weekly_score_ledger')
    .select('telegram_id, username, score')
    .eq('week_id', period)
    .gt('score', 0);
  if (error) throw error;
  const byId = new Map();
  for (const r of led || []) {
    const id = String(r.telegram_id || '').trim();
    if (!id) continue;
    const score = Math.max(0, Number(r.score) || 0);
    if (score <= 0) continue;
    const prev = byId.get(id);
    if (!prev || score > prev.weight) {
      byId.set(id, {
        telegram_id: id,
        username: r.username || null,
        weight: score,
      });
    }
  }
  // Fallback: players.weekly_shards for this week
  if (byId.size === 0) {
    const { data: pl } = await sb
      .from('players')
      .select('telegram_id, username, weekly_shards, weekly_week_id')
      .eq('weekly_week_id', period)
      .gt('weekly_shards', 0);
    for (const p of pl || []) {
      byId.set(String(p.telegram_id), {
        telegram_id: String(p.telegram_id),
        username: p.username || null,
        weight: Number(p.weekly_shards) || 0,
      });
    }
  }
  return [...byId.values()].filter((r) => r.weight > 0);
}

async function buildMonthly() {
  // Weight = season_shards (season board). period_id = YYYY-MM label for the drop.
  const players = await fetchAllPlayers(
    'telegram_id, username, season_shards',
    (p) => Number(p.season_shards) > 0,
  );
  return players.map((p) => ({
    telegram_id: String(p.telegram_id),
    username: p.username || null,
    weight: Number(p.season_shards) || 0,
  }));
}

async function main() {
  console.log(
    type === 'l5'
      ? `Snapshot L5 · period=${period} · BASE=${pool} G2U each (+ bonus%) · dry=${dry}`
      : `Snapshot ${type} · period=${period} · shared pool=${pool} G2U · dry=${dry}`,
  );

  let weighted =
    type === 'l5'
      ? await buildL5()
      : type === 'weekly'
        ? await buildWeekly()
        : await buildMonthly();

  if (weighted.length === 0) {
    console.error('No eligible players — abort');
    process.exit(2);
  }

  let allocations;

  if (type === 'l5') {
    // Each L5+ player: base × (1 + bonus%/100). weight field stores bonus %.
    allocations = weighted.map((r) => {
      const bonusPct = Math.max(0, Number(r.weight) || 0);
      const amount = l5AmountFromBonus(pool, bonusPct);
      return {
        telegram_id: r.telegram_id,
        username: r.username,
        source: type,
        period_id: period,
        amount,
        weight: bonusPct,
        meta: {
          formula: 'base * (1 + bonus_pct/100)',
          base: pool,
          bonus_pct: bonusPct,
          snapshot_at: new Date().toISOString(),
        },
      };
    });
  } else {
    const sumW = weighted.reduce((s, r) => s + r.weight, 0);
    if (sumW <= 0) {
      console.error('Zero total weight — abort');
      process.exit(2);
    }
    allocations = weighted.map((r) => {
      const amount = round6((pool * r.weight) / sumW);
      return {
        telegram_id: r.telegram_id,
        username: r.username,
        source: type,
        period_id: period,
        amount: Math.max(amount, 0.000001),
        weight: r.weight,
        meta: {
          pool,
          sum_weight: sumW,
          snapshot_at: new Date().toISOString(),
        },
      };
    });
    const sumAmt = allocations.reduce((s, a) => s + a.amount, 0);
    const dust = round6(pool - sumAmt);
    if (Math.abs(dust) > 0 && allocations.length) {
      allocations.sort((a, b) => b.weight - a.weight);
      allocations[0].amount = round6(allocations[0].amount + dust);
    }
  }

  const totalPay = allocations.reduce((s, a) => s + a.amount, 0);
  console.log(`Players: ${allocations.length}`);
  console.log(`Total $G2U to pay (if all claim): ${round6(totalPay)}`);
  console.log(
    `Top 5:`,
    allocations
      .slice()
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map(
        (a) =>
          `${a.username || a.telegram_id.slice(0, 8)} → ${a.amount}` +
          (type === 'l5' ? ` (${a.weight}%)` : ''),
      ),
  );

  if (dry) {
    console.log('Dry run — no DB writes');
    return;
  }

  // Upsert — replace unclaimed for same source+period; skip already claimed
  let written = 0;
  let skippedClaimed = 0;
  for (const row of allocations) {
    const { data: existing } = await sb
      .from('airdrop_allocations')
      .select('id, claimed_at')
      .eq('telegram_id', row.telegram_id)
      .eq('source', row.source)
      .eq('period_id', row.period_id)
      .maybeSingle();

    if (existing?.claimed_at) {
      skippedClaimed += 1;
      continue;
    }

    const { error } = await sb.from('airdrop_allocations').upsert(
      {
        telegram_id: row.telegram_id,
        username: row.username,
        source: row.source,
        period_id: row.period_id,
        amount: row.amount,
        weight: row.weight,
        meta: row.meta,
        claimed_at: null,
        claim_tx: null,
      },
      { onConflict: 'telegram_id,source,period_id' },
    );
    if (error) {
      console.error('upsert fail', row.telegram_id, error.message);
      process.exit(3);
    }
    written += 1;
  }

  console.log(`Wrote ${written} allocations (skipped already-claimed: ${skippedClaimed})`);
  console.log('Done. Players claim via wallet Claim $G2U — no players.last_updated touched.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
