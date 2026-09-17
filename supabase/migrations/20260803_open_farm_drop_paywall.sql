-- Unlock Stay-and-mine past walls (Lv5 / 50k etc).
-- Wall only gates level unlock / Locksmith perks — NEVER blocks lifetime_taps or shards.
-- Surgical: drop PAYWALL bouncer only. Keep HARD_LOCK protect / identity / ledger triggers.
-- Run in Supabase SQL Editor (or apply via Management API). No new columns.

-- 1) Drop ONLY triggers on players whose function is a paywall / PAYWALL_LOCKED bouncer
--    (scan trigger fns only — never call pg_get_functiondef on aggregates)
DO $$
DECLARE r RECORD;
  def text;
BEGIN
  FOR r IN
    SELECT tg.tgname AS tgname, p.oid AS funcoid, p.proname AS proname
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = tg.tgfoid
    WHERE n.nspname = 'public'
      AND c.relname = 'players'
      AND NOT tg.tgisinternal
  LOOP
    IF r.proname ILIKE '%paywall%' THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.players', r.tgname);
      RAISE NOTICE 'Dropped paywall trigger % (fn %)', r.tgname, r.proname;
      CONTINUE;
    END IF;
    BEGIN
      def := pg_get_functiondef(r.funcoid);
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
    IF def ILIKE '%PAYWALL_LOCKED%' THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.players', r.tgname);
      RAISE NOTICE 'Dropped paywall trigger % (fn %)', r.tgname, r.proname;
    END IF;
  END LOOP;
END $$;

-- 2) Drop paywall functions by name only (safe — no aggregate scan)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname ILIKE '%paywall%'
      AND p.prokind = 'f'
  LOOP
    BEGIN
      EXECUTE format(
        'DROP FUNCTION IF EXISTS %I.%I(%s) CASCADE',
        r.nspname, r.proname, r.args
      );
      RAISE NOTICE 'Dropped paywall function %.%(%)', r.nspname, r.proname, r.args;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skip drop %.%: %', r.nspname, r.proname, SQLERRM;
    END;
  END LOOP;
END $$;

-- 3) Remove mistaken column if it was ever added
ALTER TABLE public.players DROP COLUMN IF EXISTS true_lifetime_taps;

-- 4) Verify: remaining players triggers (expect protect / identity / ledger — NOT paywall)
SELECT tg.tgname AS trigger_name, p.proname AS function_name
FROM pg_trigger tg
JOIN pg_class c ON c.oid = tg.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = tg.tgfoid
WHERE n.nspname = 'public' AND c.relname = 'players' AND NOT tg.tgisinternal
ORDER BY tg.tgname;
