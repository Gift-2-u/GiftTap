-- =============================================================================
-- WEEKLY: make ALL commit-taps miners visible + rebuild week scores
-- Path: supabase/migrations/20260817r_weekly_sync_all_players.sql
--
-- Why only "some" players synced:
--  1) Hard freeze → only Edge commit-taps can raise weekly_shards
--  2) Client fetch stopped after first non-empty source (partial view)
--  3) Ledger / view / RPC may be missing if 17q not applied
--  4) Old weekly unit was shardsEarned (lags energy); rebuild from tap_batches
--
-- This is SYSTEM infra (not per-player number patches).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.utc_iso_week_id(p_ts timestamptz DEFAULT now())
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT to_char((p_ts AT TIME ZONE 'UTC'), 'IYYY') || '-W' ||
         lpad(to_char((p_ts AT TIME ZONE 'UTC'), 'IW'), 2, '0');
$$;

CREATE TABLE IF NOT EXISTS public.weekly_score_ledger (
  week_id text NOT NULL,
  telegram_id text NOT NULL,
  username text,
  score numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (week_id, telegram_id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_score_ledger_week_score
  ON public.weekly_score_ledger (week_id, score DESC NULLS LAST);

ALTER TABLE public.weekly_score_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS weekly_score_ledger_select_all ON public.weekly_score_ledger;
CREATE POLICY weekly_score_ledger_select_all ON public.weekly_score_ledger
  FOR SELECT TO anon, authenticated
  USING (true);

GRANT SELECT ON public.weekly_score_ledger TO anon, authenticated, service_role;
GRANT ALL ON public.weekly_score_ledger TO service_role, postgres;

CREATE OR REPLACE FUNCTION public.sync_weekly_score_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.weekly_week_id IS NOT NULL
     AND OLD.weekly_week_id IS DISTINCT FROM NEW.weekly_week_id
     AND COALESCE(OLD.weekly_shards, 0) > 0 THEN
    INSERT INTO public.weekly_score_ledger (week_id, telegram_id, username, score, updated_at)
    VALUES (OLD.weekly_week_id, OLD.telegram_id::text, OLD.username, COALESCE(OLD.weekly_shards, 0), now())
    ON CONFLICT (week_id, telegram_id) DO UPDATE SET
      score = GREATEST(public.weekly_score_ledger.score, EXCLUDED.score),
      username = COALESCE(EXCLUDED.username, public.weekly_score_ledger.username),
      updated_at = now();
  END IF;

  IF NEW.weekly_week_id IS NOT NULL AND COALESCE(NEW.weekly_shards, 0) > 0 THEN
    INSERT INTO public.weekly_score_ledger (week_id, telegram_id, username, score, updated_at)
    VALUES (NEW.weekly_week_id, NEW.telegram_id::text, NEW.username, COALESCE(NEW.weekly_shards, 0), now())
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

CREATE OR REPLACE FUNCTION public.upsert_weekly_score_ledger(
  p_week_id text,
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
  IF p_week_id IS NULL OR btrim(p_week_id) = '' OR p_telegram_id IS NULL THEN
    RETURN;
  END IF;
  IF COALESCE(p_score, 0) <= 0 THEN
    RETURN;
  END IF;
  INSERT INTO public.weekly_score_ledger (week_id, telegram_id, username, score, updated_at)
  VALUES (p_week_id, p_telegram_id, p_username, p_score, now())
  ON CONFLICT (week_id, telegram_id) DO UPDATE SET
    score = GREATEST(public.weekly_score_ledger.score, EXCLUDED.score),
    username = COALESCE(NULLIF(btrim(EXCLUDED.username), ''), public.weekly_score_ledger.username),
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_weekly_score_ledger(text, text, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_weekly_score_ledger(text, text, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_weekly_score_ledger(text, text, text, numeric) TO postgres;

-- Rebuild THIS week from durable tap_batches (energy units = weekly score)
DO $$
DECLARE
  v_week text := public.utc_iso_week_id(now());
  v_start timestamptz;
BEGIN
  -- ISO week Monday 00:00 UTC
  v_start := (
    date_trunc('week', (now() AT TIME ZONE 'UTC')) AT TIME ZONE 'UTC'
  );

  WITH sums AS (
    SELECT
      b.player_id::text AS telegram_id,
      SUM(COALESCE(b.energy_spent, b.taps, 0))::numeric AS energy
    FROM public.tap_batches b
    WHERE b.created_at >= v_start
    GROUP BY b.player_id
    HAVING SUM(COALESCE(b.energy_spent, b.taps, 0)) > 0
  )
  UPDATE public.players p
  SET
    weekly_shards = GREATEST(COALESCE(p.weekly_shards, 0), s.energy),
    weekly_week_id = v_week,
    last_updated = now()
  FROM sums s
  WHERE p.telegram_id::text = s.telegram_id
    AND (
      p.weekly_week_id IS DISTINCT FROM v_week
      OR COALESCE(p.weekly_shards, 0) < s.energy
    );

  INSERT INTO public.weekly_score_ledger (week_id, telegram_id, username, score, updated_at)
  SELECT
    v_week,
    p.telegram_id::text,
    p.username,
    COALESCE(p.weekly_shards, 0),
    now()
  FROM public.players p
  WHERE p.weekly_week_id = v_week
    AND COALESCE(p.weekly_shards, 0) > 0
  ON CONFLICT (week_id, telegram_id) DO UPDATE SET
    score = GREATEST(public.weekly_score_ledger.score, EXCLUDED.score),
    username = COALESCE(EXCLUDED.username, public.weekly_score_ledger.username),
    updated_at = now();

  INSERT INTO public.weekly_score_ledger (week_id, telegram_id, username, score, updated_at)
  SELECT
    v_week,
    s.telegram_id,
    p.username,
    s.energy,
    now()
  FROM (
    SELECT
      b.player_id::text AS telegram_id,
      SUM(COALESCE(b.energy_spent, b.taps, 0))::numeric AS energy
    FROM public.tap_batches b
    WHERE b.created_at >= v_start
    GROUP BY b.player_id
    HAVING SUM(COALESCE(b.energy_spent, b.taps, 0)) > 0
  ) s
  LEFT JOIN public.players p ON p.telegram_id::text = s.telegram_id
  ON CONFLICT (week_id, telegram_id) DO UPDATE SET
    score = GREATEST(public.weekly_score_ledger.score, EXCLUDED.score),
    username = COALESCE(EXCLUDED.username, public.weekly_score_ledger.username),
    updated_at = now();
END $$;

DROP VIEW IF EXISTS public.leaderboard_weekly CASCADE;
CREATE VIEW public.leaderboard_weekly AS
SELECT
  x.telegram_id,
  x.username,
  x.weekly_shards,
  x.weekly_shards AS score,
  x.weekly_week_id,
  COALESCE(p.lifetime_taps, 0) AS lifetime_taps,
  COALESCE(p.season_shards, 0) AS season_shards,
  COALESCE(p.shard_balance, 0) AS shard_balance,
  COALESCE(p.max_unlocked_level, 4) AS max_unlocked_level,
  p.wallet_address,
  COALESCE(p.last_updated, x.updated_at) AS last_updated
FROM (
  SELECT
    l.telegram_id,
    COALESCE(NULLIF(btrim(p2.username), ''), NULLIF(btrim(l.username), ''), 'Player') AS username,
    l.score AS weekly_shards,
    l.week_id AS weekly_week_id,
    l.updated_at
  FROM public.weekly_score_ledger l
  LEFT JOIN public.players p2 ON p2.telegram_id::text = l.telegram_id
  WHERE l.week_id = public.utc_iso_week_id(now())
    AND COALESCE(l.score, 0) > 0
) x
LEFT JOIN public.players p ON p.telegram_id::text = x.telegram_id
WHERE x.username IS NOT NULL AND btrim(x.username) <> '';

GRANT SELECT ON public.leaderboard_weekly TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_weekly_leaderboard_live(p_limit int DEFAULT 200)
RETURNS TABLE (
  telegram_id text,
  username text,
  weekly_shards numeric,
  score numeric,
  weekly_week_id text,
  last_updated timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.telegram_id,
    COALESCE(NULLIF(btrim(p.username), ''), NULLIF(btrim(l.username), ''), 'Player') AS username,
    l.score AS weekly_shards,
    l.score AS score,
    l.week_id AS weekly_week_id,
    COALESCE(p.last_updated, l.updated_at) AS last_updated
  FROM public.weekly_score_ledger l
  LEFT JOIN public.players p ON p.telegram_id::text = l.telegram_id
  WHERE l.week_id = public.utc_iso_week_id(now())
    AND COALESCE(l.score, 0) > 0
  ORDER BY l.score DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
$$;

REVOKE ALL ON FUNCTION public.get_weekly_leaderboard_live(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_weekly_leaderboard_live(int) TO anon, authenticated, service_role;

SELECT public.utc_iso_week_id(now()) AS live_week;
SELECT count(*) AS ledger_rows FROM public.weekly_score_ledger
WHERE week_id = public.utc_iso_week_id(now());
SELECT count(*) AS rpc_rows FROM public.get_weekly_leaderboard_live(500);
