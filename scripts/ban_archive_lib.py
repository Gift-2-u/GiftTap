#!/usr/bin/env python3
"""
Local (off-Supabase) ban archives.

Snapshots live under admin_archives/bans/<batch_id>/ as Fernet-encrypted JSON.
The folder is gitignored — never push archives to git or store them in Supabase.

Env / secrets used:
  VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env (live reads/writes)
  ~/.supabase/access-token (optional SQL via Management API)
  admin_archives/.fernet_key (auto-created once)
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet

PROJECT = "ncwlbwzxfpcnxkyrmdck"
ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_ROOT = ROOT / "admin_archives"
BANS_ROOT = ARCHIVE_ROOT / "bans"
KEY_PATH = ARCHIVE_ROOT / ".fernet_key"

# Economy wipe applied on live players after snapshot
WIPE_PATCH = {
    "is_banned": True,
    "has_beta_access": False,
    "shard_balance": 0,
    "season_shards": 0,
    "weekly_shards": 0,
    "daily_taps": 0,
    "gft_token_balance": 0,
    "lifetime_taps": 0,
    "max_unlocked_level": 0,
    "inventory": {},
    "completed_tasks": [],
    "daily_usage": {},
    "premium_multiplier": 1,
    "premium_multiplier_expires": None,
    "limit_boost_amount": 0,
    "limit_boost_expires": None,
    "frenzy_expires": None,
    "efficiency_expires": None,
    "energy_boost_expires": None,
}


def _load_dotenv() -> None:
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def rest_headers() -> dict[str, str]:
    _load_dotenv()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not key:
        raise SystemExit("SUPABASE_SERVICE_ROLE_KEY missing in .env")
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def rest_base() -> str:
    _load_dotenv()
    url = (os.environ.get("VITE_SUPABASE_URL") or "").rstrip("/")
    if not url:
        raise SystemExit("VITE_SUPABASE_URL missing in .env")
    return url


def rest_get(path_qs: str) -> Any:
    req = urllib.request.Request(
        f"{rest_base()}/rest/v1/{path_qs}",
        headers=rest_headers(),
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def rest_patch(table: str, query: str, body: dict) -> Any:
    req = urllib.request.Request(
        f"{rest_base()}/rest/v1/{table}?{query}",
        data=json.dumps(body).encode(),
        headers=rest_headers(),
        method="PATCH",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def sql(query: str) -> tuple[int, str]:
    token_path = Path.home() / ".supabase" / "access-token"
    token = token_path.read_text(encoding="utf-8").strip()
    api = f"https://api.supabase.com/v1/projects/{PROJECT}/database/query"
    req = urllib.request.Request(
        api,
        data=json.dumps({"query": query}).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "gift2u-ban-archive/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def ensure_key() -> Fernet:
    ARCHIVE_ROOT.mkdir(parents=True, exist_ok=True)
    BANS_ROOT.mkdir(parents=True, exist_ok=True)
    if not KEY_PATH.exists():
        KEY_PATH.write_bytes(Fernet.generate_key())
        KEY_PATH.chmod(0o600)
        print(f"created {KEY_PATH} (keep this secret — needed to decrypt archives)")
    return Fernet(KEY_PATH.read_bytes().strip())


def encrypt_json(obj: Any, dest: Path) -> None:
    f = ensure_key()
    raw = json.dumps(obj, indent=2, default=str).encode("utf-8")
    dest.write_bytes(f.encrypt(raw))
    dest.chmod(0o600)


def decrypt_json(src: Path) -> Any:
    f = ensure_key()
    return json.loads(f.decrypt(src.read_bytes()).decode("utf-8"))


def slugify(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9_-]+", "-", s.strip().lower())
    return s.strip("-")[:48] or "batch"


def fetch_players_by_usernames(names: list[str]) -> list[dict]:
    if not names:
        return []
    # PostgREST in.() needs quoted values for uuids/text
    q = ",".join(names)
    # select * — omit secrets table
    return rest_get(
        "players?select=*&username=in.("
        + q
        + ")"
    )


def fetch_sessions(player_ids: list[str]) -> list[dict]:
    if not player_ids:
        return []
    q = ",".join(player_ids)
    return rest_get(
        f"player_sessions?select=*&player_id=in.({q})&order=created_at.desc&limit=500"
    )


def snapshot_batch(
    names: list[str],
    ips: list[str] | None = None,
    reason: str = "",
    label: str = "",
) -> Path:
    """Write encrypted archive ONLY — does not ban yet."""
    names = [n.strip() for n in names if n and n.strip()]
    ips = [ip.strip() for ip in (ips or []) if ip and ip.strip()]
    players = fetch_players_by_usernames(names)
    found = {str(p.get("username") or "").lower(): p for p in players}
    missing = [n for n in names if n.lower() not in found]
    if missing:
        print("WARN missing usernames:", ", ".join(missing))

    ids = [str(p["telegram_id"]) for p in players]
    sessions = fetch_sessions(ids)

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    batch_id = f"{ts}_{slugify(label or reason or 'ban')}"
    batch_dir = BANS_ROOT / batch_id
    batch_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        "batch_id": batch_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "reason": reason,
        "label": label,
        "usernames": names,
        "ips": ips,
        "player_ids": ids,
        "missing_usernames": missing,
        "note": "Encrypted snapshots — not stored in Supabase. Restore with scripts/unban_restore.py",
    }
    encrypt_json(manifest, batch_dir / "manifest.json.enc")
    encrypt_json(
        {"players": players, "sessions": sessions},
        batch_dir / "snapshot.json.enc",
    )
    # tiny plaintext index for humans (no balances)
    (batch_dir / "INDEX.txt").write_text(
        "\n".join(
            [
                f"batch_id: {batch_id}",
                f"reason: {reason}",
                f"usernames: {', '.join(names)}",
                f"ips: {', '.join(ips)}",
                f"archived_players: {len(players)}",
                f"missing: {', '.join(missing) or '(none)'}",
                "decrypt: scripts/unban_restore.py --list / --restore <batch_id>",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"archived → {batch_dir} ({len(players)} players)")
    return batch_dir


def apply_ban_after_archive(
    names: list[str],
    ips: list[str] | None = None,
    reason: str = "",
) -> None:
    """Ban + wipe live rows and insert abuse_blocks. Call AFTER snapshot_batch."""
    names = [n.strip().lower() for n in names if n and n.strip()]
    ips = [ip.strip() for ip in (ips or []) if ip and ip.strip()]
    reason_sql = reason.replace("'", "''") or "banned"
    name_sql = ",".join("'" + n.replace("'", "''") + "'" for n in names)

    # Prefer SQL for abuse_blocks + wipe + session delete (atomic-ish)
    steps = []
    if ips:
        ip_values = ",".join(
            f"('ip', '{ip.replace(chr(39), chr(39)*2)}', '{reason_sql}')" for ip in ips
        )
        steps.append(
            f"""
