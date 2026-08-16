-- =============================================================================
-- Weekly leaderboard 15% floor (mirror season spirit)
--
-- Reference: 1000 score/day × 15% × 7 days = 1050 full-week badge floor.
-- Live client board uses progressive floor (day 1…7); snapshot at week end
-- only ranks players with score >= 1050 for badge tiers.
--
-- Safe to paste into Supabase SQL Editor (idempotent).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.weekly_badge_floor()
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  -- 0.15 * 1000 * 7
  SELECT 1050::numeric;
$$;

CREATE OR REPLACE FUNCTION public.weekly_badge_tier_for_rank(p_rank int)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_rank = 1 THEN 'diamond'
    WHEN p_rank = 2 THEN 'gold'
    WHEN p_rank = 3 THEN 'silver'
    WHEN p_rank BETWEEN 4 AND 10 THEN 'bronze'
    ELSE NULL
  END;
$$;

/**
 * Snapshot top 50 for a finished week into weekly_leaderboard_snapshots.
 * Only players at/above weekly_badge_floor() (1050) are ranked for badges.
 * Under-floor scores are excluded so inactive players cannot take top-10.
 */
CREATE OR REPLACE FUNCTION public.snapshot_weekly_leaderboard(p_week_id text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted int := 0;
  v_current text;
  v_floor numeric := public.weekly_badge_floor();
BEGIN
  IF p_week_id IS NULL OR btrim(p_week_id) = '' THEN
    RAISE EXCEPTION 'p_week_id required (ISO week like 2026-W33)';
  END IF;

  v_current := public.utc_iso_week_id(now());
  -- Do not freeze the live week (scores still changing)
  IF p_week_id = v_current THEN
    RAISE EXCEPTION 'cannot snapshot the live week % — wait until it ends', p_week_id;
  END IF;

  DELETE FROM public.weekly_leaderboard_snapshots WHERE week_id = p_week_id;

  INSERT INTO public.weekly_leaderboard_snapshots (
    week_id, rank, telegram_id, username, score, badge_tier, snapped_at
  )
  SELECT
    p_week_id,
    r.rnk,
    r.telegram_id,
    r.username,
    r.score,
    public.weekly_badge_tier_for_rank(r.rnk::int),
    now()
  FROM (
    SELECT
      s.telegram_id,
      s.username,
      s.score,
      ROW_NUMBER() OVER (ORDER BY s.score DESC, s.telegram_id) AS rnk
    FROM (
      -- Prefer ledger
      SELECT
        l.telegram_id,
        l.username,
        COALESCE(l.score, 0) AS score
      FROM public.weekly_score_ledger l
      WHERE l.week_id = p_week_id
        AND COALESCE(l.score, 0) >= v_floor
        AND l.telegram_id IS NOT NULL
        AND btrim(l.telegram_id) <> ''
      UNION ALL
      -- Fallback: still-on-old-week players not yet in ledger
      SELECT
        p.telegram_id,
        p.username,
        COALESCE(p.weekly_shards, 0) AS score
      FROM public.players p
      WHERE p.weekly_week_id = p_week_id
        AND COALESCE(p.weekly_shards, 0) >= v_floor
        AND p.telegram_id IS NOT NULL
        AND btrim(p.telegram_id) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM public.weekly_score_ledger l2
          WHERE l2.week_id = p_week_id AND l2.telegram_id = p.telegram_id
        )
    ) s
    WHERE s.username IS NOT NULL AND btrim(s.username) <> ''
  ) r
  WHERE r.rnk <= 50;

  GET DIAGNOSTICS inserted = ROW_COUNT;

  INSERT INTO public.weekly_season_meta (week_id, snapped_at, snap_rows, finalized_at, notes)
  VALUES (
    p_week_id,
    now(),
    inserted,
    now(),
    format('snapshot floor>=%s (15%% weekly badge rule)', v_floor)
  )
  ON CONFLICT (week_id) DO UPDATE SET
    snapped_at = now(),
    snap_rows = EXCLUDED.snap_rows,
    finalized_at = now(),
    notes = EXCLUDED.notes;

  RETURN inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.weekly_badge_floor() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.snapshot_weekly_leaderboard(text) TO service_role;

COMMENT ON FUNCTION public.weekly_badge_floor() IS
  'Min weekly score for badge eligibility: 15% × 1000/day × 7 days = 1050';
COMMENT ON FUNCTION public.snapshot_weekly_leaderboard(text) IS
  'Freeze finished week ranks; only score >= weekly_badge_floor() get ranks/badges';
