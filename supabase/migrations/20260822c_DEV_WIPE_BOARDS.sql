-- =============================================================================
-- DEV ONLY — wipe boards after testing (run in Supabase SQL Editor as postgres)
--
-- Why zeroing players.* alone is NOT enough:
--   Weekly / season / lifetime boards read *_score_ledger with GREATEST.
--   If you only UPDATE players, the ledger keeps the old high score → board stays.
--
-- Always wipe: players columns + matching ledger rows (+ daily bar if needed).
-- Clients CANNOT run this — protect_player_economy freezes those columns for anon.
-- =============================================================================

-- Optional: set your telegram_id to wipe ONE account, or leave NULL to wipe ALL.
-- Example: '\123456789'  (include the leading \ if that is how ids are stored)
DO $$
DECLARE
  v_tid text := NULL;  -- e.g. '123456789'  OR leave NULL for everyone
  v_week text := public.utc_iso_week_id(now());
BEGIN
  -- ----- WEEKLY (current ISO week) -----
  IF v_tid IS NULL THEN
    UPDATE public.players
    SET weekly_shards = 0,
        daily_taps = 0,
        daily_shards = 0,
        last_updated = now()
    WHERE COALESCE(weekly_shards, 0) <> 0
       OR COALESCE(daily_taps, 0) <> 0
       OR COALESCE(daily_shards, 0) <> 0;

    DELETE FROM public.weekly_score_ledger
    WHERE week_id = v_week;
  ELSE
    UPDATE public.players
    SET weekly_shards = 0,
        daily_taps = 0,
        daily_shards = 0,
        last_updated = now()
    WHERE telegram_id::text = v_tid;

    DELETE FROM public.weekly_score_ledger
    WHERE week_id = v_week
      AND telegram_id = v_tid;
  END IF;

  -- ----- SEASON -----
  IF v_tid IS NULL THEN
    UPDATE public.players
    SET season_shards = 0, last_updated = now()
    WHERE COALESCE(season_shards, 0) <> 0;

    DELETE FROM public.season_score_ledger;
  ELSE
    UPDATE public.players
    SET season_shards = 0, last_updated = now()
    WHERE telegram_id::text = v_tid;

    DELETE FROM public.season_score_ledger
    WHERE telegram_id = v_tid;
  END IF;

  -- ----- LIFETIME / ALL-TIME -----
  IF v_tid IS NULL THEN
    UPDATE public.players
    SET lifetime_taps = 0, last_updated = now()
    WHERE COALESCE(lifetime_taps, 0) <> 0;

    DELETE FROM public.lifetime_score_ledger;
  ELSE
    UPDATE public.players
    SET lifetime_taps = 0, last_updated = now()
    WHERE telegram_id::text = v_tid;

    DELETE FROM public.lifetime_score_ledger
    WHERE telegram_id = v_tid;
  END IF;

  RAISE NOTICE 'Wipe done. week=% tid=%', v_week, coalesce(v_tid, 'ALL');
END $$;

-- Sanity checks
SELECT public.utc_iso_week_id(now()) AS live_week;
SELECT count(*) AS weekly_ledger_live
FROM public.weekly_score_ledger
WHERE week_id = public.utc_iso_week_id(now());
SELECT count(*) AS season_ledger FROM public.season_score_ledger;
SELECT count(*) AS lifetime_ledger FROM public.lifetime_score_ledger;
SELECT count(*) AS weekly_view FROM public.leaderboard_weekly;
SELECT count(*) AS season_view FROM public.leaderboard_season;
SELECT count(*) AS all_time_view FROM public.leaderboard_all_time;
