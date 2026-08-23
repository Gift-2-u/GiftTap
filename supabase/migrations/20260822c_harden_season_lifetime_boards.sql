-- =============================================================================
-- HARDEN SEASON + LIFETIME BOARDS (same model as weekly)
--
-- Why weekly resisted cheating but season/all-time did not:
--   weekly_score_ledger + GREATEST + board view read the ledger.
--   season/lifetime still ranked raw players.* columns, and protect_player_economy
--   allowed anon/authenticated to RAISE those by +2000 per UPDATE.
--
-- This migration:
--   1) Restores Edge/service_role-only freeze for money + board columns
--      (keeps last_energy 0..500 client-writable for Instant Refill UX)
--   2) Adds season_score_ledger + lifetime_score_ledger (GREATEST, never lower)
--   3) Points leaderboard_season / leaderboard_all_time at the ledgers
--   4) Upsert RPCs for commit-taps (service_role only)
--
-- After tests: wipe players.* AND the matching ledger rows (SQL below / companion).
-- =============================================================================

UPDATE public.game_settings
SET secure_economy = true
WHERE id = 1;

-- ---------------------------------------------------------------------------
-- 1) protect_player_economy — board/money Edge-only (no +2000 hole)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_player_economy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_name text;
BEGIN
  BEGIN
    role_name := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  EXCEPTION WHEN OTHERS THEN
    role_name := '';
  END;

  IF role_name = 'service_role' OR current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- ===== MONEY / BOARDS — frozen (Edge commit-taps / shop only) =====
  NEW.shard_balance := OLD.shard_balance;
  NEW.lifetime_taps := OLD.lifetime_taps;
  NEW.season_shards := OLD.season_shards;
  NEW.weekly_shards := OLD.weekly_shards;
  NEW.weekly_week_id := OLD.weekly_week_id;
  NEW.daily_taps := OLD.daily_taps;
  NEW.last_tap_date := OLD.last_tap_date;
  NEW.current_streak := OLD.current_streak;
  NEW.sol_balance := OLD.sol_balance;
  NEW.usdc_balance := OLD.usdc_balance;

  BEGIN
    NEW.daily_shards := OLD.daily_shards;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;

  BEGIN
    NEW.gft_token_balance := OLD.gft_token_balance;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;

  -- Energy battery 0..500: allow refill/spend/regen from client (Instant Refill)
  IF NEW.last_energy IS NULL THEN
    NEW.last_energy := OLD.last_energy;
  ELSE
    IF NEW.last_energy < 0 THEN NEW.last_energy := 0; END IF;
    IF NEW.last_energy > 500 THEN NEW.last_energy := 500; END IF;
  END IF;

  -- ===== WALLS / LEVELS / POWER =====
  NEW.max_unlocked_level := OLD.max_unlocked_level;
  BEGIN
    NEW.max_daily_limit := OLD.max_daily_limit;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;
  BEGIN
    NEW.tap_power := OLD.tap_power;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;
  BEGIN
    NEW.energy_level := OLD.energy_level;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;

  -- ===== INVENTORY / TASKS — Edge only =====
  NEW.inventory := OLD.inventory;
  BEGIN
    NEW.daily_usage := OLD.daily_usage;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;
  BEGIN
    NEW.completed_tasks := OLD.completed_tasks;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;

  -- ===== PREMIUM / BOOST TIMERS =====
  BEGIN NEW.premium_multiplier := OLD.premium_multiplier; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.premium_multiplier_expires := OLD.premium_multiplier_expires; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.limit_boost_amount := OLD.limit_boost_amount; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.limit_boost_expires := OLD.limit_boost_expires; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.frenzy_expires := OLD.frenzy_expires; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.efficiency_expires := OLD.efficiency_expires; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.energy_boost_expires := OLD.energy_boost_expires; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.bot_expires := OLD.bot_expires; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.ad_energy_boost := OLD.ad_energy_boost; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.ad_energy_expires := OLD.ad_energy_expires; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.daily_ads_watched := OLD.daily_ads_watched; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.last_ad_date := OLD.last_ad_date; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.last_daily_claim := OLD.last_daily_claim; EXCEPTION WHEN undefined_column THEN NULL; END;

  -- ===== FLAGS =====
  BEGIN NEW.has_beta_access := OLD.has_beta_access; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.has_made_purchase := OLD.has_made_purchase; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.redeemed_code := OLD.redeemed_code; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.referral_lvl1_paid := OLD.referral_lvl1_paid; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.referral_wall5_paid := OLD.referral_wall5_paid; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.referral_taps1000_paid := OLD.referral_taps1000_paid; EXCEPTION WHEN undefined_column THEN NULL; END;

  -- Identity set-once (defense in depth)
  IF OLD.wallet_address IS NOT NULL AND btrim(OLD.wallet_address) <> '' THEN
    NEW.wallet_address := OLD.wallet_address;
  END IF;
  IF OLD.encrypted_vault IS NOT NULL AND btrim(coalesce(OLD.encrypted_vault::text, '')) <> '' THEN
    NEW.encrypted_vault := OLD.encrypted_vault;
  END IF;
  BEGIN
    IF OLD.password_hash IS NOT NULL AND btrim(coalesce(OLD.password_hash::text, '')) <> '' THEN
      NEW.password_hash := OLD.password_hash;
    END IF;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;
  BEGIN
    IF OLD.username IS NOT NULL AND btrim(OLD.username) <> '' THEN
      NEW.username := OLD.username;
    END IF;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;
  BEGIN
    IF OLD.referred_by IS NOT NULL AND btrim(coalesce(OLD.referred_by::text, '')) <> '' THEN
      NEW.referred_by := OLD.referred_by;
    END IF;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;
  NEW.telegram_id := OLD.telegram_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_player_economy ON public.players;
