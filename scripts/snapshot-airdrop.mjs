/**
 * Snapshot $G2U airdrop allocations → airdrop_allocations (service_role).
 * Does NOT update players / last_updated.
 *
 * Usage:
 *   # L5: --pool is BASE per player (not a shared pot)
 *   # amount = base × (1 + bonus%/100)  e.g. 500000 + 30% → 650000
 *   node scripts/snapshot-airdrop.mjs --type l5 --pool 500000 --period launch
 *
 *   # Weekly: --pool split into 4 equal tier pots (default 300k → 75k each).
 *   # Top 100 eligible share D/G/S/B pots; rank 101+ get Bronze badge only (0 G2U).
 *   node scripts/snapshot-airdrop.mjs --type weekly --pool 300000 --period 2026-W35
 *
 *   # Monthly: from season_history — only main-board eligible (floor like Season UI).
 *   # Aug 2026 auto floor = 15%×1000×31 = 4650; from 2026-09 = 20%×1000×days.
 *   node scripts/snapshot-airdrop.mjs --type monthly --pool 1000000 --period 2026-08 --dry
 *   node scripts/snapshot-airdrop.mjs --type monthly --pool 1000000 --period 2026-08 --floor 4650
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
  WEEKLY_G2U_TOP_N,
  WEEKLY_BADGE_FLOOR_END,
  weeklyBoardFloorLive,
  utcIsoWeekDayNumber,
  weeklyG2uAllocationsFromEligible,
  weeklyBadgeTierForRank,
  weeklyPaidTierCounts,
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
const WEEKLY_DEFAULT_POOL = 300_000;
const MONTHLY_DEFAULT_POOL = 1_000_000;
const poolArg = arg('pool', null);
const pool = Number(
  poolArg != null
    ? poolArg
    : type === 'monthly'
      ? MONTHLY_DEFAULT_POOL
      : type === 'weekly'
        ? WEEKLY_DEFAULT_POOL
        : 0,
);
const dry = hasFlag('dry');
let period = arg('period', null);

if (!['l5', 'weekly', 'monthly'].includes(type)) {
  console.error('Usage: --type l5|weekly|monthly --pool <G2U> [--period id] [--dry]');
  process.exit(1);
}
if (!Number.isFinite(pool) || pool <= 0) {
  console.error(
    type === 'monthly'
      ? '--pool must be a positive G2U amount (default 1000000 for monthly)'
      : type === 'weekly'
        ? '--pool must be a positive G2U amount (default 300000 for weekly)'
        : '--pool must be a positive G2U amount',
  );
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

/**
 * Same sources as Gift Tap weekly board: MERGE ledger + players for the week
 * (max score per id), then apply floor. Default floor = LIVE board floor
 * (matches Ranks UI). End-of-week official lock: --floor 1050.
 */
async function buildWeekly() {
  const liveFloor = weeklyBoardFloorLive(utcIsoWeekDayNumber());
  const floorArg = arg('floor', null);
  const floor =
    floorArg != null ? Number(floorArg) : liveFloor;
  if (!Number.isFinite(floor) || floor < 0) {
    throw new Error(`Invalid --floor ${floor}`);
  }
  console.log(
    `Weekly floor (eligible if score ≥): ${floor}` +
      (floorArg == null
        ? ` (live board floor; end-of-week use --floor ${WEEKLY_BADGE_FLOOR_END})`
        : ''),
  );

  const byId = new Map();
  const absorb = (id, username, score) => {
    const tid = String(id || '').trim();
    if (!tid) return;
    const s = Math.max(0, Number(score) || 0);
    if (s <= 0) return;
    const prev = byId.get(tid);
    if (!prev || s > prev.weight) {
      byId.set(tid, {
        telegram_id: tid,
        username: username || prev?.username || null,
        weight: s,
      });
    } else if (prev && username && !prev.username) {
      byId.set(tid, { ...prev, username });
    }
  };

  const { data: led, error } = await sb
    .from('weekly_score_ledger')
    .select('telegram_id, username, score')
    .eq('week_id', period)
    .gt('score', 0);
  if (error) throw error;
  for (const r of led || []) {
    absorb(r.telegram_id, r.username, r.score);
  }

  // Always merge players column for same week (game board does this too)
  const { data: pl, error: pErr } = await sb
    .from('players')
    .select('telegram_id, username, weekly_shards, weekly_week_id')
    .eq('weekly_week_id', period)
    .gt('weekly_shards', 0);
  if (pErr) throw pErr;
  for (const p of pl || []) {
    absorb(p.telegram_id, p.username, p.weekly_shards);
  }

  const eligible = [...byId.values()]
    .filter((r) => r.weight >= floor)
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        String(a.telegram_id).localeCompare(String(b.telegram_id)),
    );

  console.log(
    `Merged scores: ${byId.size} players with score>0 · eligible ≥${floor}: ${eligible.length}`,
  );
  return eligible;
}

