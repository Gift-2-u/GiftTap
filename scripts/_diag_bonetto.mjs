import fs from "fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  const out = {};
  if (!fs.existsSync(path)) return out;
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const root = "/home/tower/gift_memecoin";
const env = {
  ...loadEnv(`${root}/.env`),
  ...loadEnv(`${root}/.env.local`),
};
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key =
  env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("NO_SERVICE_KEY", { hasUrl: !!url, hasKey: !!key });
  process.exit(0);
}
const sb = createClient(url, key);
const { data, error } = await sb
  .from("players")
  .select(
    "telegram_id, username, shard_balance, lifetime_taps, daily_taps, last_energy, last_updated, last_tap_date, max_daily_limit, max_unlocked_level, frenzy_expires, efficiency_expires, inventory",
  )
  .ilike("username", "%Bonetto%")
  .limit(5);
if (error) {
  console.log("ERR", error.message);
  process.exit(1);
}
if (!data?.length) {
  console.log("NO_MATCH");
  process.exit(0);
}
const now = Date.now();
for (const p of data) {
  const inv = p.inventory && typeof p.inventory === "object" ? p.inventory : {};
  const energyAt = p.last_updated ? Date.parse(p.last_updated) : NaN;
  const seconds = Number.isFinite(energyAt)
    ? Math.max(0, Math.floor((now - energyAt) / 1000))
    : 0;
  const regen = Math.min(
    500,
    (Number(p.last_energy) || 0) + Math.floor(seconds / 1.5),
  );
  console.log(
    JSON.stringify(
      {
        id_tail: String(p.telegram_id).slice(-6),
        username: p.username,
        shard_balance: p.shard_balance,
        lifetime_taps: p.lifetime_taps,
        daily_taps: p.daily_taps,
        last_energy_stored: p.last_energy,
        energy_if_regen_now: regen,
        last_tap_date: p.last_tap_date,
        last_updated: p.last_updated,
        max_daily_limit: p.max_daily_limit,
        max_unlocked_level: p.max_unlocked_level,
        frenzy_on: !!(
          p.frenzy_expires && new Date(p.frenzy_expires).getTime() > now
        ),
        heavy_on: !!(
          p.efficiency_expires &&
          new Date(p.efficiency_expires).getTime() > now
        ),
        rush_active: inv.rush_active || null,
        echo_active: inv.echo_active
          ? {
              rarity: inv.echo_active.rarity,
              level: inv.echo_active.level,
              multi: inv.echo_active.multi,
            }
          : null,
      },
      null,
      2,
    ),
  );
}

// recent economy logs if table exists
const id = data[0].telegram_id;
const { data: logs, error: logErr } = await sb
  .from("economy_ledger")
  .select("kind, delta, balance_after, created_at, meta")
  .eq("player_id", id)
  .order("created_at", { ascending: false })
  .limit(8);
if (logErr) {
  console.log("ledger_err", logErr.message);
} else {
  console.log(
    "recent_ledger",
    (logs || []).map((l) => ({
      kind: l.kind,
      delta: l.delta,
      bal: l.balance_after,
      at: l.created_at,
      taps: l.meta?.taps,
      reason: l.meta?.reason,
    })),
  );
}