CREATE TRIGGER trg_protect_player_economy
  BEFORE UPDATE ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_player_economy();

COMMENT ON FUNCTION public.protect_player_economy() IS
  'Board/money/inventory Edge-only freeze. last_energy 0..500 client OK. No +2000 raise hole.';

-- ---------------------------------------------------------------------------
-- 2) season_score_ledger (GREATEST — never lower)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.season_score_ledger (
  telegram_id text PRIMARY KEY,
  username text,
  score numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_season_score_ledger_score
  ON public.season_score_ledger (score DESC NULLS LAST);

ALTER TABLE public.season_score_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS season_score_ledger_select_all ON public.season_score_ledger;
CREATE POLICY season_score_ledger_select_all ON public.season_score_ledger
  FOR SELECT TO anon, authenticated, service_role
  USING (true);

GRANT SELECT ON public.season_score_ledger TO anon, authenticated, service_role;
GRANT ALL ON public.season_score_ledger TO service_role, postgres;

CREATE OR REPLACE FUNCTION public.sync_season_score_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.telegram_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.season_shards, 0) <= 0 THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.season_score_ledger (telegram_id, username, score, updated_at)
  VALUES (NEW.telegram_id::text, NEW.username, COALESCE(NEW.season_shards, 0), now())
  ON CONFLICT (telegram_id) DO UPDATE SET
    score = GREATEST(public.season_score_ledger.score, EXCLUDED.score),
    username = COALESCE(NULLIF(btrim(EXCLUDED.username), ''), public.season_score_ledger.username),
    updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_season_score_ledger ON public.players;
CREATE TRIGGER trg_sync_season_score_ledger
  AFTER INSERT OR UPDATE OF season_shards, username
  ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_season_score_ledger();

