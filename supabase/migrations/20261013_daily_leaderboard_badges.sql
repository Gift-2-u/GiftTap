-- =============================================================================
-- Daily leaderboard + badges (mirror weekly W36+ cuts)
-- Score: players.daily_shards (payout-weighted mining for the UTC day)
-- Floor: 200 (= 20% × 1000 × 1 day)
-- Cuts: top 5% Diamond · 10% Gold · 15% Silver · rest Bronze
-- Claim: next UTC day via badge-claim-daily / auto-grant on rollover
-- Safe to paste in Supabase SQL Editor (idempotent).
-- =============================================================================

-- Durable per-day scores (survive UTC day-roll zeroing of players.daily_shards)
CREATE TABLE IF NOT EXISTS public.daily_score_ledger (
  day_id text NOT NULL,
  telegram_id text NOT NULL,
  username text,
  score numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day_id, telegram_id)
);
CREATE INDEX IF NOT EXISTS idx_daily_score_ledger_day_score
  ON public.daily_score_ledger (day_id, score DESC);
GRANT SELECT ON public.daily_score_ledger TO anon, authenticated, service_role;
GRANT ALL ON public.daily_score_ledger TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_daily_score_ledger(
  p_day_id text,
  p_telegram_id text,
  p_username text,
  p_score numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_day_id IS NULL OR p_telegram_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.daily_score_ledger (day_id, telegram_id, username, score, updated_at)
  VALUES (
    p_day_id,
    p_telegram_id,
    NULLIF(btrim(COALESCE(p_username, '')), ''),
    GREATEST(0, COALESCE(p_score, 0)),
    now()
  )
  ON CONFLICT (day_id, telegram_id) DO UPDATE SET
    score = GREATEST(public.daily_score_ledger.score, EXCLUDED.score),
    username = COALESCE(EXCLUDED.username, public.daily_score_ledger.username),
    updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_daily_score_ledger(text, text, text, numeric)
  TO service_role;

CREATE TABLE IF NOT EXISTS public.daily_leaderboard_snapshots (
  id bigserial PRIMARY KEY,
  day_id text NOT NULL,
  rank int NOT NULL CHECK (rank >= 1),
  telegram_id text,
  username text,
  score numeric NOT NULL DEFAULT 0,
  badge_tier text,
  snapped_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day_id, rank)
);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_day
  ON public.daily_leaderboard_snapshots (day_id, rank);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_player
  ON public.daily_leaderboard_snapshots (day_id, telegram_id);
GRANT SELECT ON public.daily_leaderboard_snapshots TO anon, authenticated, service_role;
GRANT ALL ON public.daily_leaderboard_snapshots TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.daily_leaderboard_snapshots_id_seq TO service_role;

CREATE TABLE IF NOT EXISTS public.daily_badge_grants (
  id bigserial PRIMARY KEY,
  player_id text NOT NULL,
  day_id text NOT NULL,
  rank int,
  tier text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, day_id)
);
CREATE INDEX IF NOT EXISTS idx_daily_badge_grants_day
  ON public.daily_badge_grants (day_id, tier);
GRANT SELECT ON public.daily_badge_grants TO anon, authenticated, service_role;
GRANT ALL ON public.daily_badge_grants TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.daily_badge_grants_id_seq TO service_role;

CREATE TABLE IF NOT EXISTS public.daily_board_meta (
  day_id text PRIMARY KEY,
  snapped_at timestamptz,
  snap_rows int,
  finalized_at timestamptz,
  notes text
);
GRANT SELECT ON public.daily_board_meta TO anon, authenticated, service_role;
GRANT ALL ON public.daily_board_meta TO service_role;

CREATE OR REPLACE FUNCTION public.utc_day_id(p_ts timestamptz DEFAULT now())
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT to_char((p_ts AT TIME ZONE 'UTC'), 'YYYY-MM-DD');
$$;

CREATE OR REPLACE FUNCTION public.previous_utc_day_id(p_ts timestamptz DEFAULT now())
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT to_char(((p_ts AT TIME ZONE 'UTC')::date - 1), 'YYYY-MM-DD');
$$;

CREATE OR REPLACE FUNCTION public.daily_badge_floor()
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 200::numeric; -- 20% × 1000 × 1 day
$$;

