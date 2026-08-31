-- =============================================================================
-- Weekly badge %-cuts from 2026-W36:
--   top 5% Diamond · next 10% Gold · next 15% Silver · rest eligible Bronze
-- 2026-W35 stays on 10% / 15% / 25% (do not re-snapshot W35).
-- Same top-100 paid seat rule as 20260827_weekly_top100_badge_tiers.sql.
-- Paste in Supabase SQL Editor (CREATE OR REPLACE — no DROP needed).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.weekly_tighter_badge_cuts_from_week()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '2026-W36'::text;
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
  paid_n int;
  d int;
  g int;
  s int;
  from_week text := public.weekly_percent_badges_from_week();
  tight_week text := public.weekly_tighter_badge_cuts_from_week();
  use_pct boolean;
  use_tight boolean;
  d_pct numeric;
  g_pct numeric;
  s_pct numeric;
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

  -- Eligible but outside top 100 → bronze only
  IF p_rank > 100 THEN
    RETURN 'bronze';
  END IF;

  paid_n := LEAST(100, n);

  -- W35: 10/15/25 · W36+: 5/10/15
  use_tight := (p_week_id IS NULL OR btrim(p_week_id) = '' OR p_week_id >= tight_week);
  IF use_tight THEN
    d_pct := 0.05;
    g_pct := 0.10;
    s_pct := 0.15;
  ELSE
    d_pct := 0.10;
    g_pct := 0.15;
    s_pct := 0.25;
  END IF;

  d := GREATEST(CASE WHEN paid_n >= 1 THEN 1 ELSE 0 END, ROUND(paid_n * d_pct)::int);
  g := GREATEST(CASE WHEN paid_n >= 2 THEN 1 ELSE 0 END, ROUND(paid_n * g_pct)::int);
  s := GREATEST(CASE WHEN paid_n >= 3 THEN 1 ELSE 0 END, ROUND(paid_n * s_pct)::int);

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

GRANT EXECUTE ON FUNCTION public.weekly_tighter_badge_cuts_from_week() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.weekly_badge_tier_for_rank(int, int, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.weekly_badge_tier_for_rank(int, int, text) IS
  'W34- legacy top10; W35 10/15/25 among top100; W36+ 5/10/15 among top100; rank>100 bronze';

-- Quick checks (optional):
-- SELECT public.weekly_badge_tier_for_rank(1, 100, '2026-W35');  -- diamond (10% → 10 seats)
-- SELECT public.weekly_badge_tier_for_rank(6, 100, '2026-W35');  -- gold
-- SELECT public.weekly_badge_tier_for_rank(1, 100, '2026-W36');  -- diamond (5% → 5 seats)
-- SELECT public.weekly_badge_tier_for_rank(6, 100, '2026-W36');  -- gold (ranks 6–15)
-- SELECT public.weekly_badge_tier_for_rank(16, 100, '2026-W36'); -- silver
-- SELECT public.weekly_badge_tier_for_rank(31, 100, '2026-W36'); -- bronze
