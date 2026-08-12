-- =============================================================================
-- Weekly season auto-rollover (mirror monthly season behavior)
-- At UTC week end:
--   1) freeze winners into weekly_leaderboard_snapshots
--   2) keep durable per-week scores (ledger) so rollover is safe after players move on
--   3) new week starts automatically (clients key on weekly_week_id / ISO week)
-- No manual SELECT snapshot_weekly_leaderboard(...) required.
--
-- Safe to paste into Supabase SQL Editor (idempotent).
-- =============================================================================

-- Prerequisites (no-op if 20260811_weekly_leaderboard.sql already applied)
CREATE TABLE IF NOT EXISTS public.weekly_leaderboard_snapshots (
  id bigserial PRIMARY KEY,
  week_id text NOT NULL,
  rank int NOT NULL CHECK (rank >= 1),
  telegram_id text,
  username text,
  score numeric NOT NULL DEFAULT 0,
  badge_tier text,
  snapped_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_id, rank)
);
CREATE INDEX IF NOT EXISTS idx_weekly_snapshots_week
  ON public.weekly_leaderboard_snapshots (week_id, rank);
GRANT SELECT ON public.weekly_leaderboard_snapshots TO anon, authenticated, service_role;

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

-- Current / previous UTC ISO week ids, e.g. 2026-W33
CREATE OR REPLACE FUNCTION public.utc_iso_week_id(p_ts timestamptz DEFAULT now())
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT
    to_char((p_ts AT TIME ZONE 'UTC'), 'IYYY')
    || '-W'
    || lpad(to_char((p_ts AT TIME ZONE 'UTC'), 'IW'), 2, '0');
$$;

CREATE OR REPLACE FUNCTION public.previous_utc_iso_week_id(p_ts timestamptz DEFAULT now())
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT public.utc_iso_week_id(p_ts - interval '7 days');
$$;

