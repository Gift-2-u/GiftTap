#!/usr/bin/env python3
"""Apply abuse_blocks + ban sybil farm IP/usernames via Supabase Management API."""
import json
import os
import urllib.error
import urllib.request

PROJECT = "ncwlbwzxfpcnxkyrmdck"
IP = "39.43.220.23"
NAMES = [
    "dcbddj02",
    "ddkbsj",
    "dhdeudsb",
    "djnk7999",
    "eeodixdh",
    "fifjrif298",
    "sdjjjdhe",
    "shdbdns557",
    "shsbwhsv20",
    "siddbjej",
    "sjdjjdsj8",
    "ssamf490",
    "sshshsshdhw",
    "ssjzhdvbj",
]


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
    except Exception as e:
        return -1, str(e)


def main():
    name_sql = ",".join("'" + n + "'" for n in NAMES)
    steps = [
        "ALTER TABLE public.players ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;",
        """
CREATE TABLE IF NOT EXISTS public.abuse_blocks (
  id bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('ip', 'username', 'player_id')),
  value text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, value)
);
""",
        "CREATE INDEX IF NOT EXISTS idx_players_is_banned ON public.players (is_banned) WHERE is_banned = true;",
        "CREATE INDEX IF NOT EXISTS idx_abuse_blocks_kind_value ON public.abuse_blocks (kind, lower(value));",
        "REVOKE ALL ON TABLE public.abuse_blocks FROM PUBLIC;",
        "REVOKE ALL ON TABLE public.abuse_blocks FROM anon, authenticated;",
        "GRANT ALL ON TABLE public.abuse_blocks TO service_role;",
        "GRANT ALL ON TABLE public.abuse_blocks TO postgres;",
        f"""
INSERT INTO public.abuse_blocks (kind, value, reason)
VALUES ('ip', '{IP}', 'sybil farm 2026-09-02')
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
SELECT 'username', lower(u), 'sybil farm 2026-09-02'
FROM unnest(ARRAY[{name_sql}]::text[]) AS u
ON CONFLICT (kind, value) DO NOTHING;
""",
        f"""
INSERT INTO public.abuse_blocks (kind, value, reason)
SELECT 'player_id', p.telegram_id, 'sybil farm 2026-09-02'
FROM public.players p
WHERE lower(p.username) IN ({name_sql})
ON CONFLICT (kind, value) DO NOTHING;
""",
        f"""
DELETE FROM public.player_sessions
WHERE ip_hint = '{IP}'
   OR player_id IN (SELECT telegram_id FROM public.players WHERE is_banned = true);
""",
        "SELECT kind, value, reason FROM public.abuse_blocks ORDER BY kind, value;",
        f"""
SELECT username, is_banned, shard_balance, gft_token_balance, has_beta_access
FROM public.players
WHERE lower(username) IN ({name_sql})
ORDER BY username;
""",
    ]

    for i, sql in enumerate(steps):
        code, body = run(sql)
        print(f"--- step {i} code={code}")
        print(body[:1200])
        if code not in (200, 201) and code != 200:
            # Management API returns 201 sometimes; treat non-2xx as fail
            if not str(code).startswith("2"):
                raise SystemExit(f"step {i} failed")


if __name__ == "__main__":
    main()
