/**
 * IP + account abuse blocks (sybil / farm bans).
 * Table: public.abuse_blocks (kind: ip | username | player_id)
 * Column: players.is_banned
 */
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

export function clientIpHint(req: Request): string | null {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf.slice(0, 64);
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  return null;
}

function admin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

const BLOCKED_MSG = "Account suspended.";

/** Throw if IP is on abuse_blocks. */
export async function assertIpAllowed(
  req: Request,
  sb?: SupabaseClient,
): Promise<void> {
  const ip = clientIpHint(req);
  if (!ip) return;
  const client = sb || admin();
  const { data, error } = await client
    .from("abuse_blocks")
    .select("id")
    .eq("kind", "ip")
    .eq("value", ip)
    .maybeSingle();
  if (error) throw error;
  if (data) throw new Error(BLOCKED_MSG);
}

/** Throw if username is blocked (case-insensitive). */
export async function assertUsernameAllowed(
  username: string,
  sb?: SupabaseClient,
): Promise<void> {
  const name = String(username || "").trim().toLowerCase();
  if (!name) return;
  const client = sb || admin();
  const { data, error } = await client
    .from("abuse_blocks")
    .select("id")
    .eq("kind", "username")
    .eq("value", name)
    .maybeSingle();
  if (error) throw error;
  if (data) throw new Error(BLOCKED_MSG);
}

/** Throw if player_id is banned (abuse_blocks or players.is_banned). */
export async function assertPlayerAllowed(
  playerId: string,
  sb?: SupabaseClient,
): Promise<void> {
  const id = String(playerId || "").trim();
  if (!id) return;
  const client = sb || admin();

  const { data: block, error: blockErr } = await client
    .from("abuse_blocks")
    .select("id")
    .eq("kind", "player_id")
    .eq("value", id)
    .maybeSingle();
  if (blockErr) throw blockErr;
  if (block) throw new Error(BLOCKED_MSG);

  const { data: row, error: rowErr } = await client
    .from("players")
    .select("is_banned")
    .eq("telegram_id", id)
    .maybeSingle();
  if (rowErr) throw rowErr;
  if (row && (row as { is_banned?: boolean }).is_banned === true) {
    throw new Error(BLOCKED_MSG);
  }
}

/** Login/register gate: IP + username. */
export async function assertAuthAllowed(
  req: Request,
  username: string,
  sb?: SupabaseClient,
): Promise<void> {
  const client = sb || admin();
  await assertIpAllowed(req, client);
  await assertUsernameAllowed(username, client);
}

/** Default max accounts that may be created from one IP (override: MAX_ACCOUNTS_PER_IP). */
export function maxAccountsPerIp(): number {
  const n = Number(Deno.env.get("MAX_ACCOUNTS_PER_IP") || "3");
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.min(20, Math.floor(n));
}

/**
 * Signup-only: reject if this IP already has >= MAX accounts.
 * Counts:
 *  1) players.signup_ip = ip
 *  2) distinct player_id in player_sessions with ip_hint = ip (legacy / extra signal)
 * Uses the larger of the two so farms can't dodge by missing signup_ip.
 */
export async function assertSignupIpCap(
  req: Request,
  sb?: SupabaseClient,
): Promise<string> {
  const ip = clientIpHint(req);
  if (!ip) {
    throw new Error(
      "Could not verify your network. Disable VPN/proxy and try again.",
    );
  }
  const client = sb || admin();
  const max = maxAccountsPerIp();

  // Owner / trusted IPs: skip the per-IP signup cap
  try {
    const { data: allow } = await client
      .from("signup_ip_whitelist")
      .select("ip")
      .eq("ip", ip)
      .maybeSingle();
    if (allow) return ip;
  } catch (e) {
    console.warn("signup_ip_whitelist lookup", e);
  }
  // Env fallback: SIGNUP_IP_WHITELIST=1.2.3.4,5.6.7.8
  const envAllow = String(Deno.env.get("SIGNUP_IP_WHITELIST") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (envAllow.includes(ip)) return ip;

  // Count accounts that signed up on this IP, or whose latest ip matches
  const { count: signupCount, error: cErr } = await client
    .from("players")
    .select("telegram_id", { count: "exact", head: true })
    .or(`signup_ip.eq.${ip},ip.eq.${ip}`);
  if (cErr) throw cErr;

  let sessionDistinct = 0;
  try {
    const { data: sess, error: sErr } = await client
      .from("player_sessions")
      .select("player_id")
      .eq("ip_hint", ip)
      .limit(500);
    if (sErr) throw sErr;
    sessionDistinct = new Set(
      (sess || []).map((r) => String((r as { player_id?: string }).player_id || ""))
        .filter(Boolean),
    ).size;
  } catch (e) {
    console.warn("signup ip session count", e);
  }

  const used = Math.max(Number(signupCount) || 0, sessionDistinct);
  if (used >= max) {
    throw new Error(
      "Too many accounts from this network. Please log in to an existing account.",
    );
  }
  return ip;
}