CREATE OR REPLACE FUNCTION public.upsert_season_score_ledger(
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
  IF p_telegram_id IS NULL OR btrim(p_telegram_id) = '' THEN
    RETURN;
  END IF;
  IF COALESCE(p_score, 0) <= 0 THEN
    RETURN;
  END IF;
  INSERT INTO public.season_score_ledger (telegram_id, username, score, updated_at)
  VALUES (p_telegram_id, p_username, p_score, now())
  ON CONFLICT (telegram_id) DO UPDATE SET
    score = GREATEST(public.season_score_ledger.score, EXCLUDED.score),
    username = COALESCE(NULLIF(btrim(EXCLUDED.username), ''), public.season_score_ledger.username),
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_season_score_ledger(text, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_season_score_ledger(text, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_season_score_ledger(text, text, numeric) TO postgres;

-- Backfill season ledger from players
INSERT INTO public.season_score_ledger (telegram_id, username, score, updated_at)
SELECT
  p.telegram_id::text,
  p.username,
  COALESCE(p.season_shards, 0),
  COALESCE(p.last_updated, now())
FROM public.players p
WHERE p.telegram_id IS NOT NULL
  AND COALESCE(p.season_shards, 0) > 0
ON CONFLICT (telegram_id) DO UPDATE SET
  score = GREATEST(public.season_score_ledger.score, EXCLUDED.score),
  username = COALESCE(EXCLUDED.username, public.season_score_ledger.username),
  updated_at = GREATEST(public.season_score_ledger.updated_at, EXCLUDED.updated_at);

-- ---------------------------------------------------------------------------
-- 3) lifetime_score_ledger (GREATEST — never lower)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lifetime_score_ledger (
  telegram_id text PRIMARY KEY,
  username text,
  score numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lifetime_score_ledger_score
  ON public.lifetime_score_ledger (score DESC NULLS LAST);

ALTER TABLE public.lifetime_score_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lifetime_score_ledger_select_all ON public.lifetime_score_ledger;
CREATE POLICY lifetime_score_ledger_select_all ON public.lifetime_score_ledger
  FOR SELECT TO anon, authenticated, service_role
  USING (true);

GRANT SELECT ON public.lifetime_score_ledger TO anon, authenticated, service_role;
GRANT ALL ON public.lifetime_score_ledger TO service_role, postgres;

CREATE OR REPLACE FUNCTION public.sync_lifetime_score_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.telegram_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.lifetime_taps, 0) <= 0 THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.lifetime_score_ledger (telegram_id, username, score, updated_at)
  VALUES (NEW.telegram_id::text, NEW.username, COALESCE(NEW.lifetime_taps, 0), now())
  ON CONFLICT (telegram_id) DO UPDATE SET
    score = GREATEST(public.lifetime_score_ledger.score, EXCLUDED.score),
    username = COALESCE(NULLIF(btrim(EXCLUDED.username), ''), public.lifetime_score_ledger.username),
    updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lifetime_score_ledger ON public.players;
CREATE TRIGGER trg_sync_lifetime_score_ledger
  AFTER INSERT OR UPDATE OF lifetime_taps, username
  ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_lifetime_score_ledger();

CREATE OR REPLACE FUNCTION public.upsert_lifetime_score_ledger(
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
  IF p_telegram_id IS NULL OR btrim(p_telegram_id) = '' THEN
    RETURN;
  END IF;
  IF COALESCE(p_score, 0) <= 0 THEN
    RETURN;
  END IF;
  INSERT INTO public.lifetime_score_ledger (telegram_id, username, score, updated_at)
  VALUES (p_telegram_id, p_username, p_score, now())
  ON CONFLICT (telegram_id) DO UPDATE SET
    score = GREATEST(public.lifetime_score_ledger.score, EXCLUDED.score),
    username = COALESCE(NULLIF(btrim(EXCLUDED.username), ''), public.lifetime_score_ledger.username),
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_lifetime_score_ledger(text, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_lifetime_score_ledger(text, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_lifetime_score_ledger(text, text, numeric) TO postgres;

-- Backfill lifetime ledger from players
INSERT INTO public.lifetime_score_ledger (telegram_id, username, score, updated_at)
SELECT
  p.telegram_id::text,
  p.username,
  COALESCE(p.lifetime_taps, 0),
  COALESCE(p.last_updated, now())
FROM public.players p
WHERE p.telegram_id IS NOT NULL
  AND COALESCE(p.lifetime_taps, 0) > 0
ON CONFLICT (telegram_id) DO UPDATE SET
  score = GREATEST(public.lifetime_score_ledger.score, EXCLUDED.score),
  username = COALESCE(EXCLUDED.username, public.lifetime_score_ledger.username),
  updated_at = GREATEST(public.lifetime_score_ledger.updated_at, EXCLUDED.updated_at);

-- ---------------------------------------------------------------------------
-- 4) Board views — read ledgers (players fallback only if missing from ledger)
-- ---------------------------------------------------------------------------
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
  UNION ALL
  SELECT
    p.telegram_id::text,
    COALESCE(NULLIF(btrim(p.username), ''), 'Player'),
    COALESCE(p.season_shards, 0),
    p.last_updated
  FROM public.players p
  WHERE COALESCE(p.season_shards, 0) > 0
    AND p.telegram_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.season_score_ledger l2
      WHERE l2.telegram_id = p.telegram_id::text
    )
) x
LEFT JOIN public.players p ON p.telegram_id::text = x.telegram_id
WHERE x.username IS NOT NULL AND btrim(x.username) <> '';

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
  UNION ALL
  SELECT
    p.telegram_id::text,
    COALESCE(NULLIF(btrim(p.username), ''), 'Player'),
    COALESCE(p.lifetime_taps, 0),
    p.last_updated
  FROM public.players p
  WHERE COALESCE(p.lifetime_taps, 0) > 0
    AND p.telegram_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.lifetime_score_ledger l2
      WHERE l2.telegram_id = p.telegram_id::text
    )
) x
LEFT JOIN public.players p ON p.telegram_id::text = x.telegram_id
WHERE x.username IS NOT NULL AND btrim(x.username) <> '';

GRANT SELECT ON public.leaderboard_all_time TO anon, authenticated, service_role;

-- Sanity
SELECT count(*) AS season_ledger_rows FROM public.season_score_ledger;
SELECT count(*) AS lifetime_ledger_rows FROM public.lifetime_score_ledger;
SELECT count(*) AS season_view_rows FROM public.leaderboard_season;
SELECT count(*) AS all_time_view_rows FROM public.leaderboard_all_time;
