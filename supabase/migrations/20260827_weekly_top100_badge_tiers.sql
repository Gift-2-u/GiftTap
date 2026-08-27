-- =============================================================================
-- ONLY change: weekly_badge_tier_for_rank (3-arg)
-- Same logic as 20260820_weekly_badge_percent_cuts.sql, plus:
--   • %-cuts use paid_n = LEAST(100, total eligible)
--   • rank > 100 (still eligible) → bronze
-- Does NOT replace snapshot_weekly_leaderboard or anything else.
-- Paste in Supabase SQL Editor.
-- =============================================================================

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
  paid_n int;
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

  -- Legacy top-10 fixed (through 2026-W34) — unchanged
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

  -- NEW: eligible but outside top 100 → bronze only
  IF p_rank > 100 THEN
    RETURN 'bronze';
  END IF;

  -- Same %-cuts as before, but among top 100 (or all eligible if N < 100)
  paid_n := LEAST(100, n);

  d := GREATEST(CASE WHEN paid_n >= 1 THEN 1 ELSE 0 END, ROUND(paid_n * 0.10)::int);
  g := GREATEST(CASE WHEN paid_n >= 2 THEN 1 ELSE 0 END, ROUND(paid_n * 0.15)::int);
  s := GREATEST(CASE WHEN paid_n >= 3 THEN 1 ELSE 0 END, ROUND(paid_n * 0.25)::int);

  IF d + g + s > paid_n THEN
    IF d + g + s > paid_n THEN
      s := GREATEST(0, s - ((d + g + s) - paid_n));
    END IF;
    IF d + g + s > paid_n THEN
      g := GREATEST(0, g - ((d + g + s) - paid_n));
    END IF;
    IF d + g + s > paid_n THEN
      d := GREATEST(0, d - ((d + g + s) - paid_n));
    END IF;
  END IF;

  IF p_rank <= d THEN RETURN 'diamond'; END IF;
  IF p_rank <= d + g THEN RETURN 'gold'; END IF;
  IF p_rank <= d + g + s THEN RETURN 'silver'; END IF;
  RETURN 'bronze';
END;
$$;

-- Quick checks (optional): should return bronze for rank 101 when N=150
-- SELECT public.weekly_badge_tier_for_rank(1, 150, '2026-W35');   -- diamond
-- SELECT public.weekly_badge_tier_for_rank(101, 150, '2026-W35'); -- bronze
-- SELECT public.weekly_badge_tier_for_rank(68, 80, '2026-W35');   -- bronze (within N, outside D/G/S seats)
