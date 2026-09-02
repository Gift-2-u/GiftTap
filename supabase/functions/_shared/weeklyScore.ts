/**
 * Canonical WEEKLY leaderboard score = payout-weighted taps this UTC ISO week
 * (taps × payoutMultiplier: frenzy / premium x2/x3 / Echo / Fate).
 *
 * daily_taps is RAW tap count toward the daily limit bar (Frenzy does NOT burn it 2x).
 * Weekly/season/balance still get the payout-weighted credit so 10 frenzy taps → 20 board.
 * Battery energy drains separately; Heavy Hands (efficiency) raises cost AND payout.
 *
 * Invariants (current week):
 *   weekly_shards >= sum(batch scoreCredit) this week
 *   weekly_shards >= daily_taps   (daily is raw taps today; week is payout-weighted)
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { utcIsoWeekId } from "./economy.ts";

export function isoWeekStartUtc(d = new Date()): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7; // Mon=1..Sun=7
  date.setUTCDate(date.getUTCDate() - (dayNum - 1));
  return date; // Monday 00:00 UTC
}

export function invObj(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

/** Base raw taps for weekly "drain daily" quests (ignores boosts). */
export const WEEKLY_QUEST_BASE_DAILY = 1000;

/**
 * Persist Tap-500 / Drain-1000 quest progress on inventory.weekly_quests.
 * Must run in Edge (service_role) — client inventory writes are frozen.
 */
export function applyWeeklyQuestDayProgress(
  inventory: unknown,
  day: string,
  dayTaps: number,
  weekId: string,
): Record<string, unknown> {
  const inv = invObj(inventory);
  const dayKey = String(day || "").slice(0, 10);
  if (!dayKey || !weekId) return inv;

  const raw = inv.weekly_quests;
  let wq: Record<string, unknown> =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};

  if (wq.weekId && String(wq.weekId) !== weekId) {
    wq = {
      weekId,
      claimed: [],
      daysTap500: [],
      daysActive: [],
      daysFull: [],
      boostBuys: 0,
    };
  }
  wq.weekId = weekId;
  if (!Array.isArray(wq.claimed)) wq.claimed = [];

  const taps = Math.max(0, Number(dayTaps) || 0);
  const daysActive = new Set(
    Array.isArray(wq.daysActive) ? (wq.daysActive as string[]) : [],
  );
  const daysTap500 = new Set(
    Array.isArray(wq.daysTap500) ? (wq.daysTap500 as string[]) : [],
  );
  const daysFull = new Set(
    Array.isArray(wq.daysFull) ? (wq.daysFull as string[]) : [],
  );

  if (taps > 0) daysActive.add(dayKey);
  if (taps >= 500) daysTap500.add(dayKey);
  else daysTap500.delete(dayKey);
  if (taps >= WEEKLY_QUEST_BASE_DAILY) daysFull.add(dayKey);
  else daysFull.delete(dayKey);

  wq.daysActive = [...daysActive].sort();
  wq.daysTap500 = [...daysTap500].sort();
  wq.daysFull = [...daysFull].sort();
  if (wq.boostBuys == null) wq.boostBuys = 0;

  return { ...inv, weekly_quests: wq };
}

/** After a mining credit: apply energy to weekly, never lag daily. */
export function applyWeeklyEnergyCredit(opts: {
  now?: Date;
  prevWeekId: string | null | undefined;
  prevWeekly: number;
  energySpent: number;
  nextDaily: number;
}): { weekId: string; weeklyShards: number } {
  const now = opts.now ?? new Date();
  const weekId = utcIsoWeekId(now);
  let weekly =
    String(opts.prevWeekId || "") === weekId
      ? Math.max(0, Number(opts.prevWeekly) || 0)
      : 0;
  const spent = Math.max(0, Number(opts.energySpent) || 0);
  const daily = Math.max(0, Number(opts.nextDaily) || 0);
  weekly = Math.round((weekly + spent) * 1000) / 1000;
  // Floor: week total cannot lag today's daily energy
  weekly = Math.max(weekly, daily);
  return { weekId, weeklyShards: weekly };
}