function allocationsFromWeekly(sortedEligible, poolAmt, weekId) {
  const n = sortedEligible.length;
  const paidN = Math.min(WEEKLY_G2U_TOP_N, n);
  const seats = weeklyPaidTierCounts(paidN);
  console.log(
    `Eligible ${n} · G2U seats among top ${paidN}: D${seats.diamond} G${seats.gold} S${seats.silver} B${seats.bronze}`,
  );
  if (n >= 1) {
    console.log(`  rank1 → ${weeklyBadgeTierForRank(1, n, weekId)}`);
  }
  if (n >= 101) {
    console.log(`  rank101 → ${weeklyBadgeTierForRank(101, n, weekId)}`);
  }

  const out = weeklyG2uAllocationsFromEligible(sortedEligible, poolAmt, weekId);
  const pot = round6(poolAmt / 4);
  for (const tier of ['diamond', 'gold', 'silver', 'bronze']) {
    const group = out.filter((a) => a.meta?.tier === tier);
    if (!group.length) {
      console.log(`  ${tier}: 0 players (pot ${pot} unused)`);
      continue;
    }
    console.log(`  ${tier}: ${group.length} players · each ≈ ${group[0].amount}`);
  }
  return out;
}

const MONTH_NAME_TO_NUM = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

/** Parse season_history.season_month labels like "2026-08" or "August 2026 Season". */
function parseSeasonMonthLabel(label) {
  const m = String(label || '').trim();
  const iso = m.match(/^(\d{4})-(\d{2})$/);
  if (iso) {
    return { year: Number(iso[1]), month: Number(iso[2]), key: m };
  }
  const named = m.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b(?:\s+(\d{4}))?/i,
  );
  if (named) {
    const month = MONTH_NAME_TO_NUM[named[1].toLowerCase()];
    const year = named[2] ? Number(named[2]) : new Date().getUTCFullYear();
    return {
      year,
      month,
      key: `${year}-${String(month).padStart(2, '0')}`,
    };
  }
  return null;
}

/**
 * End-of-month main-board floor (same spirit as Ranks → Season).
 * Through 2026-08: 15% × 1000 × daysInMonth. From 2026-09: 20%.
 * Override with --floor N.
 */
function monthlyBoardFloorEnd(monthId) {
  const parsed = parseSeasonMonthLabel(monthId);
  const year = parsed?.year ?? new Date().getUTCFullYear();
  const month = parsed?.month ?? new Date().getUTCMonth() + 1;
  const key =
    parsed?.key ??
    `${year}-${String(month).padStart(2, '0')}`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pct = key >= '2026-09' ? 0.2 : 0.15;
  return Math.floor(1000 * pct * daysInMonth);
}

/**
 * Monthly weights from public.season_history (not live players.season_shards).
 * Columns: id, season_month, telegram_id, final_season_shards, created_at
 * --period should match season_month (e.g. 2026-08).
 * Only main-board eligible (score ≥ floor) share the pool — same as Season UI.
 */
async function buildMonthly() {
  const floorArg = arg('floor', null);
  const floor =
    floorArg != null ? Number(floorArg) : monthlyBoardFloorEnd(period);
  if (!Number.isFinite(floor) || floor < 0) {
    throw new Error(`Invalid --floor ${floor}`);
  }
  console.log(
    `Monthly floor (eligible if final_season_shards ≥): ${floor}` +
      (floorArg == null
        ? ` (auto end-of-month; override with --floor N)`
        : ''),
  );

  // Resolve season_month label (exact, or unique fuzzy match e.g. August → "August 2026 Season")
  let seasonMonth = period;
  {
    const { data: labels, error: labErr } = await sb
      .from('season_history')
      .select('season_month')
      .limit(1000);
    if (labErr) throw labErr;
    const uniq = [
      ...new Set((labels || []).map((r) => String(r.season_month || ''))),
    ].filter(Boolean);
    if (uniq.includes(period)) {
      seasonMonth = period;
    } else {
      const needle = String(period).toLowerCase();
      const hits = uniq.filter((u) => u.toLowerCase().includes(needle));
      if (hits.length === 1) {
        seasonMonth = hits[0];
        console.log(`Matched season_month: "${seasonMonth}" (from --period ${period})`);
      } else if (hits.length > 1) {
        console.error(`Ambiguous --period "${period}". Matches:`);
        for (const h of hits) console.error(`  --period "${h}"`);
        return [];
      }
    }
  }

  // Recompute floor if period was a short name (August → 2026-08 → 15%×31)
  const floorResolved =
    floorArg != null ? floor : monthlyBoardFloorEnd(seasonMonth);
  if (floorResolved !== floor) {
    console.log(
      `Monthly floor adjusted for "${seasonMonth}": ${floorResolved}`,
    );
  }
  const floorUse = floorResolved;

  const pageSize = 1000;
  let from = 0;
  const hist = [];
  for (;;) {
    const { data, error } = await sb
      .from('season_history')
      .select('telegram_id, final_season_shards, season_month, created_at')
      .eq('season_month', seasonMonth)
      .gte('final_season_shards', floorUse)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data || [];
    hist.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  if (hist.length === 0) {
    console.error(
      `No season_history rows for season_month="${seasonMonth}" with final_season_shards≥${floorUse}`,
    );
    const { data: labels } = await sb
      .from('season_history')
      .select('season_month')
      .limit(500);
    const uniq = [
      ...new Set((labels || []).map((r) => String(r.season_month || ''))),
    ].filter(Boolean);
    if (uniq.length) {
      console.error('Available season_month values:');
      for (const u of uniq) console.error(`  --period "${u}"`);
    } else {
      console.error(
        'Check: SELECT season_month, count(*), min(final_season_shards), max(final_season_shards) FROM season_history GROUP BY 1;',
      );
    }
    return [];
  }

  // Username from players (history table has no username)
  const ids = [...new Set(hist.map((r) => String(r.telegram_id)))];
  const nameById = new Map();
  const chunk = 80;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const { data: pl, error: pErr } = await sb
      .from('players')
      .select('telegram_id, username')
      .in('telegram_id', slice);
    if (pErr) throw pErr;
    for (const p of pl || []) {
      nameById.set(String(p.telegram_id), p.username || null);
    }
  }

  console.log(
    `season_history season_month="${seasonMonth}": ${hist.length} eligible (≥${floorUse})`,
  );

  return hist.map((r) => ({
    telegram_id: String(r.telegram_id),
    username: nameById.get(String(r.telegram_id)) || null,
    weight: Number(r.final_season_shards) || 0,
  }));
}

