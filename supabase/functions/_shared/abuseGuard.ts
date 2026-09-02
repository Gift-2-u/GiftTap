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
