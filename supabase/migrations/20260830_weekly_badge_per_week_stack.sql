-- =============================================================================
-- Weekly badges: each week is independent (+1 stack per winning week).
-- Idempotency = claim_log key `weekly_badge:<week>:award` (NOT "already own tier").
-- Paste in Supabase SQL Editor, then run W35 repair at bottom.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.grant_weekly_badges_from_snapshot(p_week_id text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  inv jsonb;
  item text;
  n int;
  claim_key text;
  log jsonb;
  granted int := 0;
  v_current text;
  already_logged boolean;
BEGIN
  IF p_week_id IS NULL OR btrim(p_week_id) = '' THEN
    RETURN 0;
  END IF;

  v_current := public.utc_iso_week_id(now());
  IF p_week_id = v_current THEN
    RAISE EXCEPTION 'cannot grant badges for the live week %', p_week_id;
  END IF;

  FOR r IN
    SELECT
      s.week_id,
      s.rank,
      s.telegram_id::text AS pid,
      lower(btrim(s.badge_tier)) AS tier
    FROM public.weekly_leaderboard_snapshots s
    WHERE s.week_id = p_week_id
      AND s.badge_tier IS NOT NULL
      AND lower(btrim(s.badge_tier)) IN ('diamond', 'gold', 'silver', 'bronze')
  LOOP
    item := 'badge_' || r.tier;
    claim_key := 'weekly_badge:' || r.week_id || ':award';

    -- Upsert grant row for this week only (W34 ≠ W35)
    INSERT INTO public.badge_grants (player_id, week_id, rank, tier)
    VALUES (r.pid, r.week_id, r.rank, r.tier)
    ON CONFLICT (player_id, week_id) DO UPDATE
      SET rank = EXCLUDED.rank,
          tier = EXCLUDED.tier;

    SELECT coalesce(inventory, '{}'::jsonb) INTO inv
    FROM public.players
    WHERE telegram_id::text = r.pid;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    log := coalesce(inv -> 'claim_log', '[]'::jsonb);
    IF jsonb_typeof(log) <> 'array' THEN
      log := '[]'::jsonb;
    END IF;

    already_logged := EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(log) x WHERE x = claim_key
    );

    -- This week already +1'd into backpack → do not double-credit
    IF already_logged THEN
      CONTINUE;
    END IF;

    -- Always +1 for this week (owning bronze from W34 does not skip W35)
    n := coalesce((inv ->> item)::int, 0);
    inv := inv || jsonb_build_object(item, n + 1);
    granted := granted + 1;

    inv := inv || jsonb_build_object(
      'weekly_badge_award',
      jsonb_build_object(
        'weekId', r.week_id,
        'tier', r.tier,
        'rank', r.rank,
        'claimedAt', now()::text,
        'auto', true
      )
    );

    log := log || to_jsonb(claim_key);
    inv := jsonb_set(inv, '{claim_log}', log, true);

    -- inventory only — never last_updated
    UPDATE public.players
    SET inventory = inv
    WHERE telegram_id::text = r.pid;
  END LOOP;

  RETURN granted;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_weekly_badges_from_snapshot(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_weekly_badges_from_snapshot(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_weekly_badges_from_snapshot(text) TO postgres;

-- =============================================================================
-- RUN AFTER PASTING THE FUNCTION ABOVE:
--   SELECT public.grant_weekly_badges_from_snapshot('2026-W35') AS badges_granted;
-- Safe to re-run: claim_log key blocks double +1 for the same week.
-- =============================================================================
