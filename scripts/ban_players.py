#!/usr/bin/env python3
"""
Ban players safely: encrypt snapshot locally FIRST, then wipe + block on Supabase.

Usage:
  python3 scripts/ban_players.py --names a,b,c --ips 1.2.3.4 --reason "sybil" --label farm3
  python3 scripts/ban_players.py --names a,b --dry-run          # archive only, no ban
  python3 scripts/ban_players.py --names a --yes               # skip confirm

Archives: admin_archives/bans/<batch_id>/  (gitignored, Fernet-encrypted)
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ban_archive_lib import apply_ban_after_archive, snapshot_batch  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description="Archive locally, then ban+wipe on Supabase")
    ap.add_argument("--names", required=True, help="Comma-separated usernames")
    ap.add_argument("--ips", default="", help="Comma-separated IPs to block")
    ap.add_argument("--reason", default="manual ban", help="Stored in abuse_blocks + archive")
    ap.add_argument("--label", default="", help="Short folder label")
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Only write encrypted archive — do not ban/wipe",
    )
    ap.add_argument("--yes", action="store_true", help="Skip confirmation")
    args = ap.parse_args()

    names = [x.strip() for x in args.names.split(",") if x.strip()]
    ips = [x.strip() for x in args.ips.split(",") if x.strip()]
    if not names:
        raise SystemExit("no usernames")

    print("Will archive:", ", ".join(names))
    if ips:
        print("Will block IPs:", ", ".join(ips))
    print("Reason:", args.reason)
    if args.dry_run:
        print("DRY-RUN: archive only")
    elif not args.yes:
        ok = input("Snapshot then ban+wipe live DB? [y/N] ").strip().lower()
        if ok != "y":
            raise SystemExit("aborted")

    batch_dir = snapshot_batch(
        names=names,
        ips=ips,
        reason=args.reason,
        label=args.label or "ban",
    )
    print("archive ok:", batch_dir)

    if args.dry_run:
        print("done (no ban)")
        return

    apply_ban_after_archive(names=names, ips=ips, reason=args.reason)
    print("ban+wipe applied. Restore later with:")
    print(f"  python3 scripts/unban_restore.py --restore {batch_dir.name}")


if __name__ == "__main__":
    main()
