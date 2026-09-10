/**
 * wall-climb — unlock max_unlocked_level.
 *
 * Methods: shards | sol | both | locksmith
 * - Paid climb: higher tap tier only. NO shoe.
 * - Locksmith climb: free (level must cover wall) + Common Shoe on walls 5/10/20.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  logEconomy,
  invObj,
  runReferralCredit,
} from "../_shared/economy.ts";

const WALLS: Record<
  number,
  {
    targetLevel: number;
    shardCost: number;
    solCost: number;
    g2uCost: number;
    requiresBoth: boolean;
    payWithG2u?: boolean;
    newCap: number;
  }
> = {
  // Shard costs unchanged. Fixed $G2U (payWithG2u). solCost = legacy only.
  4: {
    targetLevel: 5,
    shardCost: 15000,
    g2uCost: 10000,
    solCost: 0.02,
    requiresBoth: true,
    payWithG2u: true,
    newCap: 9,
  },
  9: {
    targetLevel: 10,
    shardCost: 30000,
    g2uCost: 25000,
    solCost: 0.03,
    requiresBoth: true,
    payWithG2u: true,
    newCap: 19,
  },
  19: {
    targetLevel: 20,
    shardCost: 50000,
    g2uCost: 75000,
    solCost: 0.05,
    requiresBoth: true,
    payWithG2u: true,
    newCap: 29,
  },
  29: {
    targetLevel: 30,
    shardCost: 100000,
    g2uCost: 300000,
    solCost: 0.1,
    requiresBoth: true,
    payWithG2u: true,
    newCap: 49,
  },
  49: {
    targetLevel: 50,
    shardCost: 300000,
    g2uCost: 1000000,
    solCost: 0.35,
    requiresBoth: true,
    payWithG2u: true,
    newCap: 74,
  },
  74: {
    targetLevel: 75,
    shardCost: 800000,
    g2uCost: 2500000,
    solCost: 0.75,
    requiresBoth: true,
    payWithG2u: true,
    newCap: 99,
  },
  99: {
    targetLevel: 100,
    shardCost: 2500000,
    g2uCost: 5000000,
    solCost: 1.5,
    requiresBoth: true,
    payWithG2u: true,
    newCap: 100,
  },
};

/** Locksmith level required for free climb (L1 covers walls 5/10/20) */
const LOCKSMITH_LEVEL_FOR_WALL: Record<number, number> = {
  4: 1,
  9: 1,
  19: 1,
  29: 2,
  49: 3,
  74: 4,
  99: 5,
};

/** Shoe on Locksmith climb: wall 5, wall 30, wall 50 only */
const WALLS_GRANT_COMMON_SHOE = new Set([4, 29, 49]);

const SHOE_KEY = "walk2u_shoe_common";

function locksmithLevel(inv: Record<string, unknown>): number {
  const raw = inv.locksmith_active;
  if (!raw || typeof raw !== "object") return 0;
  let level = Math.floor(Number((raw as Record<string, unknown>).level) || 0);
  if (level < 0) level = 0;
  return level;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const method = String(body.method || "shards").toLowerCase();
    const txSignature = body.tx_signature ? String(body.tx_signature) : null;
    const currency = String(body.currency || "").toLowerCase().trim();

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

    const inv = invObj(row.inventory);
    const lsLevel = locksmithLevel(inv);
    const needLs = LOCKSMITH_LEVEL_FOR_WALL[wallKey] || 99;
    const locksmithFree = method === "locksmith";
    // Token already live — payWithG2u walls always use fixed $G2U (no launch gate)
    const payG2u = !!wall.payWithG2u;

    if (locksmithFree) {
      if (lsLevel < needLs) {
        throw new Error(
          lsLevel < 1
            ? "Own GiftLocksmith in wallet/backpack to climb free and claim the shoe"
            : `GiftLocksmith L${needLs}+ required for this wall (you have L${lsLevel})`,
        );
      }
    } else {
      if (payG2u) {
        if (method !== "both") {
          throw new Error(
            `This wall needs BOTH ${wall.shardCost.toLocaleString()} shards AND ${(wall.g2uCost || 0).toLocaleString()} $G2U`,
          );
        }
        if (!txSignature || txSignature.length < 32) {
          throw new Error("tx_signature required after $G2U payment");
        }
        if (currency && currency !== "g2u") {
          throw new Error("Paid wall climb uses $G2U");
        }
      } else {
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
      }
    }

    let balance = Number(row.shard_balance) || 0;
    const needShards = !locksmithFree && (method === "shards" || method === "both");
    if (needShards) {
      if (balance + 1e-9 < wall.shardCost) {
        throw new Error(
          `Need ${wall.shardCost.toLocaleString()} shards (have ${balance.toLocaleString()})`,
        );
      }
      balance = Math.round((balance - wall.shardCost) * 1000) / 1000;
    }

    inv.wall_snooze_level = null;
    delete inv.wall_fee_progress;
    delete inv.wall_fee_wall;

    // Shoe ONLY for Locksmith climbs on walls 5 / 30 / 50 (not paid climbs)
    let shoeGranted = false;
    if (locksmithFree && WALLS_GRANT_COMMON_SHOE.has(wallKey)) {
      const prevShoes = Math.max(0, Math.floor(Number(inv[SHOE_KEY]) || 0));
      inv[SHOE_KEY] = prevShoes + 1;
      shoeGranted = true;
    }

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

    // First wall (4→5, newCap 9): pay referrer +3000 once via existing referral-credit
    if (wallKey === 4) {
      try {
        await runReferralCredit(sb, playerId, "wall5");
      } catch (e) {
        console.warn("referral wall5 after climb", e);
      }
    }

    await logEconomy(sb, {
      player_id: playerId,
      kind: "wall_climb",
      delta: needShards ? -wall.shardCost : 0,
      balance_after: balance,
      ref: txSignature || `wall_${wallKey}`,
      meta: {
        method,
        currency: payG2u ? "g2u" : method === "sol" || method === "both" ? "sol" : "shards",
        targetLevel: wall.targetLevel,
        newCap: wall.newCap,
        tx_signature: txSignature,
        solCost: locksmithFree || payG2u ? 0 : wall.solCost,
        g2uCost:
          payG2u && !locksmithFree
            ? Math.round(Number(wall.g2uCost) || 0)
            : undefined,
        locksmith_level: lsLevel,
        shoe_granted: shoeGranted,
        shoe_common_after: inv[SHOE_KEY] ?? null,
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
      walk2u_shoe_common: inv[SHOE_KEY] ?? 0,
      shoe_granted: shoeGranted,
      locksmith_free: locksmithFree,
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
