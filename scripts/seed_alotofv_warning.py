#!/usr/bin/env python3
"""Seed multi-account warning notices for the alotofv referral tree (14 accounts)."""
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

PROJECT = "ncwlbwzxfpcnxkyrmdck"
ROOT = Path(__file__).resolve().parents[1]

USERNAMES = [
    "alotofv",
    "aamir088z",
    "alimm",
    "amir088z",
    "Amirmp",
    "amoosaeed",
    "azimsediqi",
    "Bahlool55",
    "esi321",
    "HadiAD",
    "negin",
    "Poco",
    "soli23",
    "Z21x",
]

TITLE = "Account warning"
MESSAGE = (
    "One account per player.\n\n"
    "We detected multiple accounts linked to the same network / referral group.\n\n"
    "If you continue playing on more than one account, ALL of those accounts will be banned."
)
KIND = "multi_account_warning"


def load_dotenv() -> None:
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def sql(query: str) -> tuple[int, str]:
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
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def main() -> None:
    load_dotenv()
    schema = (ROOT / "supabase/migrations/20260902_player_notices.sql").read_text(
        encoding="utf-8"
    )
    code, body = sql(schema)
    print("schema", code, body[:300])
    if not str(code).startswith("2"):
        raise SystemExit("schema failed")

    name_sql = ",".join("'" + n.lower().replace("'", "''") + "'" for n in USERNAMES)
    msg = MESSAGE.replace("'", "''")
    title = TITLE.replace("'", "''")

    q = f"""
UPDATE public.player_notices n
SET active = false, updated_at = now()
WHERE n.active = true
  AND n.kind = '{KIND}'
  AND n.player_id IN (
    SELECT telegram_id FROM public.players
    WHERE lower(username) IN ({name_sql})
  );

INSERT INTO public.player_notices (player_id, kind, title, message, active)
SELECT p.telegram_id, '{KIND}', '{title}', '{msg}', true
FROM public.players p
WHERE lower(p.username) IN ({name_sql});

SELECT p.username, n.id, n.active
FROM public.player_notices n
JOIN public.players p ON p.telegram_id = n.player_id
WHERE n.kind = '{KIND}' AND n.active = true
ORDER BY p.username;
"""
    code, body = sql(q)
    print("seed", code)
    print(body[:2500])
    if not str(code).startswith("2"):
        raise SystemExit(1)
    print("DONE — notices active for alotofv tree")


if __name__ == "__main__":
    main()
