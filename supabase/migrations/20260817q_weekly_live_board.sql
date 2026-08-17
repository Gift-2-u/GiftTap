-- =============================================================================
-- WEEKLY LEADERBOARD LIVE SYNC (system fix — all players)
-- Path: /home/tower/gift_memecoin/supabase/migrations/20260817q_weekly_live_board.sql
--
-- Problem: hard security froze client weekly_shards writes; board view only
-- read players.weekly_* so ranks went empty / stuck while UI showed local taps.
--
-- Fix:
--  1) Durable weekly_score_ledger + trigger (GREATEST on any weekly_* write)
--  2) leaderboard_weekly view reads LIVE week from ledger (+ players fallback)
--  3) Backfill ledger from existing players + inventory.weekly_lb
-- Client: taps must go through commit-taps (service_role) — already wired in GiftTap.
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

GRANT SELECT ON public.weekly_score_ledger TO anon, authenticated, service_role;
GRANT ALL ON public.weekly_score_ledger TO service_role, postgres;

CREATE OR REPLACE FUNCTION public.sync_weekly_score_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Preserve previous week score when week_id rolls
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

-- Backfill from players.weekly_*
INSERT INTO public.weekly_score_ledger (week_id, telegram_id, username, score, updated_at)
SELECT
  p.weekly_week_id,
  p.telegram_id::text,
  p.username,
  COALESCE(p.weekly_shards, 0),
  COALESCE(p.last_updated, now())
FROM public.players p
WHERE p.weekly_week_id IS NOT NULL
  AND btrim(p.weekly_week_id) <> ''
  AND COALESCE(p.weekly_shards, 0) > 0
  AND p.telegram_id IS NOT NULL
ON CONFLICT (week_id, telegram_id) DO UPDATE SET
  score = GREATEST(public.weekly_score_ledger.score, EXCLUDED.score),
  username = COALESCE(EXCLUDED.username, public.weekly_score_ledger.username),
  updated_at = GREATEST(public.weekly_score_ledger.updated_at, EXCLUDED.updated_at);

-- Backfill from inventory.weekly_lb
INSERT INTO public.weekly_score_ledger (week_id, telegram_id, username, score, updated_at)
SELECT
  p.inventory->'weekly_lb'->>'weekId',
  p.telegram_id::text,
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

-- Live board: current ISO week from ledger + players not yet in ledger
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
  UNION ALL
  SELECT
    p.telegram_id::text,
    COALESCE(NULLIF(btrim(p.username), ''), 'Player'),
    COALESCE(p.weekly_shards, 0),
    p.weekly_week_id,
    p.last_updated
  FROM public.players p
  WHERE p.weekly_week_id = public.utc_iso_week_id(now())
    AND COALESCE(p.weekly_shards, 0) > 0
    AND p.telegram_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.weekly_score_ledger l2
      WHERE l2.week_id = public.utc_iso_week_id(now())
        AND l2.telegram_id = p.telegram_id::text
    )
) x
LEFT JOIN public.players p ON p.telegram_id::text = x.telegram_id
WHERE x.username IS NOT NULL AND btrim(x.username) <> '';

GRANT SELECT ON public.leaderboard_weekly TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.utc_iso_week_id(timestamptz) TO anon, authenticated, service_role;

-- Sanity
SELECT public.utc_iso_week_id(now()) AS live_week;
SELECT count(*) AS ledger_rows_this_week
FROM public.weekly_score_ledger
WHERE week_id = public.utc_iso_week_id(now());
SELECT count(*) AS view_rows FROM public.leaderboard_weekly;
SELECT telegram_id, username, weekly_shards
FROM public.leaderboard_weekly
ORDER BY weekly_shards DESC
LIMIT 15;

-- RPC for Edge commit-taps (GREATEST, never lower score)
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
  IF p_week_id IS NULL OR btrim(p_week_id) = ' OR p_telegram_id IS NULL THEN
    RETURN;
  END IF;
  IF COALESCE(p_score, 0) <= 0 THEN
    RETURN;
  END IF;
  INSERT INTO public.weekly_score_ledger (week_id, telegram_id, username, score, updated_at)
  VALUES (p_week_id, p_telegram_id, p_username, p_score, now())
  ON CONFLICT (week_id, telegram_id) DO UPDATE SET
    score = GREATEST(public.weekly_score_ledger.score, EXCLUDED.score),
    username = COALESCE(NULLIF(btrim(EXCLUDED.username), '), public.weekly_score_ledger.username),
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_weekly_score_ledger(text, text, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_weekly_score_ledger(text, text, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_weekly_score_ledger(text, text, text, numeric) TO postgres;
