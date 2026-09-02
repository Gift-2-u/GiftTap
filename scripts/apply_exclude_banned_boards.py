#!/usr/bin/env python3
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

PROJECT = "ncwlbwzxfpcnxkyrmdck"
ROOT = Path(__file__).resolve().parents[1]
SQL = (ROOT / "supabase/migrations/20260902_exclude_banned_from_leaderboards.sql").read_text(
    encoding="utf-8"
)


def run(query: str) -> tuple[int, str]:
    token = open(os.path.expanduser("~/.supabase/access-token"), encoding="utf-8").read().strip()
    url = f"https://api.supabase.com/v1/projects/{PROJECT}/database/query"
    req = urllib.request.Request(
        url,
        data=json.dumps({"query": query}).encode(),
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
            "User-Agent": "gift2u-admin/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def main() -> None:
    code, body = run(SQL)
    print("apply", code, body[:800])
    if not str(code).startswith("2"):
        raise SystemExit(1)

    verify = """
SELECT 'season' AS board, count(*)::int AS banned_on_board
FROM public.leaderboard_season s
JOIN public.players p ON p.telegram_id::text = s.telegram_id
WHERE COALESCE(p.is_banned, false) = true
UNION ALL
SELECT 'all_time', count(*)::int
FROM public.leaderboard_all_time s
JOIN public.players p ON p.telegram_id::text = s.telegram_id
WHERE COALESCE(p.is_banned, false) = true
UNION ALL
SELECT 'weekly', count(*)::int
FROM public.leaderboard_weekly s
JOIN public.players p ON p.telegram_id::text = s.telegram_id
WHERE COALESCE(p.is_banned, false) = true;

SELECT count(*) AS banned_players FROM public.players WHERE is_banned = true;
"""
    code2, body2 = run(verify)
    print("verify", code2, body2[:2000])
    if not str(code2).startswith("2"):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
