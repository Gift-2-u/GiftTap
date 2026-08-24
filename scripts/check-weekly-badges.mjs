import fs from "fs";

const env = fs.readFileSync(".env", "utf8");
const get = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, "m"));
  if (!m) return "";
  return m[1].trim().replace(/^["']|["']$/g, "");
};
const url = (get("VITE_SUPABASE_URL") || get("SUPABASE_URL") || "").replace(
  /\/$/,
  "",
);
const key = get("VITE_SUPABASE_ANON_KEY") || get("SUPABASE_ANON_KEY");
if (!url || !key) {
  console.log("missing url/key");
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
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { ok: res.ok, status: res.status, range, json };
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
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { ok: res.ok, status: res.status, json };
}

for (const w of ["2026-W33", "2026-W34", "2026-W35"]) {
  const snaps = await rest(
    `weekly_leaderboard_snapshots?week_id=eq.${w}&select=week_id`,
  );
  const ledger = await rest(
    `weekly_score_ledger?week_id=eq.${w}&select=week_id`,
  );
  console.log(
    w,
    "snaps",
    snaps.status,
    snaps.range,
    "ledger",
    ledger.status,
    ledger.range,
  );
}

const meta = await rest(
  "weekly_season_meta?select=week_id,snap_rows,snapped_at,notes&order=week_id.desc&limit=8",
);
console.log("meta", meta.status, JSON.stringify(meta.json, null, 2));

const roll = await rpc("ensure_weekly_leaderboard_rollover");
console.log("rollover", roll.status, JSON.stringify(roll.json, null, 2));

for (const w of ["2026-W33", "2026-W34", "2026-W35"]) {
  const snaps = await rest(
    `weekly_leaderboard_snapshots?week_id=eq.${w}&select=week_id`,
  );
  console.log("after", w, "snaps", snaps.range);
}
