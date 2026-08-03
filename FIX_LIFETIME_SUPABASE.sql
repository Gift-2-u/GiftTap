-- Unlock lifetime_taps (same column name as always). Run in Supabase SQL Editor once.
-- No new columns. No renames.

-- Drop every user trigger on players (paywall blocks lifetime_taps)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tg.tgname AS tgname
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'players' AND NOT tg.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.players', r.tgname);
    RAISE NOTICE 'Dropped %', r.tgname;
  END LOOP;
END $$;

-- Drop paywall functions
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname ILIKE '%paywall%' OR pg_get_functiondef(p.oid) ILIKE '%PAYWALL_LOCKED%')
  LOOP
    BEGIN
      EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s) CASCADE', r.nspname, r.proname, r.args);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- Remove mistaken column if it was added
ALTER TABLE public.players DROP COLUMN IF EXISTS true_lifetime_taps;

-- Leaderboard still ranks by lifetime_taps only
DROP VIEW IF EXISTS public.leaderboard_all_time CASCADE;
CREATE VIEW public.leaderboard_all_time AS
SELECT
  p.telegram_id,
  p.username,
  COALESCE(p.lifetime_taps, 0) AS lifetime_taps,
  COALESCE(p.season_shards, 0) AS season_shards,
  COALESCE(p.shard_balance, 0) AS shard_balance,
  COALESCE(p.max_unlocked_level, 4) AS max_unlocked_level,
  p.wallet_address,
  p.last_updated
FROM public.players p
WHERE p.username IS NOT NULL AND btrim(p.username) <> '';

GRANT SELECT ON public.leaderboard_all_time TO anon, authenticated, service_role;
