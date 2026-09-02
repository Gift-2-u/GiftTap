#!/usr/bin/env python3
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

PROJECT = "ncwlbwzxfpcnxkyrmdck"
SQL = (
    Path(__file__).resolve().parents[1]
    / "supabase/migrations/20260902_signup_ip_whitelist.sql"
).read_text(encoding="utf-8")


def main() -> None:
    token = open(os.path.expanduser("~/.supabase/access-token"), encoding="utf-8").read().strip()
    url = f"https://api.supabase.com/v1/projects/{PROJECT}/database/query"
    req = urllib.request.Request(
        url,
        data=json.dumps({"query": SQL}).encode(),
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
            "User-Agent": "gift2u-admin/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            print(r.status, r.read().decode()[:800])
    except urllib.error.HTTPError as e:
        print(e.code, e.read().decode()[:1500])
        raise SystemExit(1)

    verify = "SELECT ip, note FROM public.signup_ip_whitelist ORDER BY ip;"
    req2 = urllib.request.Request(
        url,
        data=json.dumps({"query": verify}).encode(),
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
            "User-Agent": "gift2u-admin/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req2, timeout=60) as r:
        print("whitelist", r.read().decode())


if __name__ == "__main__":
    main()
