-- ============================================================
-- MUST RUN in Supabase → SQL Editor (one time)
-- Unlocks lifetime past walls + fixes all-time leaderboard
-- ============================================================

-- A) See what is blocking (optional — check Results)
SELECT tg.tgname AS trigger_name, p.proname AS function_name
FROM pg_trigger tg
JOIN pg_proc p ON p.oid = tg.tgfoid
JOIN pg_class c ON c.oid = tg.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'players' AND NOT tg.tgisinternal;

-- B) DROP EVERY user trigger on players (paywall is almost always one of these)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tg.tgname AS tgname
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'players'
      AND NOT tg.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.players', r.tgname);
    RAISE NOTICE 'Dropped trigger %', r.tgname;
  END LOOP;
END $$;

-- C) Drop paywall-related functions if they still exist
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        p.proname ILIKE '%paywall%'
        OR pg_get_functiondef(p.oid) ILIKE '%PAYWALL_LOCKED%'
      )
  LOOP
    BEGIN
      EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s) CASCADE', r.nspname, r.proname, r.args);
      RAISE NOTICE 'Dropped function %.%(%)', r.nspname, r.proname, r.args;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not drop %.%: %', r.proname, r.args, SQLERRM;
    END;
  END LOOP;
END $$;

-- D) Dedicated open-farm column (trigger-free; app always writes this)
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS true_lifetime_taps numeric DEFAULT 0;

COMMENT ON COLUMN public.players.true_lifetime_taps IS
  'Open-farm lifetime score. Not blocked by legacy paywall. Use for all-time leaderboard.';

-- E) Backfill true_lifetime + lifetime from inventory farm counter
UPDATE public.players
SET
  true_lifetime_taps = GREATEST(
    COALESCE(true_lifetime_taps, 0),
    COALESCE(lifetime_taps, 0),
    COALESCE(NULLIF(inventory->>'farm_lifetime_taps', '')::numeric, 0)
  ),
  lifetime_taps = GREATEST(
    COALESCE(lifetime_taps, 0),
    COALESCE(NULLIF(inventory->>'farm_lifetime_taps', '')::numeric, 0),
    COALESCE(true_lifetime_taps, 0)
  );

-- F) All-time leaderboard = true farm score
DROP VIEW IF EXISTS public.leaderboard_all_time CASCADE;
CREATE VIEW public.leaderboard_all_time AS
SELECT
  p.telegram_id,
  p.username,
  GREATEST(
    COALESCE(p.true_lifetime_taps, 0),
    COALESCE(p.lifetime_taps, 0),
    COALESCE(NULLIF(p.inventory->>'farm_lifetime_taps', '')::numeric, 0)
  ) AS lifetime_taps,
  COALESCE(p.true_lifetime_taps, 0) AS true_lifetime_taps,
  COALESCE(p.season_shards, 0) AS season_shards,
  COALESCE(p.shard_balance, 0) AS shard_balance,
  COALESCE(p.max_unlocked_level, 4) AS max_unlocked_level,
  p.inventory,
  p.wallet_address,
  p.last_updated
FROM public.players p
WHERE p.username IS NOT NULL AND btrim(p.username) <> '';

GRANT SELECT ON public.leaderboard_all_time TO anon, authenticated, service_role;

-- G) Quick check — your row should show lifetime > 50000 if farm_lifetime was saved
-- SELECT username, lifetime_taps, true_lifetime_taps, inventory->>'farm_lifetime_taps' AS farm
-- FROM public.players
-- ORDER BY GREATEST(COALESCE(true_lifetime_taps,0), COALESCE(lifetime_taps,0)) DESC
-- LIMIT 20;
