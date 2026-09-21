/**
 * nft-voucher — Common elf 60% off voucher (Option B).
 * Actions:
 *   status  — current voucher for JWT player
 *   grant   — TwrLtr only: grant by target username
 *   consume — burn one use after successful promo Common mint
 *
 * Promo mints use SEPARATE candy machines at 40% price (live CMs untouched).
 * Deploy those CMs with allowList before going live.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  invObj,
} from "../_shared/economy.ts";

const VOUCHER_KEY = "nft_voucher";
const KINDS = new Set(["fate", "echo", "rush", "shadow"]);

const TEMPLATE = {
  id: "common60_v1",
  discount_bps: 6000,
  applies_to: ["fate", "echo", "rush", "shadow"],
  rarity: "common",
  uses_left: 1,
  source: "promo",
};

function activeVoucher(inv: Record<string, unknown>, now = Date.now()) {
  const v = inv[VOUCHER_KEY];
  if (!v || typeof v !== "object") return null;
  const row = v as Record<string, unknown>;
  const uses = Math.floor(Number(row.uses_left) || 0);
  if (uses < 1) return null;
  if (row.expires_at) {
    const exp = new Date(String(row.expires_at)).getTime();
    if (Number.isFinite(exp) && exp <= now) return null;
  }
  if (String(row.rarity || "common").toLowerCase() !== "common") return null;
  return row;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const claimUser = String(
      (claims as { username?: string }).username || "",
    ).trim();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "status").toLowerCase();
    const sb = adminClient();

    if (action === "status") {
      const { data: row, error } = await sb
        .from("players")
        .select("inventory, username")
        .eq("telegram_id", playerId)
        .maybeSingle();
      if (error) throw error;
      if (!row) throw new Error("Player not found");
      const inv = invObj(row.inventory);
      const v = activeVoucher(inv);
      return jsonResponse({
        ok: true,
        active: !!v,
        voucher: v,
        username: row.username,
      });
    }

    if (action === "grant") {
      if (claimUser.toLowerCase() !== "twrltr") {
        throw new Error("Only TwrLtr can grant NFT vouchers");
      }
      const targetUser = String(body.username || body.targetUsername || "")
        .trim();
      if (!targetUser) throw new Error("username required");
      const expiresAt = body.expires_at
        ? String(body.expires_at)
        : body.expiresAt
        ? String(body.expiresAt)
        : null;

      const { data: target, error } = await sb
        .from("players")
        .select("telegram_id, inventory, username")
        .ilike("username", targetUser)
        .maybeSingle();
      if (error) throw error;
      if (!target) throw new Error(`Player not found: ${targetUser}`);

      const inv = invObj(target.inventory);
      const existing = activeVoucher(inv);
      if (existing) {
        return jsonResponse({
          ok: true,
          already: true,
          username: target.username,
          voucher: existing,
        });
      }
      inv[VOUCHER_KEY] = {
        ...TEMPLATE,
        granted_at: new Date().toISOString(),
        granted_by: claimUser,
        ...(expiresAt ? { expires_at: expiresAt } : {}),
      };
      const { error: upErr } = await sb
        .from("players")
        .update({ inventory: inv })
        .eq("telegram_id", target.telegram_id);
      if (upErr) throw upErr;
      return jsonResponse({
        ok: true,
        granted: true,
        username: target.username,
        telegram_id: target.telegram_id,
        voucher: inv[VOUCHER_KEY],
      });
    }

    if (action === "consume") {
      const kind = String(body.kind || "").toLowerCase();
      const rarity = String(body.rarity || body.rarityKey || "common")
        .toLowerCase();
      if (!KINDS.has(kind)) {
        throw new Error("kind must be fate|echo|rush|shadow");
      }
      if (rarity !== "common") {
        throw new Error("voucher is Common only");
      }
      const assetId = String(body.asset_id || body.assetId || "").trim();
      const txSignature = String(body.tx_signature || body.txSignature || "")
        .trim();

      const { data: row, error } = await sb
        .from("players")
        .select("inventory")
        .eq("telegram_id", playerId)
        .maybeSingle();
      if (error) throw error;
      if (!row) throw new Error("Player not found");
      const inv = invObj(row.inventory);
      const v = activeVoucher(inv);
      if (!v) throw new Error("No active Common NFT voucher");
      const applies = Array.isArray(v.applies_to)
        ? (v.applies_to as unknown[]).map((x) => String(x).toLowerCase())
        : [...KINDS];
      if (!applies.includes(kind)) {
        throw new Error("Voucher does not apply to this NFT");
      }

      const uses = Math.floor(Number(v.uses_left) || 0) - 1;
      if (uses <= 0) {
        delete inv[VOUCHER_KEY];
      } else {
        inv[VOUCHER_KEY] = {
          ...v,
          uses_left: uses,
          consumed_at: new Date().toISOString(),
          consumed_kind: kind,
          ...(assetId ? { consumed_asset_id: assetId } : {}),
          ...(txSignature ? { consumed_tx: txSignature } : {}),
        };
      }
      const { error: upErr } = await sb
        .from("players")
        .update({ inventory: inv })
        .eq("telegram_id", playerId);
      if (upErr) throw upErr;
      return jsonResponse({
        ok: true,
        consumed: true,
        kind,
        inventory: inv,
      });
    }

    throw new Error("action must be status|grant|consume");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /authenticated|expired|signature|Invalid session|Not authenticated/i
        .test(message)
      ? 401
      : 400;
    return jsonResponse({ error: message }, status);
  }
});
