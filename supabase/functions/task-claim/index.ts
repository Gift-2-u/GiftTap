/**
 * Lifetime task claims (shards or daily-limit boost). JWT required.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  logEconomy,
  invObj} from "../_shared/economy.ts";

type TaskDef =
  | { id: string; type: "shards"; reward: number }
  | { id: string; type: "daily_limit"; reward: number; dayLimited?: boolean };

/** Mirror Tasks.jsx rewards — server source of truth */
const TASKS: Record<string, TaskDef> = {
  sub_tg: { id: "sub_tg", type: "shards", reward: 250 },
  follow_x: { id: "follow_x", type: "shards", reward: 250 },
  join_discord: { id: "join_discord", type: "shards", reward: 250 },
  streak_7: { id: "streak_7", type: "shards", reward: 500 },
  taps_1000: { id: "taps_1000", type: "daily_limit", reward: 100, dayLimited: true },
  taps_5000: { id: "taps_5000", type: "daily_limit", reward: 250, dayLimited: true },
  streak_3: { id: "streak_3", type: "daily_limit", reward: 200, dayLimited: true },
  streak_10: { id: "streak_10", type: "daily_limit", reward: 500, dayLimited: true }};

function utcMidnightIso(d = new Date()): string {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999),
  ).toISOString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const taskId = String(body.task_id || body.taskId || "").trim();
    const task = TASKS[taskId];
    if (!task) throw new Error("Unknown task_id");

    const sb = adminClient();
    const { data: row, error: selErr } = await sb
      .from("players")
      .select(
        "shard_balance, lifetime_taps, current_streak, completed_tasks, inventory",
      )
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!row) throw new Error("Player not found");

    const done = Array.isArray(row.completed_tasks) ? [...row.completed_tasks] : [];
    if (done.includes(taskId)) {
      return jsonResponse({
        success: true,
        already: true,
        completed_tasks: done,
        inventory: row.inventory,
        shard_balance: row.shard_balance});
    }

    // Light readiness checks (server)
    const taps = Number(row.lifetime_taps) || 0;
    const streak = Number(row.current_streak) || 0;
    if (taskId === "taps_1000" && taps < 1000) throw new Error("Need 1,000 lifetime taps");
    if (taskId === "taps_5000" && taps < 5000) throw new Error("Need 5,000 lifetime taps");
    if (taskId === "streak_3" && streak < 3) throw new Error("Need 3-day streak");
    if (taskId === "streak_7" && streak < 7) throw new Error("Need 7-day streak");
    if (taskId === "streak_10" && streak < 10) throw new Error("Need 10-day streak");
    // social tasks: trust client opened link once (or require future proof)

    const inv = invObj(row.inventory);
    const claimKey = `lifetime:${taskId}`;
    const log = Array.isArray(inv.claim_log) ? [...(inv.claim_log as string[])] : [];
    if (log.includes(claimKey)) {
      return jsonResponse({ success: true, already: true });
    }
    log.push(claimKey);
    inv.claim_log = log.sort();
    const newDone = [...new Set([...done, taskId])];

    let shard_balance = Number(row.shard_balance) || 0;
    const updates: Record<string, unknown> = {
      completed_tasks: newDone,
      inventory: inv,
      last_updated: new Date().toISOString(),
    };

    if (task.type === "shards") {
      shard_balance = Math.round((shard_balance + task.reward) * 1000) / 1000;
      updates.shard_balance = shard_balance;
    } else if (task.type === "daily_limit") {
      const prev = inv.task_limit_boost as { amount?: number; expires?: string } | undefined;
      const now = Date.now();
      let amount = task.reward;
      if (prev?.expires && new Date(prev.expires).getTime() > now) {
        amount = (Number(prev.amount) || 0) + task.reward;
      }
      inv.task_limit_boost = {
        amount,
        expires: utcMidnightIso()};
      updates.inventory = inv;
    }

    const { error: upErr } = await sb
      .from("players")
      .update(updates)
      .eq("telegram_id", playerId);
    if (upErr) throw upErr;

    await logEconomy(sb, {
      player_id: playerId,
      kind: "task_claim",
      delta: task.type === "shards" ? task.reward : 0,
      balance_after: shard_balance,
      ref: taskId,
      meta: { type: task.type, reward: task.reward }});

    return jsonResponse({
      success: true,
      already: false,
      task_id: taskId,
      completed_tasks: newDone,
      inventory: inv,
      shard_balance});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /authenticated|expired|signature|Invalid session|Not authenticated/i.test(
      message,
    )
      ? 401
      : 400;
    return jsonResponse({ error: message }, status);
  }
});
