#!/usr/bin/env python3
"""Ban linked sybil accounts (same operator as 39.43.220.23 farm)."""
import json
import os
import urllib.error
import urllib.request

PROJECT = "ncwlbwzxfpcnxkyrmdck"
NAMES = ["sjdfjde", "shszhd240", "khnjigss", "sjswjsh8"]
IPS = ["119.156.243.3", "39.61.53.19", "182.177.91.134"]
REASON = "sybil farm linked 2026-09-02 (same operator as 39.43.220.23)"


def run(sql: str):
    token = open(os.path.expanduser("~/.supabase/access-token")).read().strip()
    url = f"https://api.supabase.com/v1/projects/{PROJECT}/database/query"
    req = urllib.request.Request(
        url,
        data=json.dumps({"query": sql}).encode(),
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
            "User-Agent": "gift2u-admin/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def main():
    name_sql = ",".join("'" + n + "'" for n in NAMES)
    ip_sql = ",".join("'" + ip + "'" for ip in IPS)
    ip_values = ",".join(f"('ip', '{ip}', '{REASON}')" for ip in IPS)

    steps = [
        f"""
INSERT INTO public.abuse_blocks (kind, value, reason)
VALUES {ip_values}
ON CONFLICT (kind, value) DO UPDATE SET reason = EXCLUDED.reason;
""",
        f"""
UPDATE public.players SET
  is_banned = true,
  has_beta_access = false,
  shard_balance = 0,
  season_shards = 0,
  weekly_shards = 0,
  daily_taps = 0,
  gft_token_balance = 0,
  lifetime_taps = 0,
  max_unlocked_level = 0,
  inventory = '{{}}'::jsonb,
  completed_tasks = '[]'::jsonb,
  daily_usage = '{{}}'::jsonb,
  premium_multiplier = 1,
  premium_multiplier_expires = NULL,
  limit_boost_amount = 0,
  limit_boost_expires = NULL,
  frenzy_expires = NULL,
  efficiency_expires = NULL,
  energy_boost_expires = NULL,
  last_updated = now()
WHERE lower(username) IN ({name_sql});
""",
        f"""
INSERT INTO public.abuse_blocks (kind, value, reason)
SELECT 'username', lower(u), '{REASON}'
FROM unnest(ARRAY[{name_sql}]::text[]) AS u
ON CONFLICT (kind, value) DO NOTHING;
""",
        f"""
INSERT INTO public.abuse_blocks (kind, value, reason)
SELECT 'player_id', p.telegram_id, '{REASON}'
FROM public.players p
WHERE lower(p.username) IN ({name_sql})
ON CONFLICT (kind, value) DO NOTHING;
""",
        f"""
DELETE FROM public.player_sessions
WHERE ip_hint IN ({ip_sql})
   OR player_id IN (
     SELECT telegram_id FROM public.players WHERE lower(username) IN ({name_sql})
   );
""",
        f"""
SELECT username, is_banned, shard_balance, gft_token_balance, has_beta_access
FROM public.players
WHERE lower(username) IN ({name_sql})
ORDER BY username;
""",
        f"""
SELECT kind, value FROM public.abuse_blocks
WHERE kind = 'ip' AND value IN ({ip_sql})
ORDER BY value;
""",
    ]

    for i, sql in enumerate(steps):
        code, body = run(sql)
        print(f"--- step {i} code={code}")
        print(body[:1200])
        if not str(code).startswith("2"):
            raise SystemExit(f"failed at step {i}")
    print("DONE")


if __name__ == "__main__":
    main()
