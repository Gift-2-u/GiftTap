/**
 * elf-level-up — bump inventory.elf_levels[asset_id].
 * Body: { asset_id, kind, rarity, currency?: 'sol'|'g2u', tx_signature? }
 * Post-launch: currency=g2u debits gft_token_balance (SOL price × G2U_PER_SOL).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  invObj,
  logEconomy,
  echoMultiplier,
  rushDailyLimit,
  shadowHours,
  PLAYER_ECONOMY_SELECT,
  instantEconomyPatch,
  g2uShopEnabled,
  solToG2u,
} from "../_shared/economy.ts";
import { ensureNftDurabilityOnActivate } from "../_shared/nftDurability.ts";

const ELF_LEVEL_UP_SOL: Record<string, number[]> = {
  // Totals: Common 0.20 · Rare 0.60 · Epic 1.25 · Legendary 4.50
  common: [0.02, 0.04, 0.06, 0.08],
  rare: [0.05, 0.1, 0.2, 0.25],
  epic: [0.15, 0.25, 0.35, 0.5],
  legendary: [0.5, 0.8, 1.2, 2.0]};
/** Locksmith L1→2 … L4→5 (mint = first wall ×4; not Rare ladder) */
const LOCKSMITH_LEVEL_UP_SOL = [0.2, 0.35, 0.6, 1.5];
const MAX_LEVEL = 5;
const KINDS = new Set([
  "fate",
  "echo",
  "rush",
  "shadow",
  "locksmith",
]);

function normRarity(r: string): string {
  const k = String(r || "common").toLowerCase().replace(/\s+/g, "");
  return ELF_LEVEL_UP_SOL[k] ? k : "common";
}

function readLevel(inv: Record<string, unknown>, assetId: string): number {
  const map = inv.elf_levels;
  if (map && typeof map === "object") {
    const n = Math.floor(Number((map as Record<string, unknown>)[assetId]) || 0);
    if (n >= 1) return Math.min(MAX_LEVEL, n);
  }
  return 1;
}

