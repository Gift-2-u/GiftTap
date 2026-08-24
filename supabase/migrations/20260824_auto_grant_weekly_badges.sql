-- =============================================================================
-- Auto-grant weekly badges when a week is snapshotted (no manual claim required).
-- Also backfills any finished weeks that have snapshots but missing backpack badges.
-- Paste into Supabase SQL Editor if needed.
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

    n := coalesce((inv ->> item)::int, 0);
    IF n < 1 THEN
      inv := inv || jsonb_build_object(item, 1);
      granted := granted + 1;
    END IF;

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

    log := coalesce(inv -> 'claim_log', '[]'::jsonb);
    IF jsonb_typeof(log) <> 'array' THEN
      log := '[]'::jsonb;
    END IF;
    IF NOT (log ? claim_key) AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(log) x WHERE x = claim_key
    ) THEN
      log := log || to_jsonb(claim_key);
    END IF;
    inv := jsonb_set(inv, '{claim_log}', log, true);

    UPDATE public.players
    SET inventory = inv, last_updated = now()
    WHERE telegram_id::text = r.pid;
  END LOOP;

  RETURN granted;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_weekly_badges_from_snapshot(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_weekly_badges_from_snapshot(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_weekly_badges_from_snapshot(text) TO postgres;

-- Hook: after snapshot, auto-grant (redefine wrapper by patching snapshot end).
-- We replace ensure_weekly_leaderboard_rollover to grant after each snap,
-- and also expose a one-shot for previous weeks.

CREATE OR REPLACE FUNCTION public.ensure_weekly_leaderboard_rollover()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current text;
  v_prev text;
  v_week text;
  v_count int;
  v_granted int;
  v_snapped jsonb := '[]'::jsonb;
  v_got_lock boolean;
BEGIN
  v_got_lock := pg_try_advisory_xact_lock(87231401);
  IF NOT v_got_lock THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'lock_busy');
  END IF;

  v_current := public.utc_iso_week_id(now());
  v_prev := public.previous_utc_iso_week_id(now());

  FOR v_week IN
    SELECT DISTINCT x.week_id
    FROM (
      SELECT v_prev AS week_id
      UNION
      SELECT l.week_id FROM public.weekly_score_ledger l
      UNION
      SELECT p.weekly_week_id FROM public.players p WHERE p.weekly_week_id IS NOT NULL
    ) x
    WHERE x.week_id IS NOT NULL
      AND btrim(x.week_id) <> ''
      AND x.week_id <> v_current
      AND NOT EXISTS (
        SELECT 1 FROM public.weekly_leaderboard_snapshots s
        WHERE s.week_id = x.week_id
        LIMIT 1
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.weekly_season_meta m
        WHERE m.week_id = x.week_id
          AND m.finalized_at IS NOT NULL
      )
    ORDER BY x.week_id
  LOOP
    BEGIN
      v_count := public.snapshot_weekly_leaderboard(v_week);
      BEGIN
        v_granted := public.grant_weekly_badges_from_snapshot(v_week);
      EXCEPTION WHEN OTHERS THEN
        v_granted := -1;
      END;
      v_snapped := v_snapped || jsonb_build_array(
        jsonb_build_object(
          'week_id', v_week,
          'rows', v_count,
          'badges_granted', v_granted
        )
      );
    EXCEPTION WHEN OTHERS THEN
      v_snapped := v_snapped || jsonb_build_array(
        jsonb_build_object('week_id', v_week, 'error', SQLERRM)
      );
    END;
  END LOOP;

  -- If previous week already snapshotted but badges never auto-granted, grant now
  BEGIN
    IF EXISTS (
      SELECT 1 FROM public.weekly_leaderboard_snapshots s
      WHERE s.week_id = v_prev AND s.badge_tier IS NOT NULL
      LIMIT 1
    ) THEN
      v_granted := public.grant_weekly_badges_from_snapshot(v_prev);
      v_snapped := v_snapped || jsonb_build_array(
        jsonb_build_object(
          'week_id', v_prev,
          'rows', 0,
          'badges_granted', v_granted,
          'backfill', true
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_snapped := v_snapped || jsonb_build_array(
      jsonb_build_object('week_id', v_prev, 'backfill_error', SQLERRM)
    );
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'current_week', v_current,
    'previous_week', v_prev,
    'snapped', v_snapped
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_weekly_leaderboard_rollover() TO anon, authenticated, service_role;

-- Immediate: grant badges for last finished week (and any snapshotted weeks missing grants)
DO $$
DECLARE
  w text;
  g int;
BEGIN
  FOR w IN
    SELECT DISTINCT week_id
    FROM public.weekly_leaderboard_snapshots
    WHERE badge_tier IS NOT NULL
      AND week_id IS DISTINCT FROM public.utc_iso_week_id(now())
    ORDER BY 1
  LOOP
    g := public.grant_weekly_badges_from_snapshot(w);
    RAISE NOTICE 'auto-granted badges for % (new inventory fills ~%)', w, g;
  END LOOP;
END $$;