INSERT INTO public.abuse_blocks (kind, value, reason)
VALUES {ip_values}
ON CONFLICT (kind, value) DO UPDATE SET reason = EXCLUDED.reason;
"""
        )

    if names:
        steps.append(
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
"""
        )
        steps.append(
            f"""
INSERT INTO public.abuse_blocks (kind, value, reason)
SELECT 'username', lower(u), '{reason_sql}'
FROM unnest(ARRAY[{name_sql}]::text[]) AS u
ON CONFLICT (kind, value) DO NOTHING;
"""
        )
        steps.append(
            f"""
INSERT INTO public.abuse_blocks (kind, value, reason)
SELECT 'player_id', p.telegram_id, '{reason_sql}'
FROM public.players p
WHERE lower(p.username) IN ({name_sql})
ON CONFLICT (kind, value) DO NOTHING;
"""
        )
        ip_clause = ""
        if ips:
            ip_sql = ",".join("'" + ip.replace("'", "''") + "'" for ip in ips)
            ip_clause = f" OR ip_hint IN ({ip_sql})"
        steps.append(
            f"""
DELETE FROM public.player_sessions
WHERE player_id IN (
  SELECT telegram_id FROM public.players WHERE lower(username) IN ({name_sql})
){ip_clause};
"""
        )

    for i, q in enumerate(steps):
        code, body = sql(q)
        print(f"ban step {i} → {code}")
        if not str(code).startswith("2"):
            raise SystemExit(f"ban SQL failed: {body[:500]}")


def list_batches() -> list[Path]:
    ensure_key()
    if not BANS_ROOT.exists():
        return []
    return sorted([p for p in BANS_ROOT.iterdir() if p.is_dir()], reverse=True)


def restore_batch(batch_id: str, unban: bool = True) -> None:
    """Restore player economy from encrypted snapshot. Prefer scripts/unban_restore.py CLI."""
    raise SystemExit("Use: python3 scripts/unban_restore.py --restore <batch_id> --yes")