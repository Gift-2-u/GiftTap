-- =============================================================================
-- Daily board: NO score ledger. Snapshot from players.daily_shards only.
-- Same lesson as season_score_ledger (GREATEST ledger fought resets) — drop it.
-- Live board (daily-board Edge) already reads players.daily_shards.
-- Finalize MUST run before day-roll zeros daily_shards (cron 00:05 UTC +
-- player-state / commit-taps call ensure before zeroing).
-- Safe to paste in Supabase SQL Editor (idempotent).
-- =============================================================================

-- Stop writing / reading the parallel ledger
DROP FUNCTION IF EXISTS public.upsert_daily_score_ledger(text, text, text, numeric);
DROP TABLE IF EXISTS public.daily_score_ledger;

CREATE OR REPLACE FUNCTION public.snapshot_daily_leaderboard(p_day_id text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted int := 0;
  v_today text;
  v_floor numeric := public.daily_badge_floor();
  v_total int := 0;
BEGIN
  IF p_day_id IS NULL OR btrim(p_day_id) = '' THEN
    RAISE EXCEPTION 'p_day_id required (YYYY-MM-DD)';
  END IF;
  IF p_day_id !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'p_day_id must be YYYY-MM-DD';
  END IF;

  v_today := public.utc_day_id(now());
  IF p_day_id = v_today THEN
    RAISE EXCEPTION 'cannot snapshot the live day % — wait until UTC midnight', p_day_id;
  END IF;

  DELETE FROM public.daily_leaderboard_snapshots WHERE day_id = p_day_id;

  -- Source of truth: players.daily_shards for that UTC play day (last_tap_date)
  SELECT COUNT(*)::int INTO v_total
  FROM public.players p
  WHERE COALESCE(p.daily_shards, 0) >= v_floor
    AND p.last_tap_date IS NOT NULL
    AND to_char(p.last_tap_date::date, 'YYYY-MM-DD') = p_day_id
    AND p.telegram_id IS NOT NULL
    AND btrim(p.telegram_id) <> ''
    AND p.username IS NOT NULL
    AND btrim(p.username) <> ''
    AND COALESCE(p.is_banned, false) = false;

  INSERT INTO public.daily_leaderboard_snapshots (
    day_id, rank, telegram_id, username, score, badge_tier, snapped_at
  )
  SELECT
    p_day_id,
    r.rnk,
    r.telegram_id,
    r.username,
    r.score,
    public.daily_badge_tier_for_rank(r.rnk::int, v_total),
    now()
  FROM (
    SELECT
      p.telegram_id,
      p.username,
      COALESCE(p.daily_shards, 0) AS score,
      ROW_NUMBER() OVER (
        ORDER BY COALESCE(p.daily_shards, 0) DESC, p.telegram_id
      ) AS rnk
    FROM public.players p
    WHERE COALESCE(p.daily_shards, 0) >= v_floor
      AND p.last_tap_date IS NOT NULL
      AND to_char(p.last_tap_date::date, 'YYYY-MM-DD') = p_day_id
      AND p.telegram_id IS NOT NULL
      AND btrim(p.telegram_id) <> ''
      AND p.username IS NOT NULL
      AND btrim(p.username) <> ''
      AND COALESCE(p.is_banned, false) = false
  ) r
  WHERE public.daily_badge_tier_for_rank(r.rnk::int, v_total) IS NOT NULL;

  GET DIAGNOSTICS inserted = ROW_COUNT;

  INSERT INTO public.daily_board_meta (day_id, snapped_at, snap_rows, finalized_at, notes)
  VALUES (
    p_day_id,
    now(),
    inserted,
    now(),
    format('snapshot daily_shards only floor>=%s eligible=%s cuts=5/10/15', v_floor, v_total)
  )
  ON CONFLICT (day_id) DO UPDATE SET
    snapped_at = now(),
    snap_rows = EXCLUDED.snap_rows,
    finalized_at = now(),
    notes = EXCLUDED.notes;

  RETURN inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.snapshot_daily_leaderboard(text) TO service_role;

-- Finalize previous UTC day from players.daily_shards (no ledger).
CREATE OR REPLACE FUNCTION public.ensure_daily_leaderboard_rollover()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prev_day text := public.previous_utc_day_id(now());
  n int := 0;
  g int := 0;
  meta_notes text;
  peek int := 0;
  v_floor numeric := public.daily_badge_floor();
  had_snap boolean := false;
BEGIN
  SELECT m.notes INTO meta_notes
  FROM public.daily_board_meta m
  WHERE m.day_id = prev_day AND m.finalized_at IS NOT NULL;

  -- Skip only if already finalized from daily_shards (not the old ledger path)
  IF meta_notes IS NOT NULL
     AND meta_notes LIKE '%daily_shards only%' THEN
    RETURN format('already finalized %s', prev_day);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.daily_leaderboard_snapshots s WHERE s.day_id = prev_day
  ) INTO had_snap;

  SELECT COUNT(*)::int INTO peek
  FROM public.players p
  WHERE COALESCE(p.daily_shards, 0) >= v_floor
    AND p.last_tap_date IS NOT NULL
    AND to_char(p.last_tap_date::date, 'YYYY-MM-DD') = prev_day
    AND COALESCE(p.is_banned, false) = false
    AND p.username IS NOT NULL
    AND btrim(p.username) <> '';

  -- Players already day-rolled → daily_shards gone; do not wipe a prior snapshot to empty
  IF peek = 0 AND had_snap THEN
    UPDATE public.daily_board_meta
    SET notes = trim(both FROM coalesce(notes, '') || ' | kept prior snap (no daily_shards left)')
    WHERE day_id = prev_day;
    RETURN format('kept prior snapshot %s (players already day-rolled)', prev_day);
  END IF;

  -- Rebuild from daily_shards (clears ledger-era ranks/badges when data still present)
  DELETE FROM public.daily_badge_grants WHERE day_id = prev_day;
  DELETE FROM public.daily_leaderboard_snapshots WHERE day_id = prev_day;
  DELETE FROM public.daily_board_meta WHERE day_id = prev_day;

  n := public.snapshot_daily_leaderboard(prev_day);
  g := public.grant_daily_badges_from_snapshot(prev_day);
  RETURN format('day=%s snap=%s granted=%s source=daily_shards', prev_day, n, g);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_daily_leaderboard_rollover() TO anon, authenticated, service_role;

-- Best-effort rebuild for yesterday (may be empty if everyone already day-rolled)
SELECT public.ensure_daily_leaderboard_rollover();
