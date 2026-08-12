-- Weekly leaderboard (UTC ISO week) — live scores + end-of-week snapshots
-- Run in Supabase SQL Editor if not applied via CLI.

-- Live counters on players (reset each UTC week from the client + guard below)
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS weekly_shards numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_week_id text;

COMMENT ON COLUMN public.players.weekly_shards IS 'Mining score for weekly_week_id (UTC ISO week e.g. 2026-W33)';
COMMENT ON COLUMN public.players.weekly_week_id IS 'ISO week id matching weekly_shards';

CREATE INDEX IF NOT EXISTS idx_players_weekly_week_score
  ON public.players (weekly_week_id, weekly_shards DESC NULLS LAST);

-- Live board: current scores (client filters to current week_id; view exposes all rows)
DROP VIEW IF EXISTS public.leaderboard_weekly CASCADE;
CREATE VIEW public.leaderboard_weekly AS
SELECT
  p.telegram_id,
  p.username,
  COALESCE(p.weekly_shards, 0) AS weekly_shards,
  COALESCE(p.weekly_shards, 0) AS score,
  p.weekly_week_id,
  COALESCE(p.lifetime_taps, 0) AS lifetime_taps,
  COALESCE(p.season_shards, 0) AS season_shards,
  COALESCE(p.shard_balance, 0) AS shard_balance,
  COALESCE(p.max_unlocked_level, 4) AS max_unlocked_level,
  p.wallet_address,
  p.last_updated
FROM public.players p
WHERE p.username IS NOT NULL
  AND btrim(p.username) <> ''
  AND p.weekly_week_id IS NOT NULL
  AND COALESCE(p.weekly_shards, 0) > 0;

GRANT SELECT ON public.leaderboard_weekly TO anon, authenticated, service_role;

-- Snapshots of past weeks (winners archive — like a monthly freeze)
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
-- Inserts typically via service_role / SQL function security definer

-- Badge tier from rank (top 10 only)
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
 * Snapshot top 50 for a week into weekly_leaderboard_snapshots.
 * Call at end of UTC week (cron or manual), e.g.:
 *   SELECT public.snapshot_weekly_leaderboard('2026-W33');
 *   SELECT public.snapshot_weekly_leaderboard(); -- uses max week_id present that is not "current" optional
 */
CREATE OR REPLACE FUNCTION public.snapshot_weekly_leaderboard(p_week_id text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted int := 0;
BEGIN
  IF p_week_id IS NULL OR btrim(p_week_id) = '' THEN
    RAISE EXCEPTION 'p_week_id required (e.g. 2026-W33)';
  END IF;

  -- Replace prior snapshot for that week (re-run safe)
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
    public.weekly_badge_tier_for_rank(r.rnk),
    now()
  FROM (
    SELECT
      p.telegram_id,
      p.username,
      COALESCE(p.weekly_shards, 0) AS score,
      ROW_NUMBER() OVER (ORDER BY COALESCE(p.weekly_shards, 0) DESC, p.telegram_id) AS rnk
    FROM public.players p
    WHERE p.weekly_week_id = p_week_id
      AND COALESCE(p.weekly_shards, 0) > 0
      AND p.username IS NOT NULL
      AND btrim(p.username) <> ''
  ) r
  WHERE r.rnk <= 50;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.snapshot_weekly_leaderboard(text) TO service_role;

-- Optional: season view if missing (app already uses leaderboard_season)
CREATE OR REPLACE VIEW public.leaderboard_season AS
SELECT
  p.telegram_id,
  p.username,
  COALESCE(p.season_shards, 0) AS score,
  COALESCE(p.season_shards, 0) AS season_shards,
  COALESCE(p.lifetime_taps, 0) AS lifetime_taps,
  COALESCE(p.shard_balance, 0) AS shard_balance,
  COALESCE(p.max_unlocked_level, 4) AS max_unlocked_level,
  p.wallet_address,
  p.last_updated
FROM public.players p
WHERE p.username IS NOT NULL AND btrim(p.username) <> '';

GRANT SELECT ON public.leaderboard_season TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- BACKFILL: put every player who already played *this* UTC ISO week on the board
-- (they only had client inventory.weekly_lb or daily_taps — not weekly_shards)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_week text;
BEGIN
  v_week :=
    to_char((now() AT TIME ZONE 'UTC'), 'IYYY')
    || '-W'
    || lpad(to_char((now() AT TIME ZONE 'UTC'), 'IW'), 2, '0');

  UPDATE public.players p
  SET
    weekly_week_id = v_week,
    weekly_shards = GREATEST(
      COALESCE(p.weekly_shards, 0),
      CASE
        WHEN p.weekly_week_id IS NOT DISTINCT FROM v_week THEN COALESCE(p.weekly_shards, 0)
        ELSE 0
      END,
      CASE
        WHEN p.inventory ? 'weekly_lb'
          AND (p.inventory->'weekly_lb'->>'weekId') = v_week
        THEN COALESCE((p.inventory->'weekly_lb'->>'score')::numeric, 0)
        ELSE 0
      END,
      -- Anyone who tapped on a day in this ISO week: at least today's daily_taps if last tap is this week
      CASE
        WHEN p.last_tap_date IS NOT NULL
          AND (
            to_char(p.last_tap_date::date, 'IYYY')
            || '-W'
            || lpad(to_char(p.last_tap_date::date, 'IW'), 2, '0')
          ) = v_week
        THEN COALESCE(p.daily_taps, 0)
        ELSE 0
      END
    ),
    last_updated = COALESCE(p.last_updated, now())
  WHERE
    p.username IS NOT NULL
    AND btrim(p.username) <> ''
    AND (
      (p.weekly_week_id IS NOT DISTINCT FROM v_week AND COALESCE(p.weekly_shards, 0) > 0)
      OR (
        p.inventory ? 'weekly_lb'
        AND (p.inventory->'weekly_lb'->>'weekId') = v_week
        AND COALESCE((p.inventory->'weekly_lb'->>'score')::numeric, 0) > 0
      )
      OR (
        p.last_tap_date IS NOT NULL
        AND (
          to_char(p.last_tap_date::date, 'IYYY')
          || '-W'
          || lpad(to_char(p.last_tap_date::date, 'IW'), 2, '0')
        ) = v_week
        AND COALESCE(p.daily_taps, 0) > 0
      )
    );

  RAISE NOTICE 'Backfilled weekly board for week %', v_week;
END $$;
