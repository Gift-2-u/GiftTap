/**
 * wall-climb — server unlocks max_unlocked_level and deducts shards.
 * SOL payment is verified lightly via optional tx_signature log (client pays first).
 * JWT required.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  logEconomy,
  invObj,
} from "../_shared/economy.ts";

const WALLS: Record<
  number,
  { targetLevel: number; shardCost: number; solCost: number; requiresBoth: boolean; newCap: number }
> = {
  4: { targetLevel: 5, shardCost: 15000, solCost: 0.025, requiresBoth: false, newCap: 9 },
  9: { targetLevel: 10, shardCost: 30000, solCost: 0.05, requiresBoth: false, newCap: 19 },
  19: { targetLevel: 20, shardCost: 50000, solCost: 0.05, requiresBoth: true, newCap: 29 },
  29: { targetLevel: 30, shardCost: 100000, solCost: 0.1, requiresBoth: true, newCap: 49 },
  49: { targetLevel: 50, shardCost: 300000, solCost: 0.35, requiresBoth: true, newCap: 74 },
  74: { targetLevel: 75, shardCost: 800000, solCost: 0.75, requiresBoth: true, newCap: 99 },
  99: { targetLevel: 100, shardCost: 2500000, solCost: 1.5, requiresBoth: true, newCap: 100 },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const method = String(body.method || "shards").toLowerCase(); // shards | sol | both
    const txSignature = body.tx_signature ? String(body.tx_signature) : null;

    const sb = adminClient();
    const { data: row, error: selErr } = await sb
      .from("players")
      .select("shard_balance, max_unlocked_level, inventory, lifetime_taps")
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!row) throw new Error("Player not found");

    const wallKey = Number(row.max_unlocked_level) || 4;
    const wall = WALLS[wallKey];
    if (!wall) {
      throw new Error("No climb wall at your current unlock tier");
    }

    if (wall.requiresBoth && method !== "both") {
      throw new Error(
        `This wall needs BOTH ${wall.shardCost} shards AND ${wall.solCost} SOL`,
      );
    }
    if (!wall.requiresBoth && method === "both") {
      throw new Error("Use method shards or sol for this wall");
    }
    if ((method === "sol" || method === "both") && !txSignature) {
      throw new Error("tx_signature required after SOL payment");
    }

    let balance = Number(row.shard_balance) || 0;
    const needShards = method === "shards" || method === "both";
    if (needShards) {
      if (balance + 1e-9 < wall.shardCost) {
        throw new Error(
          `Need ${wall.shardCost.toLocaleString()} shards (have ${balance.toLocaleString()})`,
        );
      }
      balance = Math.round((balance - wall.shardCost) * 1000) / 1000;
    }

    const inv = invObj(row.inventory);
    inv.wall_snooze_level = null;
    delete inv.wall_fee_progress;
    delete inv.wall_fee_wall;

    const updates = {
      shard_balance: balance,
      max_unlocked_level: wall.newCap,
      inventory: inv,
      last_updated: new Date().toISOString(),
    };

    const { error: upErr } = await sb
      .from("players")
      .update(updates)
      .eq("telegram_id", playerId);
    if (upErr) throw upErr;

    await logEconomy(sb, {
      player_id: playerId,
      kind: "wall_climb",
      delta: needShards ? -wall.shardCost : 0,
      balance_after: balance,
      ref: `wall_${wallKey}`,
      meta: {
        method,
        targetLevel: wall.targetLevel,
        newCap: wall.newCap,
        tx_signature: txSignature,
        solCost: wall.solCost,
      },
    });

    return jsonResponse({
      success: true,
      method,
      wall_key: wallKey,
      target_level: wall.targetLevel,
      new_cap: wall.newCap,
      shard_balance: balance,
      max_unlocked_level: wall.newCap,
      inventory: inv,
      tx_signature: txSignature,
    });
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
