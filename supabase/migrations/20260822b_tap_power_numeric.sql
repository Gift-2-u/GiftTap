-- tap_power must store decimals (L5 1.15 + Echo 1.1 = 1.25).
-- Was integer → 1.25 rejected. View leaderboard_all_time depended on the column.

DROP VIEW IF EXISTS public.leaderboard_all_time CASCADE;

ALTER TABLE public.players
  ALTER COLUMN tap_power TYPE numeric USING tap_power::numeric;

ALTER TABLE public.players
  ALTER COLUMN tap_power SET DEFAULT 1;

COMMENT ON COLUMN public.players.tap_power IS
  'Base mining power (additive level+echo+premium). Frenzy doubles at payout; column stays base (e.g. 1.25).';

-- Recreate all-time board (do NOT alias tap_power as level)
CREATE OR REPLACE VIEW public.leaderboard_all_time AS
SELECT
  p.telegram_id,
  p.username,
  COALESCE(p.lifetime_taps, 0) AS lifetime_taps,
  COALESCE(p.season_shards, 0) AS season_shards,
  COALESCE(p.shard_balance, 0) AS shard_balance,
  COALESCE(p.max_unlocked_level, 4) AS max_unlocked_level,
  COALESCE(p.tap_power, 1) AS tap_power,
  p.wallet_address,
  p.last_updated
FROM public.players p
WHERE p.username IS NOT NULL AND btrim(p.username) <> '';

GRANT SELECT ON public.leaderboard_all_time TO anon, authenticated, service_role;
