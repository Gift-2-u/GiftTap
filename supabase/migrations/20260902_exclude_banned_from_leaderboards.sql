-- Hide banned players from ranks (season / lifetime / weekly).
-- Safe if is_banned missing on older envs: COALESCE(..., false).

DROP VIEW IF EXISTS public.leaderboard_season CASCADE;
CREATE VIEW public.leaderboard_season AS
SELECT
  x.telegram_id,
  x.username,
  x.score,
  x.score AS season_shards,
  COALESCE(p.lifetime_taps, 0) AS lifetime_taps,
  COALESCE(p.shard_balance, 0) AS shard_balance,
  COALESCE(p.max_unlocked_level, 4) AS max_unlocked_level,
  p.wallet_address,
  COALESCE(p.last_updated, x.updated_at) AS last_updated
FROM (
  SELECT
    l.telegram_id,
    COALESCE(NULLIF(btrim(p2.username), ''), NULLIF(btrim(l.username), ''), 'Player') AS username,
    l.score,
    l.updated_at
  FROM public.season_score_ledger l
  LEFT JOIN public.players p2 ON p2.telegram_id::text = l.telegram_id
  WHERE COALESCE(l.score, 0) > 0
    AND COALESCE(p2.is_banned, false) = false
  UNION ALL
  SELECT
    p.telegram_id::text,
    COALESCE(NULLIF(btrim(p.username), ''), 'Player'),
    COALESCE(p.season_shards, 0),
    p.last_updated
  FROM public.players p
  WHERE COALESCE(p.season_shards, 0) > 0
    AND p.telegram_id IS NOT NULL
    AND COALESCE(p.is_banned, false) = false
    AND NOT EXISTS (
      SELECT 1 FROM public.season_score_ledger l2
      WHERE l2.telegram_id = p.telegram_id::text
    )
) x
LEFT JOIN public.players p ON p.telegram_id::text = x.telegram_id
WHERE x.username IS NOT NULL AND btrim(x.username) <> ''
  AND COALESCE(p.is_banned, false) = false;

GRANT SELECT ON public.leaderboard_season TO anon, authenticated, service_role;

DROP VIEW IF EXISTS public.leaderboard_all_time CASCADE;
CREATE VIEW public.leaderboard_all_time AS
SELECT
  x.telegram_id,
  x.username,
  x.score AS lifetime_taps,
  COALESCE(p.season_shards, 0) AS season_shards,
  COALESCE(p.shard_balance, 0) AS shard_balance,
  COALESCE(p.max_unlocked_level, 4) AS max_unlocked_level,
  COALESCE(p.tap_power, 1) AS tap_power,
  p.wallet_address,
  COALESCE(p.last_updated, x.updated_at) AS last_updated
FROM (
  SELECT
    l.telegram_id,
    COALESCE(NULLIF(btrim(p2.username), ''), NULLIF(btrim(l.username), ''), 'Player') AS username,
    l.score,
    l.updated_at
  FROM public.lifetime_score_ledger l
  LEFT JOIN public.players p2 ON p2.telegram_id::text = l.telegram_id
  WHERE COALESCE(l.score, 0) > 0
    AND COALESCE(p2.is_banned, false) = false
  UNION ALL
  SELECT
    p.telegram_id::text,
    COALESCE(NULLIF(btrim(p.username), ''), 'Player'),
    COALESCE(p.lifetime_taps, 0),
    p.last_updated
  FROM public.players p
  WHERE COALESCE(p.lifetime_taps, 0) > 0
    AND p.telegram_id IS NOT NULL
    AND COALESCE(p.is_banned, false) = false
    AND NOT EXISTS (
      SELECT 1 FROM public.lifetime_score_ledger l2
      WHERE l2.telegram_id = p.telegram_id::text
    )
) x
LEFT JOIN public.players p ON p.telegram_id::text = x.telegram_id
WHERE x.username IS NOT NULL AND btrim(x.username) <> ''
  AND COALESCE(p.is_banned, false) = false;

GRANT SELECT ON public.leaderboard_all_time TO anon, authenticated, service_role;

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
    AND COALESCE(p2.is_banned, false) = false
) x
LEFT JOIN public.players p ON p.telegram_id::text = x.telegram_id
WHERE x.username IS NOT NULL AND btrim(x.username) <> ''
  AND COALESCE(p.is_banned, false) = false;

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
    AND COALESCE(p.is_banned, false) = false
  ORDER BY l.score DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
$$;

REVOKE ALL ON FUNCTION public.get_weekly_leaderboard_live(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_weekly_leaderboard_live(int) TO anon, authenticated, service_role;
