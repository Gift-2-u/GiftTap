import fs from "fs";

const env = fs.readFileSync(".env", "utf8");
const get = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, "m"));
  if (!m) return "";
  return m[1].trim().replace(/^["']|["']$/g, "");
};
const url = (get("VITE_SUPABASE_URL") || "").replace(/\/$/, "");
const key = get("VITE_SUPABASE_ANON_KEY");
const res = await fetch(`${url}/functions/v1/grant-weekly-badges`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    apikey: key,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ week_id: "2026-W34" }),
});
const text = await res.text();
console.log(res.status, text);