/** True weekly energy for one player from all durable signals (never lowers). */
export function computeTrueWeeklyScore(opts: {
  weekId: string;
  weeklyWeekId: string | null | undefined;
  weeklyShards: number;
  dailyTaps: number;
  lastTapDate: string | null | undefined;
  inventory?: unknown;
  batchEnergy?: number;
}): number {
  const weekId = opts.weekId;
  const wWeek = String(opts.weeklyWeekId || "");
  let score = 0;

  if (wWeek === weekId) {
    score = Math.max(score, Math.max(0, Number(opts.weeklyShards) || 0));
  }

  const inv = invObj(opts.inventory);
  const lb = inv.weekly_lb as { weekId?: string; score?: number } | undefined;
  if (lb && String(lb.weekId || "") === weekId) {
    score = Math.max(score, Math.max(0, Number(lb.score) || 0));
  }

  // daily_taps is always "today only" — valid floor for this week whenever
  // they already have this week's tag OR they tapped today (new week seed).
  const daily = Math.max(0, Number(opts.dailyTaps) || 0);
  const ltd = String(opts.lastTapDate || "").slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (daily > 0 && (wWeek === weekId || ltd === today)) {
    score = Math.max(score, daily);
  }

  const batch = Math.max(0, Number(opts.batchEnergy) || 0);
  score = Math.max(score, batch);
  return Math.round(score * 1000) / 1000;
}

/** Payout-weighted tap score from a batch row (frenzy/x2/x3 aware). */
export function batchScoreCredit(r: {
  taps?: unknown;
  energy_spent?: unknown;
  shards?: unknown;
  result?: unknown;
}): number {
  const taps = Math.max(0, Number(r.taps) || 0);
  const result =
    r.result && typeof r.result === "object"
      ? (r.result as Record<string, unknown>)
      : null;
  if (result) {
    if (result.scoreCredit != null && Number.isFinite(Number(result.scoreCredit))) {
      return Math.max(0, Number(result.scoreCredit));
    }
    const pm = Math.max(1, Number(result.payoutMultiplier) || 1);
    if (taps > 0) return Math.round(taps * pm * 1000) / 1000;
  }
  const shards = Number(r.shards);
  const br = Math.max(0.0001, Number(result?.baseRate) || 1);
  if (Number.isFinite(shards) && shards > 0) {
    return Math.round((shards / br) * 1000) / 1000;
  }
  const e = Number(r.energy_spent);
  if (Number.isFinite(e) && e > 0) return e;
  return taps;
}

export async function sumBatchEnergyThisWeek(
  sb: SupabaseClient,
  weekStartIso: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("tap_batches")
      .select("player_id, energy_spent, taps, shards, result")
      .gte("created_at", weekStartIso)
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn("tap_batches sum", error.message);
      break;
    }
    const rows = data || [];
    for (const r of rows) {
      const id = String(r.player_id || "").trim();
      if (!id) continue;
      const add = batchScoreCredit(r);
      map.set(id, (map.get(id) || 0) + add);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return map;
}

/**
 * Build the live weekly board (READ-ONLY for players rows).
 * Never mass-UPDATEs players / last_updated. Scores come from:
 *   ledger + players.weekly_* + tap_batches (computed in memory).
 * Per-player weekly_* writes happen only in commit-taps (no heal).
 */
