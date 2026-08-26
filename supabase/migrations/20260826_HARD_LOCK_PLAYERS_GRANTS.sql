-- =============================================================================
-- HARD LOCK: players cannot write players / player_secrets
-- Paste in Supabase SQL editor (production).
-- Repo also updated: 20260822c_harden_season_lifetime_boards.sql (§1b)
--
-- 1) Replace protect with full freeze (gft + inventory + tap_power + …)
-- 2) REVOKE INSERT/UPDATE from anon+authenticated (SELECT kept)
-- 3) player_secrets = service_role only
-- =============================================================================

UPDATE public.game_settings
SET secure_economy = true
WHERE id = 1;

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

  -- ===== MONEY / BOARDS — frozen (Edge only) =====
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

  -- Energy 0..500 (harmless if client UPDATE is revoked anyway)
  IF NEW.last_energy IS NULL THEN
    NEW.last_energy := OLD.last_energy;
  ELSE
    IF NEW.last_energy < 0 THEN NEW.last_energy := 0; END IF;
    IF NEW.last_energy > 500 THEN NEW.last_energy := 500; END IF;
  END IF;

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
    IF OLD.encrypted_vault IS NOT NULL AND btrim(coalesce(OLD.encrypted_vault::text, '')) <> '' THEN
      NEW.encrypted_vault := OLD.encrypted_vault;
    END IF;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;
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

-- Players: read OK, write ONLY service_role (auth-register / commit-taps / shop / …)
REVOKE ALL ON TABLE public.players FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.players FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.players FROM authenticated;
GRANT SELECT ON TABLE public.players TO anon, authenticated;
GRANT ALL ON TABLE public.players TO service_role;
GRANT ALL ON TABLE public.players TO postgres;

-- Wallet secrets / vault phrases: no player access
REVOKE ALL ON TABLE public.player_secrets FROM PUBLIC;
REVOKE ALL ON TABLE public.player_secrets FROM anon;
REVOKE ALL ON TABLE public.player_secrets FROM authenticated;
GRANT ALL ON TABLE public.player_secrets TO service_role;
GRANT ALL ON TABLE public.player_secrets TO postgres;

-- Verify
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'players'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY grantee, privilege_type;
