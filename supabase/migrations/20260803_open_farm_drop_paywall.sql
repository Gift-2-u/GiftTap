-- ============================================================
-- Open farm: remove legacy PAYWALL_LOCKED that blocks saves
-- when lifetime_taps pass an ascension wall (e.g. 50_000 at L4).
--
-- WHY: Players could farm shards on device, but Supabase rejected
-- every update (shards + lifetime stuck). Phone/desktop diverged.
--
-- Run once in Supabase → SQL Editor → New query → Run
-- ============================================================

-- Drop common legacy trigger/function names (safe if missing)
drop trigger if exists paywall_lock_trigger on public.players;
drop trigger if exists players_paywall_lock on public.players;
drop trigger if exists enforce_paywall on public.players;
drop trigger if exists trg_paywall_locked on public.players;
drop trigger if exists check_paywall on public.players;

drop function if exists public.paywall_lock() cascade;
drop function if exists public.enforce_paywall() cascade;
drop function if exists public.check_paywall() cascade;
drop function if exists public.players_paywall_guard() cascade;
drop function if exists public.guard_paywall() cascade;

-- If your trigger had a different name, list and drop it:
--   select tgname from pg_trigger
--   where tgrelid = 'public.players'::regclass and not tgisinternal;
-- Then: drop trigger if exists <name> on public.players;

-- Optional: find any function that raises PAYWALL_LOCKED
--   select p.proname, pg_get_functiondef(p.oid)
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where pg_get_functiondef(p.oid) ilike '%PAYWALL%';

comment on table public.players is
  'Gift Tap players. Ascension walls are client-side optional perks; lifetime_taps and shard_balance may grow freely past wall thresholds.';