-- Same %-cuts as weekly W36+ (always tight for daily)
CREATE OR REPLACE FUNCTION public.daily_badge_tier_for_rank(
  p_rank int,
  p_total int DEFAULT 0
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
  over int;
BEGIN
  IF p_rank IS NULL OR p_rank < 1 THEN
    RETURN NULL;
  END IF;
  IF n < 1 OR p_rank > n THEN
    RETURN NULL;
  END IF;
  IF p_rank > 100 THEN
    RETURN 'bronze';
  END IF;
  paid_n := LEAST(100, n);
  d := GREATEST(CASE WHEN paid_n >= 1 THEN 1 ELSE 0 END, ROUND(paid_n * 0.05)::int);
  g := GREATEST(CASE WHEN paid_n >= 2 THEN 1 ELSE 0 END, ROUND(paid_n * 0.10)::int);
  s := GREATEST(CASE WHEN paid_n >= 3 THEN 1 ELSE 0 END, ROUND(paid_n * 0.15)::int);
  over := d + g + s - paid_n;
  IF over > 0 THEN
    IF s >= over THEN s := s - over; over := 0;
    ELSE over := over - s; s := 0; END IF;
    IF over > 0 AND g >= over THEN g := g - over; over := 0;
    ELSIF over > 0 THEN over := over - g; g := 0; END IF;
    IF over > 0 THEN d := GREATEST(0, d - over); END IF;
  END IF;
  IF p_rank <= d THEN RETURN 'diamond'; END IF;
  IF p_rank <= d + g THEN RETURN 'gold'; END IF;
  IF p_rank <= d + g + s THEN RETURN 'silver'; END IF;
  RETURN 'bronze';
END;
$$;

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

  -- Prefer durable ledger; fall back to live players.daily_shards for that day
  SELECT COUNT(*)::int INTO v_total
  FROM (
    SELECT l.telegram_id
    FROM public.daily_score_ledger l
    LEFT JOIN public.players pb ON pb.telegram_id = l.telegram_id
    WHERE l.day_id = p_day_id
      AND COALESCE(l.score, 0) >= v_floor
      AND l.telegram_id IS NOT NULL
      AND btrim(l.telegram_id) <> ''
      AND COALESCE(l.username, pb.username) IS NOT NULL
      AND btrim(COALESCE(l.username, pb.username, '')) <> ''
      AND COALESCE(pb.is_banned, false) = false
    UNION
    SELECT p.telegram_id
    FROM public.players p
    WHERE COALESCE(p.daily_shards, 0) >= v_floor
      AND p.last_tap_date IS NOT NULL
      AND to_char(p.last_tap_date::date, 'YYYY-MM-DD') = p_day_id
      AND p.telegram_id IS NOT NULL
      AND btrim(p.telegram_id) <> ''
      AND p.username IS NOT NULL AND btrim(p.username) <> ''
      AND COALESCE(p.is_banned, false) = false
      AND NOT EXISTS (
        SELECT 1 FROM public.daily_score_ledger l2
        WHERE l2.day_id = p_day_id AND l2.telegram_id = p.telegram_id
      )
  ) c;

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
      s.telegram_id,
      s.username,
      s.score,
      ROW_NUMBER() OVER (ORDER BY s.score DESC, s.telegram_id) AS rnk
    FROM (
      SELECT
        l.telegram_id,
        COALESCE(NULLIF(btrim(l.username), ''), pb.username) AS username,
        COALESCE(l.score, 0) AS score
      FROM public.daily_score_ledger l
      LEFT JOIN public.players pb ON pb.telegram_id = l.telegram_id
      WHERE l.day_id = p_day_id
        AND COALESCE(l.score, 0) >= v_floor
        AND l.telegram_id IS NOT NULL
        AND btrim(l.telegram_id) <> ''
        AND COALESCE(pb.is_banned, false) = false
      UNION ALL
      SELECT
        p.telegram_id,
        p.username,
        COALESCE(p.daily_shards, 0) AS score
      FROM public.players p
      WHERE COALESCE(p.daily_shards, 0) >= v_floor
        AND p.last_tap_date IS NOT NULL
        AND to_char(p.last_tap_date::date, 'YYYY-MM-DD') = p_day_id
        AND p.telegram_id IS NOT NULL
        AND btrim(p.telegram_id) <> ''
        AND p.username IS NOT NULL AND btrim(p.username) <> ''
        AND COALESCE(p.is_banned, false) = false
        AND NOT EXISTS (
          SELECT 1 FROM public.daily_score_ledger l2
          WHERE l2.day_id = p_day_id AND l2.telegram_id = p.telegram_id
        )
    ) s
    WHERE s.username IS NOT NULL AND btrim(s.username) <> ''
  ) r
  WHERE public.daily_badge_tier_for_rank(r.rnk::int, v_total) IS NOT NULL;

  GET DIAGNOSTICS inserted = ROW_COUNT;

  INSERT INTO public.daily_board_meta (day_id, snapped_at, snap_rows, finalized_at, notes)
  VALUES (
    p_day_id,
    now(),
    inserted,
    now(),
    format('snapshot floor>=%s eligible=%s cuts=5/10/15', v_floor, v_total)
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

-- Auto-grant badges into backpack after snapshot (idempotent)
CREATE OR REPLACE FUNCTION public.grant_daily_badges_from_snapshot(p_day_id text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  granted int := 0;
  inv jsonb;
  item_id text;
  claim_key text;
  log_arr jsonb;
  have int;
BEGIN
  IF p_day_id IS NULL OR btrim(p_day_id) = '' THEN
    RAISE EXCEPTION 'p_day_id required';
  END IF;

  FOR r IN
    SELECT s.telegram_id, s.rank, s.badge_tier, s.score
    FROM public.daily_leaderboard_snapshots s
    WHERE s.day_id = p_day_id
      AND s.badge_tier IS NOT NULL
      AND s.telegram_id IS NOT NULL
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.daily_badge_grants g
      WHERE g.player_id = r.telegram_id AND g.day_id = p_day_id
    ) THEN
      CONTINUE;
    END IF;

    item_id := CASE lower(r.badge_tier)
      WHEN 'diamond' THEN 'badge_diamond'
      WHEN 'gold' THEN 'badge_gold'
      WHEN 'silver' THEN 'badge_silver'
      WHEN 'bronze' THEN 'badge_bronze'
      ELSE NULL
    END;
    IF item_id IS NULL THEN CONTINUE; END IF;

    claim_key := 'daily_badge:' || p_day_id || ':award';

    SELECT COALESCE(p.inventory, '{}'::jsonb) INTO inv
    FROM public.players p WHERE p.telegram_id = r.telegram_id FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    log_arr := COALESCE(inv->'claim_log', '[]'::jsonb);
    IF jsonb_typeof(log_arr) <> 'array' THEN log_arr := '[]'::jsonb; END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(log_arr) x WHERE x = claim_key
    ) THEN
      INSERT INTO public.daily_badge_grants (player_id, day_id, rank, tier)
      VALUES (r.telegram_id, p_day_id, r.rank, lower(r.badge_tier))
      ON CONFLICT (player_id, day_id) DO NOTHING;
      CONTINUE;
    END IF;

    have := COALESCE((inv->>item_id)::int, 0);
    inv := jsonb_set(inv, ARRAY[item_id], to_jsonb(have + 1), true);
    inv := jsonb_set(inv, '{daily_badge_award}', jsonb_build_object(
      'dayId', p_day_id,
      'tier', lower(r.badge_tier),
      'rank', r.rank,
      'claimedAt', now()
    ), true);
    log_arr := log_arr || to_jsonb(claim_key);
    inv := jsonb_set(inv, '{claim_log}', log_arr, true);

    UPDATE public.players
    SET inventory = inv
    WHERE telegram_id = r.telegram_id;

    INSERT INTO public.daily_badge_grants (player_id, day_id, rank, tier)
    VALUES (r.telegram_id, p_day_id, r.rank, lower(r.badge_tier))
    ON CONFLICT (player_id, day_id) DO NOTHING;

    granted := granted + 1;
  END LOOP;

  RETURN granted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_daily_badges_from_snapshot(text) TO service_role;

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
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.daily_board_meta m
    WHERE m.day_id = prev_day AND m.finalized_at IS NOT NULL
  ) THEN
    RETURN format('already finalized %s', prev_day);
  END IF;

  -- Snapshot while yesterday's last_tap_date rows may still hold daily_shards
  n := public.snapshot_daily_leaderboard(prev_day);
  g := public.grant_daily_badges_from_snapshot(prev_day);
  RETURN format('day=%s snap=%s granted=%s', prev_day, n, g);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_daily_leaderboard_rollover() TO anon, authenticated, service_role;

-- Cron: shortly after UTC midnight (before heavy play day-rolls wipe scores)
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
    WHERE jobname = 'daily_leaderboard_auto_rollover';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  PERFORM cron.schedule(
    'daily_leaderboard_auto_rollover',
    '5 0 * * *',
    $cron$ SELECT public.ensure_daily_leaderboard_rollover(); $cron$
  );
  RAISE NOTICE 'Scheduled pg_cron job daily_leaderboard_auto_rollover (00:05 UTC)';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule daily cron: %', SQLERRM;
END;
$$;