function syncActiveLevel(
  inv: Record<string, unknown>,
  kind: string,
  assetId: string,
  rarity: string,
  level: number,
) {
  const now = new Date().toISOString();
  if (kind === "echo") {
    const prev =
      inv.echo_active && typeof inv.echo_active === "object"
        ? (inv.echo_active as Record<string, unknown>)
        : null;
    const prevId = String(prev?.asset_id || prev?.assetId || "").trim();
    // Update active Echo when this is the focused asset (or none focused yet).
    // Always rewrite level + multi from the full rarity ladder (common→legendary, L1–5).
    if (!prevId || prevId === assetId) {
      inv.echo_active = ensureNftDurabilityOnActivate(
        {
          rarity,
          level,
          asset_id: assetId,
          multi: echoMultiplier(rarity, level),
          activated_at: now},
        prev,
      );
    }
  } else if (kind === "fate") {
    const prev =
      inv.fate_power && typeof inv.fate_power === "object"
        ? (inv.fate_power as Record<string, unknown>)
        : null;
    const prevId = String(prev?.asset_id || prev?.assetId || "").trim();
    if (!prevId || prevId === assetId) {
      inv.fate_power = ensureNftDurabilityOnActivate(
        {
          rarity,
          level,
          asset_id: assetId,
          activated_at: now,
        },
        prev,
      );
      inv.fate_active = assetId;
    }
  } else if (kind === "rush") {
    const prev =
      inv.rush_active && typeof inv.rush_active === "object"
        ? (inv.rush_active as Record<string, unknown>)
        : null;
    const prevId = String(prev?.asset_id || prev?.assetId || "").trim();
    if (!prevId || prevId === assetId) {
      inv.rush_active = ensureNftDurabilityOnActivate(
        {
          rarity,
          level,
          asset_id: assetId,
          daily_cap: rushDailyLimit(rarity, level),
          activated_at: now},
        prev,
      );
    }
  } else if (kind === "shadow") {
    const prev =
      inv.shadow_active && typeof inv.shadow_active === "object"
        ? (inv.shadow_active as Record<string, unknown>)
        : null;
    const prevId = String(prev?.asset_id || prev?.assetId || "").trim();
    if (!prevId || prevId === assetId) {
      inv.shadow_active = ensureNftDurabilityOnActivate(
        {
          rarity,
          level,
          asset_id: assetId,
          hours: shadowHours(rarity, level),
          activated_at: now,
        },
        prev,
      );
    }
  } else if (kind === "locksmith") {
    inv.locksmith_active = {
      level,
      asset_id: assetId,
      activated_at: now};
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
    const assetId = String(body.asset_id || body.assetId || "").trim();
    const kind = String(body.kind || "").toLowerCase().trim();
    const rarity = normRarity(String(body.rarity || body.rarityKey || "common"));
    const currency = String(body.currency || "sol").toLowerCase().trim();
    const txSignature = body.tx_signature ? String(body.tx_signature) : "";

    if (!assetId || assetId.length < 32) throw new Error("asset_id required");
    if (!KINDS.has(kind)) throw new Error("kind must be fate|echo|rush|shadow|locksmith");
    if (currency === "g2u") {
      if (!g2uShopEnabled()) {
        throw new Error("NFT level-up with $G2U opens after token launch");
      }
      if (!txSignature || txSignature.length < 32) {
        throw new Error(
          "tx_signature required — send $G2U on-chain to master first",
        );
      }
    } else if (!txSignature) {
      throw new Error("tx_signature required after SOL payment");
    }

    const sb = adminClient();

    // Idempotent: same payment tx cannot level twice
    if (txSignature) {
      const { data: prior } = await sb
        .from("economy_events")
        .select("id")
        .eq("player_id", playerId)
        .eq("kind", "elf_level_up")
        .eq("ref", txSignature)
        .maybeSingle();
      if (prior) {
        const { data: p } = await sb
          .from("players")
          .select("inventory, tap_power, max_daily_limit, gft_token_balance")
          .eq("telegram_id", playerId)
          .maybeSingle();
        return jsonResponse({
          success: true,
          already: true,
          inventory: p?.inventory || {},
          tap_power: p?.tap_power,
          max_daily_limit: p?.max_daily_limit,
          gft_token_balance: p?.gft_token_balance,
        });
      }
    }

    if (currency === "g2u" || currency === "sol") {
      const rpc =
        Deno.env.get("SOLANA_RPC_URL") ||
        Deno.env.get("VITE_SOLANA_RPC_URL") ||
        "";
      if (rpc && txSignature) {
        try {
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
          const tx = j?.result;
          if (!tx) {
            console.warn("elf-level-up: tx not found yet", txSignature);
          } else if (tx.meta?.err) {
            throw new Error("On-chain level-up payment failed");
          }
        } catch (e) {
          if (e instanceof Error && /failed/i.test(e.message)) throw e;
          console.warn("elf-level-up verify skip", e);
        }
      }
    }

    const { data: row, error } = await sb
      .from("players")
      .select(`${PLAYER_ECONOMY_SELECT}, gft_token_balance`)
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Player not found");

    const inv = invObj(row.inventory);
    const fromLevel = readLevel(inv, assetId);
    if (fromLevel >= MAX_LEVEL) throw new Error("Already max level (L5)");

    const ladder =
      kind === "locksmith" ? LOCKSMITH_LEVEL_UP_SOL : ELF_LEVEL_UP_SOL[rarity];
    const costSol = ladder[fromLevel - 1];
    if (!Number.isFinite(costSol)) throw new Error("No level-up cost for this step");
    const costG2u = solToG2u(costSol);

    const toLevel = fromLevel + 1;
    const levels =
      inv.elf_levels && typeof inv.elf_levels === "object"
        ? { ...(inv.elf_levels as Record<string, unknown>) }
        : {};
    levels[assetId] = toLevel;
    inv.elf_levels = levels;
    syncActiveLevel(inv, kind, assetId, rarity, toLevel);

    const patch = instantEconomyPatch(row as Record<string, unknown>, inv);
    // G2U is paid on-chain to master — do not silently debit gft_token_balance
    const { data: updated, error: upErr } = await sb
      .from("players")
      .update(patch)
      .eq("telegram_id", playerId)
      .select("inventory, tap_power, max_daily_limit, gft_token_balance")
      .maybeSingle();
    if (upErr) throw upErr;

    // Verify write stuck (guards against silent inventory clobber)
    const written = invObj(updated?.inventory);
    const confirmLvl = readLevel(written, assetId);
    if (confirmLvl < toLevel) {
      throw new Error(
        `Level write failed (still L${confirmLvl} in DB). Payment tx: ${txSignature}`,
      );
    }

    await logEconomy(sb, {
      player_id: playerId,
      kind: "elf_level_up",
      delta: currency === "g2u" ? -costG2u : 0,
      balance_after: null,
      ref: txSignature || assetId,
      meta: {
        nft_kind: kind,
        asset_id: assetId,
        rarity,
        from_level: fromLevel,
        to_level: toLevel,
        cost_sol: costSol,
        cost_g2u: currency === "g2u" ? costG2u : undefined,
        currency: currency === "g2u" ? "g2u_onchain" : currency,
        tap_power: patch.tap_power,
        max_daily_limit: patch.max_daily_limit,
        tx_signature: txSignature || null,
      },
    });

    return jsonResponse({
      success: true,
      asset_id: assetId,
      kind,
      rarity,
      from_level: fromLevel,
      to_level: toLevel,
      cost_sol: costSol,
      cost_g2u: currency === "g2u" ? costG2u : undefined,
      currency,
      inventory: updated?.inventory ?? inv,
      tap_power:
        (updated as { tap_power?: number } | null)?.tap_power ?? patch.tap_power,
      max_daily_limit:
        (updated as { max_daily_limit?: number } | null)?.max_daily_limit ??
        patch.max_daily_limit,
      gft_token_balance: (updated as { gft_token_balance?: number } | null)
        ?.gft_token_balance,
      tx_signature: txSignature || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      /authenticated|expired|signature|Invalid session|Not authenticated/i.test(
          message,
        )
        ? 401
        : 400;
    return jsonResponse({ error: message }, status);
  }
});