export async function reconcileAllWeeklyScores(
  sb: SupabaseClient,
  opts: { limit?: number } = {},
): Promise<{
  weekId: string;
  checked: number;
  healed: number;
  board: Array<{
    telegram_id: string;
    username: string;
    weekly_shards: number;
    score: number;
    weekly_week_id: string;
    daily_taps: number;
    last_tap_date: string | null;
    last_updated: string | null;
  }>;
}> {
  const now = new Date();
  const weekId = utcIsoWeekId(now);
  const weekStart = isoWeekStartUtc(now).toISOString();
  const batchMap = await sumBatchEnergyThisWeek(sb, weekStart);

  const byId = new Map<
    string,
    {
      telegram_id: string;
      username: string;
      weekly_shards: number;
      weekly_week_id: string | null;
      daily_taps: number;
      last_tap_date: string | null;
      inventory: unknown;
      last_updated: string | null;
      is_banned?: boolean;
    }
  >();

  const absorbPlayers = (
    rows: Array<Record<string, unknown>> | null | undefined,
  ) => {
    for (const r of rows || []) {
      const id = String(r.telegram_id || "").trim();
      if (!id) continue;
      if (r.is_banned === true) {
        byId.delete(id);
        continue;
      }
      byId.set(id, {
        telegram_id: id,
        username: String(r.username || "Player"),
        weekly_shards: Number(r.weekly_shards) || 0,
        weekly_week_id: r.weekly_week_id != null ? String(r.weekly_week_id) : null,
        daily_taps: Number(r.daily_taps) || 0,
        last_tap_date:
          r.last_tap_date != null ? String(r.last_tap_date).slice(0, 10) : null,
        inventory: r.inventory,
        last_updated: r.last_updated != null ? String(r.last_updated) : null,
        is_banned: false,
      });
    }
  };

  // Prefer durable ledger (no player writes). Ban status resolved via players join below.
  {
    let from = 0;
    const pageSize = 500;
    for (;;) {
      const { data, error } = await sb
        .from("weekly_score_ledger")
        .select("telegram_id, username, score, week_id")
        .eq("week_id", weekId)
        .gt("score", 0)
        .range(from, from + pageSize - 1);
      if (error) {
        console.warn("weekly ledger page", error.message);
        break;
      }
      absorbPlayers(
        (data || []).map((r) => ({
          telegram_id: r.telegram_id,
          username: r.username,
          weekly_shards: Number(r.score) || 0,
          weekly_week_id: weekId,
          daily_taps: 0,
          last_tap_date: null,
          inventory: null,
          last_updated: null,
        })),
      );
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
  }

  // Drop banned IDs that came from the ledger (ledger has no is_banned column)
  {
    const ids = [...byId.keys()];
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { data, error } = await sb
        .from("players")
        .select("telegram_id, is_banned")
        .in("telegram_id", chunk);
      if (error) {
        console.warn("ban filter page", error.message);
        break;
      }
      for (const r of data || []) {
        if ((r as { is_banned?: boolean }).is_banned === true) {
          byId.delete(String((r as { telegram_id: string }).telegram_id));
        }
      }
    }
  }

  // Merge players already tagged this week (read only) — skip banned
  {
    let from = 0;
    const pageSize = 500;
    for (;;) {
      const { data, error } = await sb
        .from("players")
        .select(
          "telegram_id, username, weekly_shards, weekly_week_id, daily_taps, last_tap_date, inventory, last_updated, is_banned",
        )
        .eq("weekly_week_id", weekId)
        .eq("is_banned", false)
        .range(from, from + pageSize - 1);
      if (error) {
        // Older DBs without is_banned filter — fall back unfiltered then absorb skips
        const { data: data2, error: err2 } = await sb
          .from("players")
          .select(
            "telegram_id, username, weekly_shards, weekly_week_id, daily_taps, last_tap_date, inventory, last_updated, is_banned",
          )
          .eq("weekly_week_id", weekId)
          .range(from, from + pageSize - 1);
        if (err2) {
          console.warn("players week page", error.message);
          break;
        }
        absorbPlayers(data2 as Array<Record<string, unknown>>);
        if (!data2 || data2.length < pageSize) break;
        from += pageSize;
        continue;
      }
      absorbPlayers(data as Array<Record<string, unknown>>);
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
  }

  // Batch energy only counts if a real players row exists.
  for (const id of batchMap.keys()) {
    if (byId.has(id)) continue;
    const { data } = await sb
      .from("players")
      .select(
        "telegram_id, username, weekly_shards, weekly_week_id, daily_taps, last_tap_date, inventory, last_updated, is_banned",
      )
      .eq("telegram_id", id)
      .maybeSingle();
    if (data) absorbPlayers([data as Record<string, unknown>]);
  }

  const board: Array<{
    telegram_id: string;
    username: string;
    weekly_shards: number;
    score: number;
    weekly_week_id: string;
    daily_taps: number;
    last_tap_date: string | null;
    last_updated: string | null;
  }> = [];

  for (const p of byId.values()) {
    const batchEnergy = batchMap.get(p.telegram_id) || 0;
    const trueScore = computeTrueWeeklyScore({
      weekId,
      weeklyWeekId: p.weekly_week_id,
      weeklyShards: p.weekly_shards,
      dailyTaps: p.daily_taps,
      lastTapDate: p.last_tap_date,
      inventory: p.inventory,
      batchEnergy,
    });
    if (trueScore <= 0) continue;

    // Ledger only — never UPDATE players (that mass-touched last_updated / rows)
    try {
      await sb.rpc("upsert_weekly_score_ledger", {
        p_week_id: weekId,
        p_telegram_id: p.telegram_id,
        p_username: p.username || "",
        p_score: trueScore,
      });
    } catch {
      /* optional */
    }

    board.push({
      telegram_id: p.telegram_id,
      username: p.username || "Player",
      weekly_shards: trueScore,
      score: trueScore,
      weekly_week_id: weekId,
      daily_taps: p.daily_taps,
      last_tap_date: p.last_tap_date,
      last_updated: p.last_updated,
    });
  }

  board.sort((a, b) => b.score - a.score);
  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 500);
  return {
    weekId,
    checked: byId.size,
    healed: 0,
    board: board.slice(0, limit),
  };
}

