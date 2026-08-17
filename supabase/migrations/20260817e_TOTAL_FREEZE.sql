-- =============================================================================
-- TOTAL FREEZE — run in Supabase SQL Editor NOW
--
-- Why the recon account could still cheat:
--   protect_player_economy ALLOWED client to RAISE shards/taps by +2000 per
--   UPDATE. Spam 75 updates → 150k shards. Inventory / premium / boosts /
--   max_unlocked / vault were NOT frozen. That is not "hard security".
--
-- This script: non-service_role CANNOT change any valuable column.
-- Only Edge Functions (service_role) change money, inventory, walls, boosts,
-- identity. Client dual-write is dead by design.
-- =============================================================================

-- Economy flag ON (UPDATE only — season_name is NOT NULL)
UPDATE public.game_settings
SET secure_economy = true
WHERE id = 1;

-- ---------------------------------------------------------------------------
-- IDENTITY (always on)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_player_identity()
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
    IF TG_OP = 'UPDATE' THEN
      IF OLD.wallet_address IS NOT NULL AND btrim(OLD.wallet_address) <> '' THEN
        IF NEW.wallet_address IS DISTINCT FROM OLD.wallet_address THEN
          IF coalesce(current_setting('gift.admin_wallet_override', true), '') <> 'on' THEN
            RAISE EXCEPTION 'WALLET_LOCKED: cannot replace bound wallet'
              USING ERRCODE = '42501';
          END IF;
        END IF;
      END IF;
      IF OLD.encrypted_vault IS NOT NULL AND btrim(coalesce(OLD.encrypted_vault::text, '')) <> '' THEN
        IF NEW.encrypted_vault IS DISTINCT FROM OLD.encrypted_vault THEN
          IF coalesce(current_setting('gift.admin_vault_override', true), '') <> 'on' THEN
            RAISE EXCEPTION 'VAULT_LOCKED: cannot replace vault'
              USING ERRCODE = '42501';
          END IF;
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Client: freeze identity forever once set
  NEW.telegram_id := OLD.telegram_id;

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
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;

  IF OLD.referred_by IS NOT NULL AND btrim(coalesce(OLD.referred_by::text, '')) <> '' THEN
    NEW.referred_by := OLD.referred_by;
  END IF;

  IF OLD.username IS NOT NULL AND btrim(OLD.username) <> '' THEN
    NEW.username := OLD.username;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_player_identity ON public.players;
CREATE TRIGGER trg_protect_player_identity
  BEFORE UPDATE ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_player_identity();

-- ---------------------------------------------------------------------------
-- ECONOMY + INVENTORY + BOOSTS — HARD FREEZE (no client raise)
-- Always on. Not optional. No +2000 step hole.
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

  -- ===== MONEY / MINING — frozen (Edge commit-taps / shop only) =====
  NEW.shard_balance := OLD.shard_balance;
  NEW.lifetime_taps := OLD.lifetime_taps;
  NEW.season_shards := OLD.season_shards;
  NEW.weekly_shards := OLD.weekly_shards;
  NEW.weekly_week_id := OLD.weekly_week_id;
  NEW.daily_taps := OLD.daily_taps;
  NEW.last_tap_date := OLD.last_tap_date;
  NEW.current_streak := OLD.current_streak;
  NEW.last_energy := OLD.last_energy;
  NEW.sol_balance := OLD.sol_balance;
  NEW.usdc_balance := OLD.usdc_balance;

  BEGIN
    NEW.gft_token_balance := OLD.gft_token_balance;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;

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

  -- ===== INVENTORY (quests, boosts, backpack qty) — Edge only =====
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

  -- Identity set-once (defense in depth; full rules in protect_player_identity)
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

  -- last_updated may change (harmless)
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_player_economy ON public.players;
CREATE TRIGGER trg_protect_player_economy
  BEFORE UPDATE ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_player_economy();

COMMENT ON FUNCTION public.protect_player_economy() IS
  'TOTAL FREEZE: client cannot change money/taps/inventory/boosts/walls/premium/identity. Edge service_role only.';

-- ---------------------------------------------------------------------------
-- INSERT harden: new rows from client cannot start rich
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_player_insert()
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

  -- Cap starting wealth for client inserts
  IF coalesce(NEW.shard_balance, 0) > 500 THEN
    NEW.shard_balance := 500;
  END IF;
  NEW.lifetime_taps := 0;
  NEW.season_shards := 0;
  NEW.weekly_shards := 0;
  NEW.sol_balance := 0;
  NEW.usdc_balance := 0;
  BEGIN NEW.gft_token_balance := 0; EXCEPTION WHEN undefined_column THEN NULL; END;
  IF coalesce(NEW.max_unlocked_level, 0) > 4 THEN
    NEW.max_unlocked_level := 4;
  END IF;
  BEGIN
    NEW.premium_multiplier := 1;
    NEW.premium_multiplier_expires := NULL;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;
  BEGIN
    NEW.limit_boost_amount := 0;
    NEW.limit_boost_expires := NULL;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;
  BEGIN NEW.has_made_purchase := false; EXCEPTION WHEN undefined_column THEN NULL; END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_player_insert ON public.players;
CREATE TRIGGER trg_protect_player_insert
  BEFORE INSERT ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_player_insert();

-- ---------------------------------------------------------------------------
-- Revoke dangerous client RPCs (Edge uses service_role)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.claim_weekly_quest(text, text, numeric) FROM PUBLIC, anon, authenticated;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.claim_weekly_quest(text, text) FROM PUBLIC, anon, authenticated;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.claim_weekly_prize(text) FROM PUBLIC, anon, authenticated;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    GRANT EXECUTE ON FUNCTION public.claim_weekly_quest(text, text, numeric) TO service_role;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    GRANT EXECUTE ON FUNCTION public.claim_weekly_quest(text, text) TO service_role;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    GRANT EXECUTE ON FUNCTION public.claim_weekly_prize(text) TO service_role;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- BAN / RESET the recon cheater (from dump)
-- telegram_id: e2c16853b9ce4082ae67  username: reconjwkeco
-- ---------------------------------------------------------------------------
UPDATE public.players
SET
  shard_balance = 0,
  season_shards = 0,
  weekly_shards = 0,
  lifetime_taps = 0,
  daily_taps = 0,
  max_unlocked_level = 4,
  has_made_purchase = false,
  premium_multiplier = 1,
  premium_multiplier_expires = NULL,
  limit_boost_amount = 0,
  limit_boost_expires = NULL,
  frenzy_expires = NULL,
  efficiency_expires = NULL,
  energy_boost_expires = NULL,
  inventory = '{}'::jsonb,
  completed_tasks = '[]'::jsonb,
  daily_usage = '{}'::jsonb,
  has_beta_access = false,
  last_updated = now()
WHERE telegram_id = 'e2c16853b9ce4082ae67'
   OR lower(username) = 'reconjwkeco';

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.players'::regclass AND NOT tgisinternal;
-- Expect: trg_protect_player_identity, trg_protect_player_economy, trg_protect_player_insert
--
-- Test as anon (should leave balances unchanged):
-- UPDATE players SET shard_balance = 999999999, inventory = '{"bot":99}'::jsonb
-- WHERE telegram_id = 'e2c16853b9ce4082ae67';
-- SELECT shard_balance, inventory FROM players WHERE telegram_id = 'e2c16853b9ce4082ae67';
