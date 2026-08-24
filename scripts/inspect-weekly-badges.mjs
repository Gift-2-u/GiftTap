import fs from "fs";

const env = fs.readFileSync(".env", "utf8");
const get = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, "m"));
  if (!m) return "";
  return m[1].trim().replace(/^["']|["']$/g, "");
};
const url = (get("VITE_SUPABASE_URL") || get("SUPABASE_URL") || "").replace(/\/$/, "");
const key =
  get("SUPABASE_SERVICE_ROLE_KEY") || get("VITE_SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) {
  console.log("no service key");
  process.exit(1);
}

async function rest(path) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "count=exact",
    },
  });
  const range = res.headers.get("content-range");
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, range, json };
}

async function rpc(name, body = {}) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

for (const w of ["2026-W33", "2026-W34", "2026-W35"]) {
  const snaps = await rest(
    `weekly_leaderboard_snapshots?week_id=eq.${w}&select=rank,telegram_id,username,score,badge_tier&order=rank.asc&limit=15`,
  );
  const grants = await rest(
    `badge_grants?week_id=eq.${w}&select=player_id,tier,rank&limit=20`,
  );
  const ledger = await rest(
    `weekly_score_ledger?week_id=eq.${w}&select=telegram_id,username,score&order=score.desc&limit=8`,
  );
  console.log("\n===", w, "===");
  console.log("snaps", snaps.range);
  console.log(JSON.stringify(snaps.json?.slice?.(0, 10) ?? snaps.json, null, 2));
  console.log("grants", grants.range);
  console.log(JSON.stringify(grants.json?.slice?.(0, 10) ?? grants.json, null, 2));
  console.log("ledger top", ledger.range);
  console.log(JSON.stringify(ledger.json, null, 2));
}

const roll = await rpc("ensure_weekly_leaderboard_rollover");
console.log("\nrollover", JSON.stringify(roll.json, null, 2));

const g34 = await rpc("grant_weekly_badges_from_snapshot", {
  p_week_id: "2026-W34",
});
console.log("grant W34 fn", g34.status, JSON.stringify(g34.json, null, 2));
