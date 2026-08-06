-- ============================================================
-- Gift Tap MAXIMUM SECURITY progress lock
-- Run in Supabase SQL Editor (once).
-- After this, lifetime_taps / season_shards can ONLY increase via
-- the save-progress Edge Function (service_role).
-- ============================================================

-- Session token for progress API (set by auth-login / auth-register / save-progress)
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS progress_token text,
  ADD COLUMN IF NOT EXISTS progress_token_expires timestamptz,
  ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS players_progress_token_idx
  ON public.players (progress_token)
  WHERE progress_token IS NOT NULL;

-- ---------- Strict gate: clients cannot inflate progress ----------
CREATE OR REPLACE FUNCTION public.players_secure_progress_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_name text;
  gain_life bigint;
  gain_season bigint;
  gain_shards bigint;
  elapsed_sec double precision;
  max_gain bigint;
  daily_cap bigint;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Who is writing? service_role = Edge Functions with service key
  BEGIN
    role_name := coalesce(
      auth.jwt() ->> 'role',
      current_setting('request.jwt.claim.role', true),
      ''
    );
  EXCEPTION WHEN OTHERS THEN
    role_name := '';
  END;

  gain_life := COALESCE(NEW.lifetime_taps, 0) - COALESCE(OLD.lifetime_taps, 0);
  gain_season := COALESCE(NEW.season_shards, 0) - COALESCE(OLD.season_shards, 0);
  gain_shards := COALESCE(NEW.shard_balance, 0) - COALESCE(OLD.shard_balance, 0);

  -- Banned accounts: freeze progress increases
  IF COALESCE(OLD.is_banned, false) = true OR COALESCE(NEW.is_banned, false) = true THEN
    IF gain_life > 0 OR gain_season > 0 OR gain_shards > 0 THEN
      RAISE EXCEPTION 'ACCOUNT_BANNED'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Non-service clients: NO inflation of lifetime / season (leaderboard-critical)
  IF role_name IS DISTINCT FROM 'service_role' THEN
    IF gain_life > 0 THEN
      RAISE EXCEPTION 'PROGRESS_LOCKED: lifetime_taps only via save-progress'
        USING ERRCODE = 'check_violation';
    END IF;
    IF gain_season > 0 THEN
      RAISE EXCEPTION 'PROGRESS_LOCKED: season_shards only via save-progress'
        USING ERRCODE = 'check_violation';
    END IF;
    -- shard_balance: allow decreases (shop); allow tiny referral credits only
    IF gain_shards > 3000 THEN
      RAISE EXCEPTION 'PROGRESS_LOCKED: shard_balance increase too large'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- service_role: still enforce hard rate limits (compromised key / bugs)
  IF gain_life > 0 OR gain_season > 0 THEN
    elapsed_sec := EXTRACT(EPOCH FROM (now() - COALESCE(OLD.last_updated, now() - interval '10 seconds')));
    IF elapsed_sec < 1 THEN elapsed_sec := 1; END IF;
    -- Max 3 hours banked for one validated save (edge function should save often)
    IF elapsed_sec > 10800 THEN elapsed_sec := 10800; END IF;

    daily_cap := GREATEST(COALESCE(OLD.max_daily_limit, 1000), COALESCE(NEW.max_daily_limit, 1000), 1000);
    -- Strict: cannot earn more than daily_cap per real day of elapsed (+50 burst)
    max_gain := CEIL(elapsed_sec / 86400.0 * daily_cap)::bigint + 50;
    IF max_gain > daily_cap THEN
      max_gain := daily_cap; -- never more than one full day per update
    END IF;

    IF gain_life > max_gain THEN
      RAISE EXCEPTION 'ANTI_CHEAT: lifetime +% > max % (%.0fs)', gain_life, max_gain, elapsed_sec
        USING ERRCODE = 'check_violation';
    END IF;
    IF gain_season > max_gain THEN
      RAISE EXCEPTION 'ANTI_CHEAT: season +% > max %', gain_season, max_gain
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Daily taps cannot exceed daily limit
  IF COALESCE(NEW.daily_taps, 0) > GREATEST(COALESCE(NEW.max_daily_limit, 1000), 1000) + 50 THEN
    RAISE EXCEPTION 'ANTI_CHEAT: daily_taps over cap'
      USING ERRCODE = 'check_violation';
  END IF;

  IF COALESCE(NEW.lifetime_taps, 0) > 2000000 THEN
    RAISE EXCEPTION 'ANTI_CHEAT: lifetime absolute cap'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_players_anti_cheat ON public.players;
DROP TRIGGER IF EXISTS trg_players_secure_progress ON public.players;
CREATE TRIGGER trg_players_secure_progress
  BEFORE UPDATE ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.players_secure_progress_gate();

-- Leaderboards hide banned
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
WHERE p.username IS NOT NULL AND btrim(p.username) <> ''
  AND COALESCE(p.is_banned, false) = false;
GRANT SELECT ON public.leaderboard_all_time TO anon, authenticated, service_role;

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
WHERE p.username IS NOT NULL AND btrim(p.username) <> ''
  AND COALESCE(p.is_banned, false) = false;
GRANT SELECT ON public.leaderboard_season TO anon, authenticated, service_role;
