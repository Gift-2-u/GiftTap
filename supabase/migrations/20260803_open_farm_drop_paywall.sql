-- ============================================================
-- OPEN FARM: unlock lifetime_taps past walls (fix leaderboard)
-- Run once: Supabase → SQL Editor → paste → Run
-- ============================================================

-- 1) Drop ANY trigger on public.players whose function body looks like a paywall
DO $$
DECLARE
  r RECORD;
  def text;
BEGIN
  FOR r IN
    SELECT tg.tgname AS tgname, p.oid AS funcoid, p.proname AS proname
    FROM pg_trigger tg
    JOIN pg_proc p ON p.oid = tg.tgfoid
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'players'
      AND NOT tg.tgisinternal
  LOOP
    BEGIN
      def := pg_get_functiondef(r.funcoid);
    EXCEPTION WHEN OTHERS THEN
      def := '';
    END;
    IF def ILIKE '%PAYWALL%'
       OR def ILIKE '%paywall%'
       OR def ILIKE '%ascension%wall%'
       OR def ILIKE '%get_paywall%'
       OR def ILIKE '%max_unlocked_level%' AND def ILIKE '%lifetime_taps%'
    THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.players', r.tgname);
      RAISE NOTICE 'Dropped trigger: % (function %)', r.tgname, r.proname;
    END IF;
  END LOOP;
END $$;

-- 2) Also drop known names (no-op if already gone)
DROP TRIGGER IF EXISTS paywall_lock_trigger ON public.players;
DROP TRIGGER IF EXISTS players_paywall_lock ON public.players;
DROP TRIGGER IF EXISTS enforce_paywall ON public.players;
DROP TRIGGER IF EXISTS trg_paywall_locked ON public.players;
DROP TRIGGER IF EXISTS check_paywall ON public.players;
DROP TRIGGER IF EXISTS players_check_paywall ON public.players;
DROP TRIGGER IF EXISTS trg_players_paywall ON public.players;
DROP TRIGGER IF EXISTS before_player_update_paywall ON public.players;

DROP FUNCTION IF EXISTS public.paywall_lock() CASCADE;
DROP FUNCTION IF EXISTS public.enforce_paywall() CASCADE;
DROP FUNCTION IF EXISTS public.check_paywall() CASCADE;
DROP FUNCTION IF EXISTS public.players_paywall_guard() CASCADE;
DROP FUNCTION IF EXISTS public.guard_paywall() CASCADE;

-- 3) Backfill: push inventory.farm_lifetime_taps into lifetime_taps
UPDATE public.players
SET lifetime_taps = GREATEST(
  COALESCE(lifetime_taps, 0)::numeric,
  COALESCE(NULLIF(inventory->>'farm_lifetime_taps', '')::numeric, 0)
)
WHERE inventory ? 'farm_lifetime_taps'
  AND COALESCE(NULLIF(inventory->>'farm_lifetime_taps', '')::numeric, 0)
      > COALESCE(lifetime_taps, 0);

-- 4) Recreate all-time leaderboard view so scores use true farm lifetime
--    (works even before backfill finishes for every row)
DROP VIEW IF EXISTS public.leaderboard_all_time CASCADE;
CREATE VIEW public.leaderboard_all_time AS
SELECT
  p.telegram_id,
  p.username,
  GREATEST(
    COALESCE(p.lifetime_taps, 0)::numeric,
    COALESCE(NULLIF(p.inventory->>'farm_lifetime_taps', '')::numeric, 0)
  ) AS lifetime_taps,
  COALESCE(p.season_shards, 0) AS season_shards,
  COALESCE(p.shard_balance, 0) AS shard_balance,
  COALESCE(p.max_unlocked_level, 4) AS max_unlocked_level,
  p.wallet_address,
  p.last_updated
FROM public.players p
WHERE p.username IS NOT NULL AND trim(p.username) <> '';

GRANT SELECT ON public.leaderboard_all_time TO anon, authenticated, service_role;

-- 5) Helper: list remaining triggers (read result in Messages / run separately)
-- SELECT tg.tgname, p.proname
-- FROM pg_trigger tg
-- JOIN pg_proc p ON p.oid = tg.tgfoid
-- JOIN pg_class c ON c.oid = tg.tgrelid
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public' AND c.relname = 'players' AND NOT tg.tgisinternal;
