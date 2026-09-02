#!/usr/bin/env python3
"""Apply signup_ip / last_login_ip columns via Management API."""
import json
import os
import urllib.error
import urllib.request

PROJECT = "ncwlbwzxfpcnxkyrmdck"
SQL = open(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "supabase",
        "migrations",
        "20260902_signup_ip_cap.sql",
    ),
    encoding="utf-8",
).read()


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
            print(r.status, r.read().decode()[:500])
    except urllib.error.HTTPError as e:
        print(e.code, e.read().decode()[:800])
        raise SystemExit(1)


if __name__ == "__main__":
    main()
