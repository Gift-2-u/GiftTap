/**
 * mystery-open — burn weekly badges → weighted Mystery Gift + sub-rolls.
 * Requires on-chain 0.0005 SOL project fee (same treasury as Premium Shop).
 *
 * Top odds by burn tier (MYSTERY_ODDS). Then:
 *   free_boost    → frenzy | battery | refill (~⅓) → inventory
 *   premium_boost → bot / timed premiums (1|3|7d) / frenzy / +1k / refill → inventory
 *   shards_bulk   → shard_balance (G2Ushards) immediately
 *
 * Timed premiums also push premium_duration_queue so activate uses rolled days.
 * No $G2U or NFT prizes from Mystery Gift.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  logEconomy,
  MYSTERY_COSTS,
  MYSTERY_ODDS,
  BADGE_ITEM,
  rollMystery,
  invObj,
} from "../_shared/economy.ts";
import {
  isPremiumDurationDays,
  PREMIUM_DURATION_CHOICE_IDS,
  PREMIUM_PROJECT_FEE_SOL,
  pushPremiumDuration,
} from "../_shared/premiumDuration.ts";

const TREASURY_SOL = "8G7uEcPS6dwA5wW9bGoqi98EzBunF8trjbbFJkgkvBPm";
const FEE_LAMPORTS = Math.floor(PREMIUM_PROJECT_FEE_SOL * 1e9);

function accountKeysFromTx(tx: Record<string, unknown>): string[] {
  const message = (tx.transaction as { message?: Record<string, unknown> })
    ?.message;
  if (!message) return [];
  const raw = (message.accountKeys || []) as unknown[];
  const keys = raw.map((k) => {
    if (typeof k === "string") return k;
    if (k && typeof k === "object" && "pubkey" in (k as object)) {
      return String((k as { pubkey: string }).pubkey);
    }
    return String(k || "");
  });
  const meta = tx.meta as
    | { loadedAddresses?: { writable?: string[]; readonly?: string[] } }
    | undefined;
  const loaded = meta?.loadedAddresses;
  if (loaded) {
    for (const a of loaded.writable || []) keys.push(String(a));
    for (const a of loaded.readonly || []) keys.push(String(a));
  }
  return keys.filter(Boolean);
}

async function assertMysteryFeeTx(
  rpc: string,
  txSignature: string,
  fromWallet: string,
): Promise<void> {
  let tx: Record<string, unknown> | null = null;
  for (let i = 0; i < 8; i++) {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [
          txSignature,
          { encoding: "json", maxSupportedTransactionVersion: 0 },
        ],
      }),
    });
    const j = await res.json();
    tx = (j?.result as Record<string, unknown>) || null;
    if (tx) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!tx) {
    throw new Error("Fee transaction not found — wait a moment and try again");
  }
  const meta = tx.meta as
    | { err?: unknown; preBalances?: number[]; postBalances?: number[] }
    | undefined;
  if (meta?.err) throw new Error("Fee transaction failed on-chain");

  const keys = accountKeysFromTx(tx);
  const fromIdx = keys.findIndex((k) => k === fromWallet);
  const treasIdx = keys.findIndex((k) => k === TREASURY_SOL);
  if (fromIdx < 0 || treasIdx < 0) {
    throw new Error("Fee tx must send 0.0005 SOL to the project treasury");
  }
  const pre = meta?.preBalances || [];
  const post = meta?.postBalances || [];
  const treasGain = (Number(post[treasIdx]) || 0) - (Number(pre[treasIdx]) || 0);
  if (treasGain < FEE_LAMPORTS) {
    throw new Error("Missing 0.0005 SOL project fee on Mystery open");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const tier = String(body.tier || "").toLowerCase();
    const txSignature = String(
      body.tx_signature || body.txSignature || body.signature || "",
    ).trim();
    const cost = MYSTERY_COSTS[tier];
    if (!cost || !BADGE_ITEM[tier]) {
      throw new Error("Invalid badge tier (use bronze|silver|gold|diamond)");
    }
    if (!MYSTERY_ODDS[tier]) {
      throw new Error("No Mystery odds for that badge tier");
    }
    if (!txSignature || txSignature.length < 32) {
      throw new Error("tx_signature required (0.0005 SOL project fee)");
    }

    const sb = adminClient();

    // Replay guard — same fee tx cannot open twice
    {
      const { data: prior } = await sb
        .from("economy_events")
        .select("id")
        .eq("player_id", playerId)
        .eq("kind", "mystery_open")
        .eq("ref", txSignature)
        .maybeSingle();
      if (prior) {
        const { data: p } = await sb
          .from("players")
          .select("inventory, shard_balance")
          .eq("telegram_id", playerId)
          .maybeSingle();
        return jsonResponse({
          success: true,
          already: true,
          inventory: p?.inventory || {},
          shard_balance: Number(p?.shard_balance) || 0,
        });
      }
    }

    const { data: row, error: selErr } = await sb
      .from("players")
      .select("inventory, shard_balance, wallet_address")
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!row) throw new Error("Player not found");

    const playerWallet = String(row.wallet_address || "").trim();
    if (playerWallet.length < 32) {
      throw new Error("Game wallet required to pay the 0.0005 SOL Mystery fee");
    }

    const rpc =
      Deno.env.get("SOLANA_RPC_URL") ||
      Deno.env.get("VITE_SOLANA_RPC_URL") ||
      "";
    if (!rpc) throw new Error("SOLANA_RPC_URL unset");
    await assertMysteryFeeTx(rpc, txSignature, playerWallet);

    const inv = invObj(row.inventory);
    const badgeKey = BADGE_ITEM[tier];
    const have = Math.max(0, Math.floor(Number(inv[badgeKey]) || 0));
    if (have < cost) {
      throw new Error(`Need ${cost} ${tier} badge(s) (you have ${have})`);
    }

    inv[badgeKey] = have - cost;
    if ((inv[badgeKey] as number) <= 0) delete inv[badgeKey];

    const reward = rollMystery(tier);
    let shard_balance = Number(row.shard_balance) || 0;
    let balanceDelta = 0;
    const dest = reward.dest || "backpack";

    if (reward.type === "shards" && reward.amount) {
      balanceDelta = Number(reward.amount) || 0;
      shard_balance = Math.round((shard_balance + balanceDelta) * 1000) / 1000;
    } else if (reward.type === "item" && reward.itemId) {
      inv[reward.itemId] = (Number(inv[reward.itemId]) || 0) + 1;
      if (
        PREMIUM_DURATION_CHOICE_IDS.has(reward.itemId) &&
        isPremiumDurationDays(reward.days)
      ) {
        pushPremiumDuration(inv, reward.itemId, reward.days);
      }
    }

    const opens = Array.isArray(inv.mystery_opens)
      ? [...(inv.mystery_opens as unknown[])]
      : [];
    opens.push({
      at: new Date().toISOString(),
      burn: tier,
      cost,
      prizeId: reward.prizeId,
      label: reward.label,
      itemId: reward.itemId || null,
      days: reward.days || null,
      amount: reward.amount || null,
      dest,
      fee_sol: PREMIUM_PROJECT_FEE_SOL,
      fee_tx: txSignature,
    });
    inv.mystery_opens = opens.slice(-30);

    const { error: upErr } = await sb
      .from("players")
      .update({
        inventory: inv,
        shard_balance,
      })
      .eq("telegram_id", playerId);
    if (upErr) throw upErr;

    await logEconomy(sb, {
      player_id: playerId,
      kind: "mystery_open",
      delta: balanceDelta,
      balance_after: shard_balance,
      ref: txSignature,
      meta: {
        cost,
        reward,
        dest,
        wallet: playerWallet,
        fee_sol: PREMIUM_PROJECT_FEE_SOL,
        treasury: TREASURY_SOL,
        tier,
      },
    });

    return jsonResponse({
      success: true,
      tier,
      cost,
      odds: MYSTERY_ODDS[tier],
      reward: { ...reward, dest },
      inventory: inv,
      shard_balance,
      balance_delta: balanceDelta,
      dest,
      fee_sol: PREMIUM_PROJECT_FEE_SOL,
      tx_signature: txSignature,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /authenticated|expired|signature|Invalid session|Not authenticated/i
      .test(message)
      ? 401
      : 400;
    return jsonResponse({ error: message }, status);
  }
});
