# Ban archives (off Supabase)

When we ban someone we **wipe** live `players` rows so cheats can’t spend phantom balances.  
To stay reversible, we now **snapshot first** to this machine only:

```
admin_archives/          # gitignored — never commit
  .fernet_key            # decrypt key (secret)
  bans/<batch_id>/
    INDEX.txt            # human index (no balances)
    manifest.json.enc    # encrypted metadata
    snapshot.json.enc    # encrypted full player rows + sessions
```

Nothing from the archive is written back into Supabase unless you run restore.

## Ban (archive → wipe)

```bash
cd /home/tower/gift_memecoin
python3 scripts/ban_players.py \
  --names user1,user2 \
  --ips 1.2.3.4 \
  --reason "sybil farm" \
  --label farm3 \
  --yes
```

Dry-run (archive only):

```bash
python3 scripts/ban_players.py --names user1 --dry-run
```

## List / inspect / restore

```bash
python3 scripts/unban_restore.py --list
python3 scripts/unban_restore.py --show <batch_id>
python3 scripts/unban_restore.py --restore <batch_id> --yes
# restore balances but keep banned:
python3 scripts/unban_restore.py --restore <batch_id> --keep-banned --yes
```

## Important

- **Already banned before this tool** (first 14 + second 4) were wiped **without** an archive. Those balances are gone unless Supabase PITR/backup has them.
- Keep `admin_archives/.fernet_key` safe. Lose the key → archives unreadable.
- IP blocks are **not** auto-removed on restore (shared IPs). Delete from `abuse_blocks` manually if needed.
