# Hard security cutover (PR6)

## LIVE NOW

### Economy protect trigger
When `game_settings.secure_economy = true` (now **ON**):

Client/anon **cannot change**:
- shard_balance, lifetime_taps, season_shards, weekly_shards
- weekly_week_id, daily_taps, last_energy
- current_streak, last_tap_date
- sol_balance, usdc_balance

Only **Edge Functions (service_role)** can change those.

### Edge Functions (JWT required)
- auth-login / auth-register → session JWT
- player-state
- shop-buy
- mystery-open
- badge-claim-weekly
- commit-taps
- claim-weekly-quest
- claim-weekly-prize

### Required for players
**Log out → log in again** so `gift2u_session_token` is set.
Without JWT, taps will look local but **will not save** balances/lifetime.

## Still client-writable (next lock)
- inventory JSON (backpack activate, some progress)
- username (should be edge-only later)
- max_unlocked_level / wall climb

## Test checklist
1. Deploy frontend
2. Log out → log in
3. Tap → Network `commit-taps` 200
4. Buy refill → `shop-buy` 200
5. DevTools: try `supabase.from("players").update({shard_balance:999999}).eq(...)` → balance should NOT stick after reload
6. Without logout/login (no token): taps should not permanently credit

## Emergency rollback
```sql
UPDATE public.game_settings SET secure_economy = false WHERE id = 1;
-- or drop trigger:
-- DROP TRIGGER IF EXISTS trg_protect_player_economy ON public.players;
```
