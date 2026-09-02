#!/usr/bin/env python3
"""
List / decrypt / restore ban archives from admin_archives/bans/ (off Supabase).

Usage:
  python3 scripts/unban_restore.py --list
  python3 scripts/unban_restore.py --show <batch_id>
  python3 scripts/unban_restore.py --restore <batch_id> --yes
  python3 scripts/unban_restore.py --restore <batch_id> --keep-banned   # restore balances, stay banned
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ban_archive_lib import (  # noqa: E402
    BANS_ROOT,
    decrypt_json,
    list_batches,
)

# Columns we put back on players (skip identity secrets / vault)
RESTORE_KEYS = [
    "username",
    "shard_balance",
    "season_shards",
    "weekly_shards",
    "weekly_week_id",
    "lifetime_taps",
    "daily_taps",
    "last_tap_date",
    "current_streak",
    "sol_balance",
    "usdc_balance",
    "gft_token_balance",
    "max_unlocked_level",
    "max_daily_limit",
    "tap_power",
    "energy_level",
    "last_energy",
    "energy_at",
    "inventory",
    "daily_usage",
    "completed_tasks",
    "premium_multiplier",
    "premium_multiplier_expires",
    "limit_boost_amount",
    "limit_boost_expires",
    "frenzy_expires",
    "efficiency_expires",
    "energy_boost_expires",
    "bot_expires",
    "ad_energy_boost",
    "ad_energy_expires",
    "daily_ads_watched",
    "last_ad_date",
    "last_daily_claim",
    "has_beta_access",
    "has_made_purchase",
    "is_banned",
]


def show(batch_id: str) -> None:
    batch = BANS_ROOT / batch_id
    manifest = decrypt_json(batch / "manifest.json.enc")
    snap = decrypt_json(batch / "snapshot.json.enc")
    print(json.dumps(manifest, indent=2))
    print("--- players ---")
    for p in snap.get("players") or []:
        print(
            p.get("username"),
            "id=",
            p.get("telegram_id"),
            "shards=",
            p.get("shard_balance"),
            "gft=",
            p.get("gft_token_balance"),
            "life=",
            p.get("lifetime_taps"),
            "lvl=",
            p.get("max_unlocked_level"),
        )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--show", metavar="BATCH_ID")
    ap.add_argument("--restore", metavar="BATCH_ID")
    ap.add_argument(
        "--keep-banned",
        action="store_true",
        help="Restore economy but leave is_banned / abuse_blocks",
    )
    ap.add_argument("--yes", action="store_true")
    args = ap.parse_args()

    if args.list:
        batches = list_batches()
        if not batches:
            print("(no archives yet)")
            return
        for b in batches:
            idx = b / "INDEX.txt"
            print(b.name)
            if idx.exists():
                print(" ", idx.read_text(encoding="utf-8").strip().replace("\n", " | "))
        return

    if args.show:
        show(args.show)
        return

    if args.restore:
        if not args.yes:
            ok = input(
                f"Restore archive {args.restore} into live Supabase? [y/N] "
            ).strip().lower()
            if ok != "y":
                raise SystemExit("aborted")
        # monkey-patch restore to use RESTORE_KEYS only via wrapper
        from ban_archive_lib import rest_patch  # noqa: WPS433
        import urllib.parse
        from ban_archive_lib import decrypt_json as dec
        from ban_archive_lib import sql as run_sql

        batch_dir = BANS_ROOT / args.restore
        snap = dec(batch_dir / "snapshot.json.enc")
        players = snap.get("players") or []
        unban = not args.keep_banned
        for p in players:
            tid = p.get("telegram_id")
            if not tid:
                continue
            body = {k: p.get(k) for k in RESTORE_KEYS if k in p}
            if unban:
                body["is_banned"] = False
            else:
                body["is_banned"] = True
            rest_patch(
                "players",
                f"telegram_id=eq.{urllib.parse.quote(str(tid))}",
                body,
            )
            print("restored", p.get("username"))
        if unban:
            names = [
                str(p.get("username") or "").lower()
                for p in players
                if p.get("username")
            ]
            ids = [str(p["telegram_id"]) for p in players if p.get("telegram_id")]
            if names:
                name_sql = ",".join("'" + n.replace("'", "''") + "'" for n in names)
                run_sql(
                    f"DELETE FROM public.abuse_blocks WHERE kind='username' AND value IN ({name_sql});"
                )
            if ids:
                id_sql = ",".join("'" + i.replace("'", "''") + "'" for i in ids)
                run_sql(
                    f"DELETE FROM public.abuse_blocks WHERE kind='player_id' AND value IN ({id_sql});"
                )
            print("cleared username/player_id blocks (IP blocks kept)")
        print("done")
        return

    ap.print_help()


if __name__ == "__main__":
    main()
