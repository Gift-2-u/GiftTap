-- =============================================================================
-- FIX LOGIN / PLAY after secrets column revoke
-- Run in Supabase SQL Editor NOW.
--
-- Problem: Hiding encrypted_vault/password_hash on players broke select('*')
--          → app cannot load player rows → login/play fails.
-- Fix: Move secrets to player_secrets (Edge/service_role only).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.player_secrets (
  telegram_id text PRIMARY KEY,
  password_hash text,
  encrypted_vault text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.player_secrets IS
  'HARD SECRET: password + vault. service_role / Edge only. Never grant to anon.';

REVOKE ALL ON TABLE public.player_secrets FROM PUBLIC;
REVOKE ALL ON TABLE public.player_secrets FROM anon;
REVOKE ALL ON TABLE public.player_secrets FROM authenticated;
GRANT ALL ON TABLE public.player_secrets TO service_role;
GRANT ALL ON TABLE public.player_secrets TO postgres;

-- Migrate only if secret columns still exist on players
DO $$
DECLARE
  has_pw boolean;
  has_vault boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'password_hash'
  ) INTO has_pw;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'encrypted_vault'
  ) INTO has_vault;

  IF has_pw OR has_vault THEN
    IF has_pw AND has_vault THEN
      INSERT INTO public.player_secrets (telegram_id, password_hash, encrypted_vault, updated_at)
      SELECT telegram_id::text, password_hash, encrypted_vault, now()
      FROM public.players
      WHERE password_hash IS NOT NULL OR encrypted_vault IS NOT NULL
      ON CONFLICT (telegram_id) DO UPDATE SET
        password_hash = COALESCE(EXCLUDED.password_hash, public.player_secrets.password_hash),
        encrypted_vault = COALESCE(EXCLUDED.encrypted_vault, public.player_secrets.encrypted_vault),
        updated_at = now();
    ELSIF has_pw THEN
      INSERT INTO public.player_secrets (telegram_id, password_hash, updated_at)
      SELECT telegram_id::text, password_hash, now()
      FROM public.players
      WHERE password_hash IS NOT NULL
      ON CONFLICT (telegram_id) DO UPDATE SET
        password_hash = COALESCE(EXCLUDED.password_hash, public.player_secrets.password_hash),
        updated_at = now();
    ELSE
      INSERT INTO public.player_secrets (telegram_id, encrypted_vault, updated_at)
      SELECT telegram_id::text, encrypted_vault, now()
      FROM public.players
      WHERE encrypted_vault IS NOT NULL
      ON CONFLICT (telegram_id) DO UPDATE SET
        encrypted_vault = COALESCE(EXCLUDED.encrypted_vault, public.player_secrets.encrypted_vault),
        updated_at = now();
    END IF;
  END IF;
END $$;

ALTER TABLE public.players DROP COLUMN IF EXISTS password_hash;
ALTER TABLE public.players DROP COLUMN IF EXISTS encrypted_vault;
ALTER TABLE public.players DROP COLUMN IF EXISTS encryption_iv;

-- Full table grants again (no secret columns left)
REVOKE ALL ON TABLE public.players FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.players TO anon, authenticated;
GRANT ALL ON TABLE public.players TO service_role;
GRANT ALL ON TABLE public.players TO postgres;

UPDATE public.game_settings SET secure_economy = true WHERE id = 1;

-- Identity (wallet only — secrets live elsewhere)
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
    END IF;
    RETURN NEW;
  END IF;

  NEW.telegram_id := OLD.telegram_id;
  IF OLD.wallet_address IS NOT NULL AND btrim(OLD.wallet_address) <> '' THEN
    NEW.wallet_address := OLD.wallet_address;
  END IF;
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

-- Keep TOTAL FREEZE economy (same as 17e, without vault cols)
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
  BEGIN NEW.gft_token_balance := OLD.gft_token_balance; EXCEPTION WHEN undefined_column THEN NULL; END;
  NEW.max_unlocked_level := OLD.max_unlocked_level;
  BEGIN NEW.max_daily_limit := OLD.max_daily_limit; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.tap_power := OLD.tap_power; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.energy_level := OLD.energy_level; EXCEPTION WHEN undefined_column THEN NULL; END;
  NEW.inventory := OLD.inventory;
  BEGIN NEW.daily_usage := OLD.daily_usage; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.completed_tasks := OLD.completed_tasks; EXCEPTION WHEN undefined_column THEN NULL; END;
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
  BEGIN NEW.has_beta_access := OLD.has_beta_access; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.has_made_purchase := OLD.has_made_purchase; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.redeemed_code := OLD.redeemed_code; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.referral_lvl1_paid := OLD.referral_lvl1_paid; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.referral_wall5_paid := OLD.referral_wall5_paid; EXCEPTION WHEN undefined_column THEN NULL; END;
  BEGIN NEW.referral_taps1000_paid := OLD.referral_taps1000_paid; EXCEPTION WHEN undefined_column THEN NULL; END;

  IF OLD.wallet_address IS NOT NULL AND btrim(OLD.wallet_address) <> '' THEN
    NEW.wallet_address := OLD.wallet_address;
  END IF;
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
