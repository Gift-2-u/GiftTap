-- =============================================================================
-- Weekly + season eligibility floor: 15% → 20% of 1000/day pace.
-- Weekly badge floor at week end: 20% × 1000 × 7 = 1400 (was 1050).
-- Does NOT change Diamond/Gold/Silver tier % cuts.
-- Paste in Supabase SQL Editor.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.weekly_badge_floor()
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  -- 0.20 * 1000 * 7
  SELECT 1400::numeric;
$$;

COMMENT ON FUNCTION public.weekly_badge_floor() IS
  'Min weekly score for badge eligibility: 20% × 1000/day × 7 days = 1400';

GRANT EXECUTE ON FUNCTION public.weekly_badge_floor() TO anon, authenticated, service_role;

-- Quick check
-- SELECT public.weekly_badge_floor();  -- 1400