-- Durable per-week scores (survive client week-id roll before snapshot runs)
CREATE TABLE IF NOT EXISTS public.weekly_score_ledger (
  week_id text NOT NULL,
  telegram_id text NOT NULL,
  username text,
  score numeric NOT NULL DEFAULT 0 CHECK (score >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (week_id, telegram_id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_score_ledger_week_score
  ON public.weekly_score_ledger (week_id, score DESC NULLS LAST);

GRANT SELECT ON public.weekly_score_ledger TO anon, authenticated, service_role;

-- Track which weeks have been auto-finalized (idempotent rollover)
CREATE TABLE IF NOT EXISTS public.weekly_season_meta (
  week_id text PRIMARY KEY,
  snapped_at timestamptz,
  snap_rows int NOT NULL DEFAULT 0,
  finalized_at timestamptz,
  notes text
);

GRANT SELECT ON public.weekly_season_meta TO anon, authenticated, service_role;

-- Sync ledger whenever players.weekly_* changes
CREATE OR REPLACE FUNCTION public.sync_weekly_score_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Preserve previous week score when the player rolls into a new week
  IF TG_OP = 'UPDATE'
     AND OLD.weekly_week_id IS NOT NULL
     AND OLD.weekly_week_id IS DISTINCT FROM NEW.weekly_week_id
     AND COALESCE(OLD.weekly_shards, 0) > 0 THEN
    INSERT INTO public.weekly_score_ledger (week_id, telegram_id, username, score, updated_at)
    VALUES (
      OLD.weekly_week_id,
      OLD.telegram_id,
      OLD.username,
      COALESCE(OLD.weekly_shards, 0),
      now()
    )
    ON CONFLICT (week_id, telegram_id) DO UPDATE SET
      score = GREATEST(public.weekly_score_ledger.score, EXCLUDED.score),
      username = COALESCE(EXCLUDED.username, public.weekly_score_ledger.username),
      updated_at = now();
  END IF;

  -- Upsert live week score (GREATEST so lagging clients cannot lower official score)
  IF NEW.weekly_week_id IS NOT NULL AND COALESCE(NEW.weekly_shards, 0) > 0 THEN
    INSERT INTO public.weekly_score_ledger (week_id, telegram_id, username, score, updated_at)
    VALUES (
      NEW.weekly_week_id,
      NEW.telegram_id,
      NEW.username,
      COALESCE(NEW.weekly_shards, 0),
      now()
    )
    ON CONFLICT (week_id, telegram_id) DO UPDATE SET
      score = GREATEST(public.weekly_score_ledger.score, EXCLUDED.score),
      username = COALESCE(EXCLUDED.username, public.weekly_score_ledger.username),
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_weekly_score_ledger ON public.players;
CREATE TRIGGER trg_sync_weekly_score_ledger
  AFTER INSERT OR UPDATE OF weekly_shards, weekly_week_id, username
  ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_weekly_score_ledger();

-- Backfill ledger from current players columns + inventory.weekly_lb
INSERT INTO public.weekly_score_ledger (week_id, telegram_id, username, score, updated_at)
SELECT
  p.weekly_week_id,
  p.telegram_id,
  p.username,
  COALESCE(p.weekly_shards, 0),
  COALESCE(p.last_updated, now())
FROM public.players p
WHERE p.weekly_week_id IS NOT NULL
  AND COALESCE(p.weekly_shards, 0) > 0
  AND p.telegram_id IS NOT NULL
ON CONFLICT (week_id, telegram_id) DO UPDATE SET
  score = GREATEST(public.weekly_score_ledger.score, EXCLUDED.score),
  username = COALESCE(EXCLUDED.username, public.weekly_score_ledger.username),
  updated_at = GREATEST(public.weekly_score_ledger.updated_at, EXCLUDED.updated_at);

INSERT INTO public.weekly_score_ledger (week_id, telegram_id, username, score, updated_at)
SELECT
  (p.inventory->'weekly_lb'->>'weekId'),
  p.telegram_id,
  p.username,
  COALESCE((p.inventory->'weekly_lb'->>'score')::numeric, 0),
  COALESCE(p.last_updated, now())
FROM public.players p
WHERE p.inventory ? 'weekly_lb'
  AND (p.inventory->'weekly_lb'->>'weekId') IS NOT NULL
  AND btrim(p.inventory->'weekly_lb'->>'weekId') <> ''
  AND COALESCE((p.inventory->'weekly_lb'->>'score')::numeric, 0) > 0
  AND p.telegram_id IS NOT NULL
ON CONFLICT (week_id, telegram_id) DO UPDATE SET
  score = GREATEST(public.weekly_score_ledger.score, EXCLUDED.score),
  username = COALESCE(EXCLUDED.username, public.weekly_score_ledger.username),
  updated_at = GREATEST(public.weekly_score_ledger.updated_at, EXCLUDED.updated_at);

/**
 * Snapshot top 50 for a finished week into weekly_leaderboard_snapshots.
 * Prefers durable ledger (safe after players rolled to the new week).
 * Falls back to players.weekly_* if ledger empty for that week.
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
        AND COALESCE(l.score, 0) > 0
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
        AND COALESCE(p.weekly_shards, 0) > 0
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
  VALUES (p_week_id, now(), inserted, now(), 'auto or rpc snapshot')
  ON CONFLICT (week_id) DO UPDATE SET
    snapped_at = now(),
    snap_rows = EXCLUDED.snap_rows,
    finalized_at = now(),
    notes = EXCLUDED.notes;

  RETURN inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.snapshot_weekly_leaderboard(text) TO service_role;

/**
 * Auto week rollover — same idea as monthly season end:
 *  - detect finished weeks that still need a snapshot
 *  - freeze top 50 + badge tiers
 *  - mark week finalized; new week is already "live" via ISO week id
 *
 * Safe to call often (idempotent + advisory lock).
 * Call from client on load / ranks, or pg_cron.
 */
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
  v_snapped jsonb := '[]'::jsonb;
  v_got_lock boolean;
BEGIN
  v_got_lock := pg_try_advisory_xact_lock(87231401);
  IF NOT v_got_lock THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'lock_busy');
  END IF;

  v_current := public.utc_iso_week_id(now());
  v_prev := public.previous_utc_iso_week_id(now());

  -- Always attempt previous ISO week plus any other past week_ids without a snapshot
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
      v_snapped := v_snapped || jsonb_build_array(
        jsonb_build_object('week_id', v_week, 'rows', v_count)
      );
    EXCEPTION WHEN OTHERS THEN
      v_snapped := v_snapped || jsonb_build_array(
        jsonb_build_object('week_id', v_week, 'error', SQLERRM)
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'current_week', v_current,
    'previous_week', v_prev,
    'snapped', v_snapped
  );
END;
$$;

-- Clients may trigger lazy rollover (SECURITY DEFINER; no secret data exposed)
GRANT EXECUTE ON FUNCTION public.ensure_weekly_leaderboard_rollover() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.utc_iso_week_id(timestamptz) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.previous_utc_iso_week_id(timestamptz) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- pg_cron: every hour at minute 1 UTC (covers Monday 00:00 UTC week flip)
-- If extension is not available on the project, this block is a no-op.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available: %', SQLERRM;
    RETURN;
  END;

  BEGIN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'weekly_leaderboard_auto_rollover';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'weekly_leaderboard_auto_rollover',
    '1 * * * *',
    $cron$ SELECT public.ensure_weekly_leaderboard_rollover(); $cron$
  );
  RAISE NOTICE 'Scheduled pg_cron job weekly_leaderboard_auto_rollover';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule pg_cron job: %', SQLERRM;
END $$;

-- Run once now so previous week is frozen if already past
SELECT public.ensure_weekly_leaderboard_rollover();