async function main() {
  console.log(
    type === 'l5'
      ? `Snapshot L5 · period=${period} · BASE=${pool} G2U each (+ bonus%) · dry=${dry}`
      : type === 'weekly'
        ? `Snapshot weekly · period=${period} · pool=${pool} (÷4 pots) · top ${WEEKLY_G2U_TOP_N} · dry=${dry}`
        : `Snapshot monthly · period=${period} · pool=${pool} G2U (=100% of season total) · dry=${dry}` +
          (poolArg == null ? ' [default --pool 1000000]' : ''),
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
  } else if (type === 'weekly') {
    allocations = allocationsFromWeekly(weighted, pool, period);
  } else {
    // Monthly: pool (default 1.5M) = 100% of season board total.
    // amount = pool × (player season_shards / sum season_shards)
    const sumW = weighted.reduce((s, r) => s + r.weight, 0);
    if (sumW <= 0) {
      console.error('Zero total season_shards — abort');
      process.exit(2);
    }
    console.log(
      `Monthly formula: prize = ${pool} × (season_shards / ${sumW}) · players with score>0: ${weighted.length}`,
    );
    allocations = weighted.map((r) => {
      const share = r.weight / sumW;
      const sharePct = round6(share * 100);
      const amount = round6(pool * share);
      return {
        telegram_id: r.telegram_id,
        username: r.username,
        source: type,
        period_id: period,
        amount: Math.max(amount, 0.000001),
        weight: r.weight,
        meta: {
          formula: 'pool * (final_season_shards / sum) from season_history',
          pool,
          season_month: period,
          final_season_shards: r.weight,
          sum_season_shards: sumW,
          share_pct: sharePct,
          snapshot_at: new Date().toISOString(),
        },
      };
    });
    const sumAmt = allocations.reduce((s, a) => s + a.amount, 0);
    const dust = round6(pool - sumAmt);
    if (Math.abs(dust) > 0 && allocations.length) {
      allocations.sort((a, b) => b.weight - a.weight);
      allocations[0].amount = round6(allocations[0].amount + dust);
      if (allocations[0].meta) {
        allocations[0].meta.dust_adjusted = dust;
      }
    }
  }

  const totalPay = allocations.reduce((s, a) => s + a.amount, 0);
  console.log(`Players: ${allocations.length}`);
  console.log(`Total $G2U to pay (if all claim): ${round6(totalPay)}`);
  // Monthly season board currently ~9 eligible; show top 9. L5/weekly keep top 5.
  const topN = type === 'monthly' ? 9 : 5;
  console.log(
    `Top ${topN}:`,
    allocations
      .slice()
      .sort((a, b) => b.amount - a.amount)
      .slice(0, topN)
      .map((a) => {
        const who = a.username || a.telegram_id.slice(0, 8);
        if (type === 'l5') return `${who} → ${a.amount} (${a.weight}%)`;
        if (type === 'monthly') {
          const pct = a.meta?.share_pct ?? round6((a.weight / (a.meta?.sum_season_shards || 1)) * 100);
          return `${who} → ${a.amount} (${pct}% of pool · ${a.weight} shards)`;
        }
        return `${who} → ${a.amount}`;
      }),
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
