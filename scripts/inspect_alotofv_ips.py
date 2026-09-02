#!/usr/bin/env python3
"""Inspect alotofv referral tree IPs / UAs / /24 overlap."""
from __future__ import annotations

import json
import os
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]


def load_dotenv() -> None:
    env = ROOT_DIR / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def main() -> None:
    load_dotenv()
    base = os.environ["VITE_SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": key, "Authorization": "Bearer " + key}

    root = "f1a4639c-34ba-4ff3-b9f9-c19b1d212a9a"  # alotofv
    mid = "ef6b8d75-d9b6-48c5-95fa-f4d7f05e29da"  # amir088z

    req = urllib.request.Request(
        base
        + "/rest/v1/players?select=telegram_id,username,referred_by,wallet_address,"
        "shard_balance,lifetime_taps,max_unlocked_level,is_banned,gft_token_balance,"
        "sol_balance,last_updated,last_tap_date"
        + "&or=(telegram_id.eq."
        + root
        + ",telegram_id.eq."
        + mid
        + ",referred_by.eq."
        + root
        + ",referred_by.eq."
        + mid
        + ")&order=username",
        headers=headers,
    )
    with urllib.request.urlopen(req) as r:
        tree = json.load(r)

    ids = [p["telegram_id"] for p in tree]
    name = {p["telegram_id"]: p["username"] for p in tree}
    print("TREE SIZE", len(tree))
    for p in tree:
        ref = p.get("referred_by")
        print(
            " ",
            p["username"],
            "banned=",
            p.get("is_banned"),
            "lvl=",
            p.get("max_unlocked_level"),
            "life=",
            p.get("lifetime_taps"),
            "shards=",
            p.get("shard_balance"),
            "ref=",
            name.get(ref, ref),
        )

    req2 = urllib.request.Request(
        base
        + "/rest/v1/player_sessions?select=player_id,ip_hint,user_agent,created_at"
        + "&player_id=in.("
        + ",".join(ids)
        + ")&order=created_at.desc&limit=500",
        headers=headers,
    )
    with urllib.request.urlopen(req2) as r:
        sess = json.load(r)
    print("\nSESSIONS", len(sess))

    ip_players: dict[str, set[str]] = defaultdict(set)
    ip24_players: dict[str, set[str]] = defaultdict(set)
    ua_players: dict[str, set[str]] = defaultdict(set)
    player_ips: dict[str, set[str]] = defaultdict(set)
    player_uas: dict[str, set[str]] = defaultdict(set)

    for s in sess:
        pid = s["player_id"]
        ip = s.get("ip_hint")
        ua = (s.get("user_agent") or "").strip()
        uname = name.get(pid, pid)
        if ip:
            ip_players[ip].add(uname)
            player_ips[pid].add(ip)
            parts = ip.split(".")
            if len(parts) == 4:
                ip24_players[".".join(parts[:3]) + ".0/24"].add(uname)
        if ua:
            short = ua[:90]
            ua_players[short].add(uname)
            player_uas[pid].add(short)

    print("\n=== EXACT IP SHARED BY 2+ TREE PLAYERS ===")
    shared = {ip: users for ip, users in ip_players.items() if len(users) >= 2}
    if not shared:
        print("(none)")
    else:
        for ip, users in sorted(shared.items()):
            print(ip, "=>", sorted(users))

    print("\n=== /24 SUBNETS WITH 2+ TREE PLAYERS ===")
    for net, users in sorted(ip24_players.items(), key=lambda x: -len(x[1])):
        if len(users) >= 2:
            print(net, "(%d)" % len(users), "=>", sorted(users))

    print("\n=== IDENTICAL UA SHARED BY 2+ TREE PLAYERS ===")
    for ua, users in sorted(ua_players.items(), key=lambda x: -len(x[1])):
        if len(users) >= 2:
            print("users (%d):" % len(users), sorted(users))
            print("  UA:", ua)

    print("\n=== PER-PLAYER IP + UA ===")
    for p in sorted(tree, key=lambda x: (x.get("username") or "").lower()):
        pid = p["telegram_id"]
        print(p["username"])
        print("  ips:", sorted(player_ips.get(pid, [])) or ["(no session ip)"])
        for ua in sorted(player_uas.get(pid, [])):
            print("  ua:", ua)

    print("\n=== OUTSIDE-TREE PLAYERS ON SAME EXACT IPS ===")
    outside_hits = 0
    for ip in sorted(ip_players.keys()):
        req = urllib.request.Request(
            base
            + "/rest/v1/player_sessions?select=player_id,ip_hint,created_at"
            + "&ip_hint=eq."
            + ip
            + "&limit=100",
            headers=headers,
        )
        with urllib.request.urlopen(req) as r:
            rows = json.load(r)
        other_ids = sorted(set(s["player_id"] for s in rows) - set(ids))
        if not other_ids:
            continue
        outside_hits += 1
        reqp = urllib.request.Request(
            base
            + "/rest/v1/players?select=telegram_id,username,is_banned,referred_by,lifetime_taps"
            + "&telegram_id=in.("
            + ",".join(other_ids)
            + ")",
            headers=headers,
        )
        with urllib.request.urlopen(reqp) as r:
            others = json.load(r)
        print(
            ip,
            "tree=",
            sorted(ip_players[ip]),
            "OUTSIDE=",
            [(o["username"], "banned=" + str(o.get("is_banned"))) for o in others],
        )
    if outside_hits == 0:
        print("(no outside players on these exact IPs)")

    print("\n=== FULL /24 SCAN for multi-player nets in tree ===")
    multi_nets = [net for net, users in ip24_players.items() if len(users) >= 2]
    idset = set(ids)
    for net in multi_nets:
        prefix = net.replace(".0/24", ".")
        req = urllib.request.Request(
            base
            + "/rest/v1/player_sessions?select=player_id,ip_hint,user_agent,created_at"
            + "&ip_hint=like."
            + prefix
            + "*&order=created_at.desc&limit=200",
            headers=headers,
        )
        with urllib.request.urlopen(req) as r:
            rows = json.load(r)
        pids2 = sorted(set(s["player_id"] for s in rows))
        if not pids2:
            continue
        reqp = urllib.request.Request(
            base
            + "/rest/v1/players?select=telegram_id,username,is_banned,referred_by,lifetime_taps"
            + "&telegram_id=in.("
            + ",".join(pids2)
            + ")",
            headers=headers,
        )
        with urllib.request.urlopen(reqp) as r:
            ps = json.load(r)
        print(net, "total players on /24:", len(ps))
        for p in sorted(ps, key=lambda x: (x.get("username") or "").lower()):
            tag = "TREE" if p["telegram_id"] in idset else "out"
            print(
                " ",
                tag,
                p["username"],
                "banned=",
                p.get("is_banned"),
                "life=",
                p.get("lifetime_taps"),
                "ref=",
                name.get(p.get("referred_by"), p.get("referred_by")),
            )

    print("\n=== IP GEO/ORG (ip-api) ===")
    for ip in sorted(ip_players.keys()):
        try:
            req = urllib.request.Request(
                "http://ip-api.com/json/"
                + ip
                + "?fields=status,country,regionName,city,isp,org,as,proxy,hosting,query",
                headers={"User-Agent": "gift2u"},
            )
            with urllib.request.urlopen(req, timeout=12) as r:
                info = json.load(r)
            print(
                ip,
                "=>",
                info.get("country"),
                info.get("city"),
                "|",
                info.get("isp"),
                "|",
                info.get("org"),
                "|",
                info.get("as"),
                "| proxy=",
                info.get("proxy"),
                "hosting=",
                info.get("hosting"),
                "| users=",
                sorted(ip_players[ip]),
            )
        except Exception as e:
            print(ip, "lookup fail", e)


if __name__ == "__main__":
    main()
