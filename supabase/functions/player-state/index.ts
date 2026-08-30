import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import { effectiveDailyLimit } from "../_shared/economy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-gift-session, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Match src/tokenLaunch.js — on-chain $G2U column sync starts at launch. */
const TOKEN_LAUNCH_AT_MS = Date.parse("2026-09-01T00:00:00Z");
const G2U_MINT_DEFAULT = "EvFu9qKTNi3wWDbgnm5qmZjLFUHDN3o4A8HjUrqaGMBR";

function rpcUrl(): string {
  return (
    Deno.env.get("VITE_SOLANA_RPC_URL") ||
    Deno.env.get("SOLANA_RPC_URL") ||
    "https://api.mainnet-beta.solana.com"
  );
}

function g2uMint(): string {
  return (
    Deno.env.get("G2U_MINT") ||
    Deno.env.get("G2U_TOKEN_MINT") ||
    Deno.env.get("GFT_MINT") ||
    G2U_MINT_DEFAULT
  );
}

function g2uChainSyncEnabled(nowMs = Date.now()): boolean {
  const flag = String(Deno.env.get("G2U_CHAIN_SYNC") || "").toLowerCase();
  if (["1", "true", "yes", "on"].includes(flag)) return true;
  if (["0", "false", "no", "off"].includes(flag)) return false;
  return nowMs >= TOKEN_LAUNCH_AT_MS;
}

/** Read live SOL (+ $G2U ATA after launch) for wallet; service_role writes columns. */
async function readChainBalances(walletAddress: string): Promise<{
  sol: number;
  g2u: number | null;
}> {
  const {
    Connection,
    PublicKey,
  } = await import("npm:@solana/web3.js@1.98.4");
  const { getAssociatedTokenAddressSync } = await import(
    "npm:@solana/spl-token@0.4.9"
  );
  const connection = new Connection(rpcUrl(), "confirmed");
  const owner = new PublicKey(String(walletAddress).trim());
  const lamports = await connection.getBalance(owner);
  const sol = Math.round((lamports / 1e9) * 1e9) / 1e9;

  let g2u: number | null = null;
  if (g2uChainSyncEnabled()) {
    try {
      const mint = new PublicKey(g2uMint());
      const ata = getAssociatedTokenAddressSync(mint, owner);
      const bal = await connection.getTokenAccountBalance(ata);
      g2u = Number(bal?.value?.uiAmount) || 0;
    } catch {
      g2u = 0;
    }
  }
  return { sol, g2u };
}

const ENERGY_CAP = 500;
const ENERGY_SECONDS_PER_POINT = 1.5;

