/**
 * Canonical WEEKLY leaderboard score = ENERGY spent this UTC ISO week.
 * Same unit as daily_taps. Not shards (multipliers must not desync the board).
 *
 * Invariants (current week):
 *   weekly_shards >= sum(tap_batches.energy_spent this week)
 *   weekly_shards >= daily_taps   (daily is "today only", always <= week total)
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
      .select("player_id, energy_spent, taps")
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
      const e = Number(r.energy_spent);
      const add = Number.isFinite(e) && e > 0 ? e : Math.max(0, Number(r.taps) || 0);
      map.set(id, (map.get(id) || 0) + add);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return map;
}

/**
 * Reconcile EVERY player with activity this week so weekly_shards matches
 * true energy (batches + daily floor + stored). service_role only.
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
    }
  >();

  const absorbPlayers = (
    rows: Array<Record<string, unknown>> | null | undefined,
  ) => {
    for (const r of rows || []) {
      const id = String(r.telegram_id || "").trim();
      if (!id) continue;
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
      });
    }
  };

  // Page players already tagged this week
  {
    let from = 0;
    const pageSize = 500;
    for (;;) {
      const { data, error } = await sb
        .from("players")
        .select(
          "telegram_id, username, weekly_shards, weekly_week_id, daily_taps, last_tap_date, inventory, last_updated",
        )
        .eq("weekly_week_id", weekId)
        .range(from, from + pageSize - 1);
      if (error) {
        console.warn("players week page", error.message);
        break;
      }
      absorbPlayers(data as Array<Record<string, unknown>>);
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
  }

  // Players who tapped since week start (wrong week id still healed)
  {
    const weekStartDay = weekStart.slice(0, 10);
    let from = 0;
    const pageSize = 500;
    for (;;) {
      const { data, error } = await sb
        .from("players")
        .select(
          "telegram_id, username, weekly_shards, weekly_week_id, daily_taps, last_tap_date, inventory, last_updated",
        )
        .gte("last_tap_date", weekStartDay)
        .range(from, from + pageSize - 1);
      if (error) {
        console.warn("players ltd page", error.message);
        break;
      }
      absorbPlayers(data as Array<Record<string, unknown>>);
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
  }

  // Batch energy only counts if a real players row exists.
  // Never invent ghost board rows (orphan tap_batches / truncated ids).
  for (const id of batchMap.keys()) {
    if (byId.has(id)) continue;
    const { data } = await sb
      .from("players")
      .select(
        "telegram_id, username, weekly_shards, weekly_week_id, daily_taps, last_tap_date, inventory, last_updated",
      )
      .eq("telegram_id", id)
      .maybeSingle();
    if (data) absorbPlayers([data as Record<string, unknown>]);
    // else: skip orphan batch player_id — not a real account
  }

  let healed = 0;
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

    const needsHeal =
      String(p.weekly_week_id || "") !== weekId ||
      Math.max(0, Number(p.weekly_shards) || 0) + 0.0001 < trueScore;

    if (needsHeal) {
      const inv = invObj(p.inventory);
      inv.weekly_lb = { weekId, score: trueScore };
      const { error: upErr } = await sb
        .from("players")
        .update({
          weekly_shards: trueScore,
          weekly_week_id: weekId,
          inventory: inv,
          last_updated: now.toISOString(),
        })
        .eq("telegram_id", p.telegram_id);
      if (!upErr) {
        healed += 1;
        p.weekly_shards = trueScore;
        p.weekly_week_id = weekId;
        p.inventory = inv;
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
      } else {
        console.warn("weekly heal update", p.telegram_id, upErr.message);
      }
    } else {
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
    healed,
    board: board.slice(0, limit),
  };
}

/** Heal a single player (login / player-state). */
export async function healPlayerWeekly(
  sb: SupabaseClient,
  playerId: string,
  player: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const now = new Date();
  const weekId = utcIsoWeekId(now);
  const weekStart = isoWeekStartUtc(now).toISOString();

  let batchEnergy = 0;
  try {
    const { data } = await sb
      .from("tap_batches")
      .select("energy_spent, taps")
      .eq("player_id", playerId)
      .gte("created_at", weekStart);
    for (const r of data || []) {
      const e = Number(r.energy_spent);
      batchEnergy += Number.isFinite(e) && e > 0 ? e : Math.max(0, Number(r.taps) || 0);
    }
  } catch {
    /* ignore */
  }

  const trueScore = computeTrueWeeklyScore({
    weekId,
    weeklyWeekId: player.weekly_week_id as string,
    weeklyShards: Number(player.weekly_shards) || 0,
    dailyTaps: Number(player.daily_taps) || 0,
    lastTapDate: player.last_tap_date as string,
    inventory: player.inventory,
    batchEnergy,
  });

  const curWeek = String(player.weekly_week_id || "");
  const curScore = Math.max(0, Number(player.weekly_shards) || 0);
  if (trueScore <= 0) return player;
  if (curWeek === weekId && curScore + 0.0001 >= trueScore) return player;

  const inv = invObj(player.inventory);
  inv.weekly_lb = { weekId, score: trueScore };
  const { data: fixed, error } = await sb
    .from("players")
    .update({
      weekly_shards: trueScore,
      weekly_week_id: weekId,
      inventory: inv,
      last_updated: now.toISOString(),
    })
    .eq("telegram_id", playerId)
    .select("weekly_shards, weekly_week_id, inventory")
    .maybeSingle();
  if (error || !fixed) return player;
  try {
    await sb.rpc("upsert_weekly_score_ledger", {
      p_week_id: weekId,
      p_telegram_id: playerId,
      p_username: String(player.username || ""),
      p_score: trueScore,
    });
  } catch {
    /* optional */
  }
  return {
    ...player,
    weekly_shards: fixed.weekly_shards,
    weekly_week_id: fixed.weekly_week_id,
    inventory: fixed.inventory,
  };
}
