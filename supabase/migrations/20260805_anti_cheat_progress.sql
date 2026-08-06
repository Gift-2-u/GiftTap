-- ============================================================
-- Gift Tap ANTI-CHEAT — run in Supabase SQL Editor
-- Stops client from writing 1M lifetime_taps in one shot.
-- Also helpers to find / reset hacked leaderboard rows.
-- ============================================================

-- ---------- 1) SEE WHO HACKED (inspect first) ----------
-- SELECT telegram_id, username, lifetime_taps, season_shards, shard_balance,
--        max_daily_limit, last_updated
-- FROM public.players
-- WHERE COALESCE(lifetime_taps, 0) >= 100000
-- ORDER BY lifetime_taps DESC
-- LIMIT 50;

-- ---------- 2) ZERO OBVIOUS CHEATERS (edit threshold) ----------
-- 1,000,000 taps is not reachable quickly without bots of bots.
-- Adjust WHERE to match the hacker usernames if you know them.
/*
UPDATE public.players
SET
  lifetime_taps = 0,
  season_shards = 0,
  shard_balance = LEAST(COALESCE(shard_balance, 0), 1000),
  daily_taps = 0,
  last_updated = now()
WHERE COALESCE(lifetime_taps, 0) >= 100000;
*/

-- ---------- 3) ANTI-CHEAT TRIGGER ----------
-- Caps how much lifetime_taps / season_shards / shard_balance
-- can increase in a single UPDATE based on time since last_updated.
-- Admin can still LOWER stats anytime.

CREATE OR REPLACE FUNCTION public.players_anti_cheat_progress()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  elapsed_sec double precision;
  max_gain bigint;
  gain_life bigint;
  gain_season bigint;
  gain_shards bigint;
  daily_cap bigint;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Allow decreases (admin fixes)
  gain_life := COALESCE(NEW.lifetime_taps, 0) - COALESCE(OLD.lifetime_taps, 0);
  gain_season := COALESCE(NEW.season_shards, 0) - COALESCE(OLD.season_shards, 0);
  gain_shards := COALESCE(NEW.shard_balance, 0) - COALESCE(OLD.shard_balance, 0);

  -- Time since last progress (cap lookback so AFK accounts cannot bank infinite one-shot gains)
  elapsed_sec := EXTRACT(EPOCH FROM (now() - COALESCE(OLD.last_updated, now() - interval '1 hour')));
  IF elapsed_sec IS NULL OR elapsed_sec < 1 THEN
    elapsed_sec := 1;
  END IF;
  -- Max 48 hours of banked progress in one update (offline bot window)
  IF elapsed_sec > 172800 THEN
    elapsed_sec := 172800;
  END IF;

  daily_cap := GREATEST(COALESCE(OLD.max_daily_limit, 1000), COALESCE(NEW.max_daily_limit, 1000), 1000);
  -- 2.5x daily cap per day of elapsed + small burst for multi-touch saves
  max_gain := CEIL(elapsed_sec / 86400.0 * daily_cap * 2.5)::bigint + 300;
  -- Hard ceiling per single UPDATE (even with long offline)
  IF max_gain > 80000 THEN
    max_gain := 80000;
  END IF;

  IF gain_life > max_gain THEN
    RAISE EXCEPTION 'ANTI_CHEAT: lifetime_taps +% exceeds max % (%.0fs window)',
      gain_life, max_gain, elapsed_sec
      USING ERRCODE = 'check_violation';
  END IF;

  IF gain_season > max_gain THEN
    RAISE EXCEPTION 'ANTI_CHEAT: season_shards +% exceeds max %',
      gain_season, max_gain
      USING ERRCODE = 'check_violation';
  END IF;

  -- Shard balance can also be inflated; allow more room for spends/refunds noise
  IF gain_shards > max_gain + 50000 THEN
    RAISE EXCEPTION 'ANTI_CHEAT: shard_balance +% exceeds max %',
      gain_shards, max_gain + 50000
      USING ERRCODE = 'check_violation';
  END IF;

  -- Absolute sanity: reject absurd totals on brand-new rows (optional soft flag)
  -- 5M+ lifetime is almost certainly cheat on this game economy
  IF COALESCE(NEW.lifetime_taps, 0) > 5000000 THEN
    RAISE EXCEPTION 'ANTI_CHEAT: lifetime_taps % over absolute cap',
      NEW.lifetime_taps
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_players_anti_cheat ON public.players;
CREATE TRIGGER trg_players_anti_cheat
  BEFORE UPDATE ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.players_anti_cheat_progress();

-- Note: some Postgres versions use EXECUTE PROCEDURE instead of EXECUTE FUNCTION.
-- If create trigger fails, replace the last line with:
--   EXECUTE PROCEDURE public.players_anti_cheat_progress();

COMMENT ON FUNCTION public.players_anti_cheat_progress() IS
  'Caps progress gains per update based on time elapsed. Stops open client writes of 1M taps.';

-- ---------- 4) Leaderboard view unchanged (still ranks lifetime_taps) ----------
-- After reset, cheaters fall off top.

-- ---------- 5) Optional: ban list column ----------
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false;

-- Hide banned from leaderboard
DROP VIEW IF EXISTS public.leaderboard_all_time CASCADE;
CREATE VIEW public.leaderboard_all_time AS
SELECT
  p.telegram_id,
  p.username,
  COALESCE(p.lifetime_taps, 0) AS lifetime_taps,
  COALESCE(p.season_shards, 0) AS season_shards,
  COALESCE(p.shard_balance, 0) AS shard_balance,
  COALESCE(p.max_unlocked_level, 4) AS max_unlocked_level,
  p.wallet_address,
  p.last_updated
FROM public.players p
WHERE p.username IS NOT NULL
  AND btrim(p.username) <> ''
  AND COALESCE(p.is_banned, false) = false;

GRANT SELECT ON public.leaderboard_all_time TO anon, authenticated, service_role;

-- Hide from season board too if that view exists
DROP VIEW IF EXISTS public.leaderboard_season CASCADE;
CREATE VIEW public.leaderboard_season AS
SELECT
  p.telegram_id,
  p.username,
  COALESCE(p.season_shards, 0) AS score,
  COALESCE(p.season_shards, 0) AS season_shards,
  COALESCE(p.lifetime_taps, 0) AS lifetime_taps,
  COALESCE(p.shard_balance, 0) AS shard_balance,
  p.wallet_address,
  p.last_updated
FROM public.players p
WHERE p.username IS NOT NULL
  AND btrim(p.username) <> ''
  AND COALESCE(p.is_banned, false) = false;

GRANT SELECT ON public.leaderboard_season TO anon, authenticated, service_role;

-- Ban a hacker after you identify them:
-- UPDATE public.players SET is_banned = true, lifetime_taps = 0, season_shards = 0 WHERE username ILIKE 'theirname';
