# Hard security — PR5 commit-taps (earn path)

## Deployed

| Piece | Status |
|-------|--------|
| Edge `commit-taps` | Deployed |
| Table `tap_batches` | Applied (idempotent batch_id) |
| GiftTap dual path | In repo |

## Behavior

**With session JWT (logged in after hard-sec login):**
- Taps update UI instantly (optimistic)
- Valid taps queue → flush every ~1.5s (and on tab hide)
- Server recalculates energy, daily limit, buffs, level mult
- Server writes: shard_balance, lifetime_taps, season_shards, weekly_shards, daily_taps, last_energy, streak, inventory.weekly_lb
- Client **does not** call full saveToDatabase for those earnings

**Without JWT:**
- Legacy `saveToDatabase` path (old client write)

## Test

1. Deploy frontend, log out → log in
2. Tap gift several times
3. Network: `/functions/v1/commit-taps` with Bearer JWT
4. Supabase: `economy_events` kind=`commit_taps`; `tap_batches` rows

## Still open (cutover later)

- RLS still allows direct players UPDATE
- SOL shop / mint still client
- `secure_economy` flag still false
- Full cutover = PR7 after cheat checklist

## Next (PR6/PR7)

- Wrap remaining client writes
- RLS kill-switch when ready