function utcDayStr(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Same rules as commit-taps — catch up bar before stamping last_updated. */
function energyFromAnchor(
  value: number,
  atIso: string | null | undefined,
  nowMs = Date.now(),
): number {
  const at = atIso ? Date.parse(String(atIso)) : NaN;
  if (Number.isFinite(at) && utcDayStr(at) < utcDayStr(nowMs)) {
    return ENERGY_CAP;
  }
  const base = Number.isFinite(Number(value))
    ? Math.max(0, Math.min(ENERGY_CAP, Number(value)))
    : ENERGY_CAP;
  const t0 = Number.isFinite(at) ? at : nowMs;
  const seconds = Math.max(0, Math.floor((nowMs - t0) / 1000));
  const gained = Math.floor(seconds / ENERGY_SECONDS_PER_POINT);
  return Math.min(ENERGY_CAP, base + gained);
}

/** Public game fields only — never password_hash / encrypted_vault in this payload */
const PLAYER_SELECT = [
  "telegram_id",
  "username",
  "wallet_address",
  "shard_balance",
  "season_shards",
  "weekly_shards",
  "weekly_week_id",
  "lifetime_taps",
  "daily_taps",
  "last_tap_date",
  "last_energy",
  "energy_at",
  "max_unlocked_level",
  "max_daily_limit",
  "tap_power",
  "inventory",
  "current_streak",
  "sol_balance",
  "usdc_balance",
  "gft_token_balance",
  "has_beta_access",
  "limit_boost_amount",
  "limit_boost_expires",
  "frenzy_expires",
  "efficiency_expires",
  "energy_boost_expires",
  "ad_energy_boost",
  "ad_energy_expires",
  "daily_ads_watched",
  "last_ad_date",
  "last_updated",
].join(", ");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const syncChain =
      body?.sync_chain_balances === true ||
      body?.action === "sync_chain_balances";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let { data: player, error } = await supabase
      .from("players")
      .select(PLAYER_SELECT)
      .eq("telegram_id", playerId)
      .maybeSingle();

    if (error) throw error;
    if (!player) throw new Error("Player not found");

    // Lightweight: mirror chain → sol_balance (+ gft_token_balance after launch).
    // Does NOT stamp energy / last_updated (safe to call from deposit poll).
    if (syncChain) {
      const wallet = String(player.wallet_address || "").trim();
      if (!wallet || wallet.length < 32) {
        return new Response(
          JSON.stringify({
            success: true,
            synced: false,
            reason: "no_wallet",
            sol_balance: Number(player.sol_balance) || 0,
            gft_token_balance: Number(
              (player as Record<string, unknown>).gft_token_balance,
            ) || 0,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }
      const chain = await readChainBalances(wallet);
      const patch: Record<string, unknown> = {
        sol_balance: chain.sol,
      };
      if (chain.g2u != null) {
        patch.gft_token_balance = chain.g2u;
      }
      const { data: updated, error: upErr } = await supabase
        .from("players")
        .update(patch)
        .eq("telegram_id", playerId)
        .select("sol_balance, gft_token_balance, wallet_address")
        .maybeSingle();
      if (upErr) throw upErr;
      return new Response(
        JSON.stringify({
          success: true,
          synced: true,
          g2u_chain_sync: chain.g2u != null,
          sol_balance: Number(updated?.sol_balance ?? chain.sol) || 0,
          gft_token_balance:
            chain.g2u != null
              ? Number(updated?.gft_token_balance ?? chain.g2u) || 0
              : Number(
                (player as Record<string, unknown>).gft_token_balance,
              ) || 0,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // This player only on login / player-state:
    //  - If previous last_updated is a prior UTC day → new day:
    //      daily_taps = 0 + energy = 500 + max_daily_limit recomputed for today
    //    (Must NOT wait for a tap — player can already be maxed and unable to tap.)
    //  - Then stamp last_updated / energy_at = now
    try {
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const nowDate = new Date(nowMs);
      const today = utcDayStr(nowMs);
      const prevUpdatedDay = player.last_updated
        ? String(player.last_updated).slice(0, 10)
        : "";
      const isNewUtcDay = !!(prevUpdatedDay && prevUpdatedDay !== today);

      let energy: number;
      if (isNewUtcDay) {
        energy = ENERGY_CAP;
      } else {
        const energyAnchor =
          (player as Record<string, unknown>).energy_at != null
            ? String((player as Record<string, unknown>).energy_at)
            : (player.last_updated as string | null);
        energy = energyFromAnchor(
          Number(player.last_energy),
          energyAnchor,
          nowMs,
        );
      }

      const patch: Record<string, unknown> = {
        last_energy: energy,
        energy_at: nowIso,
        last_updated: nowIso,
      };
      if (isNewUtcDay) {
        patch.daily_taps = 0;
        patch.daily_shards = 0;
        patch.daily_ads_watched = 0;
        patch.last_ad_date = today;
        // Fresh cap for today (expired battery/ads/tasks drop out of effectiveDailyLimit)
        patch.max_daily_limit = effectiveDailyLimit(
          player as Record<string, unknown>,
          nowDate,
        );
      }
      const { data: touched, error: touchErr } = await supabase
        .from("players")
        .update(patch)
        .eq("telegram_id", playerId)
        .select(PLAYER_SELECT)
        .maybeSingle();
      if (!touchErr && touched) {
        player = touched;
      } else if (touchErr) {
        if (/daily_shards/i.test(String(touchErr.message || ""))) {
          delete patch.daily_shards;
          const { data: touched2, error: err2 } = await supabase
            .from("players")
            .update(patch)
            .eq("telegram_id", playerId)
            .select(PLAYER_SELECT)
            .maybeSingle();
          if (!err2 && touched2) player = touched2;
          else console.warn("login stamp", err2?.message || touchErr.message);
        } else {
          console.warn("login stamp", touchErr.message);
        }
      }
    } catch (e) {
      console.warn("login stamp", e);
    }

    // Secrets only as booleans — from player_secrets (never on players table)
    let has_password = false;
    let has_vault = false;
    try {
      const { data: sec } = await supabase
        .from("player_secrets")
        .select("password_hash, encrypted_vault")
        .eq("telegram_id", playerId)
        .maybeSingle();
      has_password = !!(sec?.password_hash && String(sec.password_hash).trim());
      const v = sec?.encrypted_vault ? String(sec.encrypted_vault).trim() : "";
      has_vault = v.length > 20 && v !== "probe";
    } catch {
      /* ignore */
    }

    let secure_economy = true;
    try {
      const { data: gs } = await supabase
        .from("game_settings")
        .select("secure_economy")
        .eq("id", 1)
        .maybeSingle();
      secure_economy = gs?.secure_economy !== false;
    } catch {
      secure_economy = true;
    }

    return new Response(
      JSON.stringify({
        success: true,
        player,
        has_password,
        has_vault,
        secure_economy: true,
        session: {
          player_id: playerId,
          username: claims.username,
          exp: claims.exp,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /authenticated|expired|signature|Invalid session/i.test(message)
      ? 401
      : 400;
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });
  }
});
