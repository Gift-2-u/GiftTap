-- =============================================================================
-- Weekly badges: %-based cuts from 2026-W35 onward
--   Top 10% Diamond · next 15% Gold · next 25% Silver · rest eligible Bronze
-- Through 2026-W34: keep legacy #1 D · #2 G · #3 S · #4–10 B
--
-- Snapshot now includes ALL floor-eligible players (not only top 50),
-- so every eligible miner gets a badge (more Mystery Gift fuel after swap removal).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.weekly_percent_badges_from_week()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '2026-W35'::text;
$$;

CREATE OR REPLACE FUNCTION public.weekly_badge_tier_for_rank(
  p_rank int,
  p_total int DEFAULT 0,
  p_week_id text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  n int := GREATEST(0, COALESCE(p_total, 0));
  d int;
  g int;
  s int;
  from_week text := public.weekly_percent_badges_from_week();
  use_pct boolean;
BEGIN
  IF p_rank IS NULL OR p_rank < 1 THEN
    RETURN NULL;
  END IF;

  use_pct := (p_week_id IS NOT NULL AND btrim(p_week_id) <> '' AND p_week_id >= from_week);

  -- Legacy top-10 fixed (through 2026-W34)
  IF NOT use_pct THEN
    IF n >= 1 AND p_rank > n THEN
      RETURN NULL;
    END IF;
    RETURN CASE
      WHEN p_rank = 1 THEN 'diamond'
      WHEN p_rank = 2 THEN 'gold'
      WHEN p_rank = 3 THEN 'silver'
      WHEN p_rank >= 4 AND p_rank <= 10 THEN 'bronze'
      ELSE NULL
    END;
  END IF;

  IF n < 1 OR p_rank > n THEN
    RETURN NULL;
  END IF;

  -- Rank seats + round(N×%): always ≥1 D/G/S when those ranks exist;
  -- percents add more seats when N×% rounds up (15→2D, 2G, 4S).
  d := GREATEST(CASE WHEN n >= 1 THEN 1 ELSE 0 END, ROUND(n * 0.10)::int);
  g := GREATEST(CASE WHEN n >= 2 THEN 1 ELSE 0 END, ROUND(n * 0.15)::int);
  s := GREATEST(CASE WHEN n >= 3 THEN 1 ELSE 0 END, ROUND(n * 0.25)::int);

  IF d + g + s > n THEN
    -- Trim silver → gold → diamond if over-allocated
    IF d + g + s > n THEN
      s := GREATEST(0, s - ((d + g + s) - n));
    END IF;
    IF d + g + s > n THEN
      g := GREATEST(0, g - ((d + g + s) - n));
    END IF;
    IF d + g + s > n THEN
      d := GREATEST(0, d - ((d + g + s) - n));
    END IF;
  END IF;

  IF p_rank <= d THEN RETURN 'diamond'; END IF;
  IF p_rank <= d + g THEN RETURN 'gold'; END IF;
  IF p_rank <= d + g + s THEN RETURN 'silver'; END IF;
  RETURN 'bronze';
END;
$$;

-- Keep old 1-arg name working (legacy callers) via overload
CREATE OR REPLACE FUNCTION public.weekly_badge_tier_for_rank(p_rank int)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.weekly_badge_tier_for_rank(p_rank, 0, NULL);
$$;

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
  v_total int := 0;
BEGIN
  IF p_week_id IS NULL OR btrim(p_week_id) = '' THEN
    RAISE EXCEPTION 'p_week_id required (ISO week like 2026-W33)';
  END IF;

  v_current := public.utc_iso_week_id(now());
  IF p_week_id = v_current THEN
    RAISE EXCEPTION 'cannot snapshot the live week % — wait until it ends', p_week_id;
  END IF;

  DELETE FROM public.weekly_leaderboard_snapshots WHERE week_id = p_week_id;

  -- Count eligible first (for %-based tier cuts)
  SELECT COUNT(*)::int INTO v_total
  FROM (
    SELECT l.telegram_id
    FROM public.weekly_score_ledger l
    WHERE l.week_id = p_week_id
      AND COALESCE(l.score, 0) >= v_floor
      AND l.telegram_id IS NOT NULL
      AND btrim(l.telegram_id) <> ''
      AND l.username IS NOT NULL AND btrim(l.username) <> ''
    UNION
    SELECT p.telegram_id
    FROM public.players p
    WHERE p.weekly_week_id = p_week_id
      AND COALESCE(p.weekly_shards, 0) >= v_floor
      AND p.telegram_id IS NOT NULL
      AND btrim(p.telegram_id) <> ''
      AND p.username IS NOT NULL AND btrim(p.username) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.weekly_score_ledger l2
        WHERE l2.week_id = p_week_id AND l2.telegram_id = p.telegram_id
      )
  ) c;

  INSERT INTO public.weekly_leaderboard_snapshots (
    week_id, rank, telegram_id, username, score, badge_tier, snapped_at
  )
  SELECT
    p_week_id,
    r.rnk,
    r.telegram_id,
    r.username,
    r.score,
    public.weekly_badge_tier_for_rank(r.rnk::int, v_total, p_week_id),
    now()
  FROM (
    SELECT
      s.telegram_id,
      s.username,
      s.score,
      ROW_NUMBER() OVER (ORDER BY s.score DESC, s.telegram_id) AS rnk
    FROM (
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
  -- All eligible get a badge under %-rules; legacy weeks still only top 10 get tiers
  -- but we snapshot all eligible for history / claims.
  WHERE public.weekly_badge_tier_for_rank(r.rnk::int, v_total, p_week_id) IS NOT NULL
     OR r.rnk <= 50;

  GET DIAGNOSTICS inserted = ROW_COUNT;

  INSERT INTO public.weekly_season_meta (week_id, snapped_at, snap_rows, finalized_at, notes)
  VALUES (
    p_week_id,
    now(),
    inserted,
    now(),
    format(
      'snapshot floor>=%s eligible=%s cuts=10/15/25/rest from %s',
      v_floor,
      v_total,
      public.weekly_percent_badges_from_week()
    )
  )
  ON CONFLICT (week_id) DO UPDATE SET
    snapped_at = now(),
    snap_rows = EXCLUDED.snap_rows,
    finalized_at = now(),
    notes = EXCLUDED.notes;

  RETURN inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.weekly_percent_badges_from_week() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.weekly_badge_tier_for_rank(int, int, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.weekly_badge_tier_for_rank(int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.snapshot_weekly_leaderboard(text) TO service_role;

COMMENT ON FUNCTION public.weekly_badge_tier_for_rank(int, int, text) IS
  'Badge tier by rank; %-based from 2026-W35 (10/15/25/rest of eligible)';
