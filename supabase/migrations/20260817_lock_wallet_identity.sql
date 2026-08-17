-- =============================================================================
-- EMERGENCY: freeze identity / wallet fields against anon client hacks
-- Root cause: protect_player_economy did NOT freeze wallet_address / vault /
-- password / telegram_id. With open UPDATE on players + anon key, attackers
-- could rewrite wallet_address (and potentially encrypted_vault).
--
-- Paste in Supabase SQL Editor and RUN IMMEDIATELY.
-- service_role (Edge Functions) still bypasses for legitimate wallet create.
-- =============================================================================

-- 1) Always-on identity freeze (even if secure_economy is somehow false)
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

  -- Edge / admin only may change identity after set
  IF role_name = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Primary key / account id immutable
  IF NEW.telegram_id IS DISTINCT FROM OLD.telegram_id THEN
    NEW.telegram_id := OLD.telegram_id;
  END IF;

  -- Wallet: set once when empty; never overwrite a real wallet from client
  IF OLD.wallet_address IS NOT NULL AND btrim(OLD.wallet_address) <> '' THEN
    NEW.wallet_address := OLD.wallet_address;
  ELSIF NEW.wallet_address IS NOT NULL AND btrim(NEW.wallet_address) <> '' THEN
    -- allow first bind only (empty → set)
    NULL;
  ELSE
    NEW.wallet_address := OLD.wallet_address;
  END IF;

  -- Encrypted vault: set once; client cannot swap vault to steal seed
  IF OLD.encrypted_vault IS NOT NULL AND btrim(OLD.encrypted_vault::text) <> '' THEN
    NEW.encrypted_vault := OLD.encrypted_vault;
  END IF;

  -- Password hash: never client-change (auth Edge only)
  IF TG_OP = 'UPDATE' THEN
    BEGIN
      IF OLD.password_hash IS NOT NULL AND btrim(OLD.password_hash::text) <> '' THEN
        NEW.password_hash := OLD.password_hash;
      END IF;
    EXCEPTION WHEN undefined_column THEN
      NULL;
    END;
  END IF;

  -- Referral lock: cannot re-bind referred_by after set
  IF OLD.referred_by IS NOT NULL AND btrim(OLD.referred_by::text) <> '' THEN
    NEW.referred_by := OLD.referred_by;
  END IF;

  -- Username: optional freeze after first set (stop impersonation)
  -- Allow change only if OLD empty
  IF OLD.username IS NOT NULL AND btrim(OLD.username) <> '' THEN
    -- keep existing username unless you want renames via Edge later
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

COMMENT ON FUNCTION public.protect_player_identity() IS
  'Client cannot change wallet_address/encrypted_vault/password/telegram_id/referred_by/username once set. service_role only.';

-- 2) Also pin wallet inside economy protect (defense in depth)
CREATE OR REPLACE FUNCTION public.protect_player_economy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  locked boolean := false;
  role_name text;
  today_txt text := to_char((timezone('utc', now())), 'YYYY-MM-DD');
  old_ltd text;
  new_ltd text;
  old_dt numeric;
  new_dt numeric;
  step numeric := 2000;
BEGIN
  BEGIN
    role_name := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  EXCEPTION WHEN OTHERS THEN
    role_name := '';
  END;

  IF role_name = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT coalesce(secure_economy, false) INTO locked
    FROM public.game_settings WHERE id = 1 LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    locked := false;
  END;

  -- Identity freeze always (even when economy unlocked)
  IF OLD.wallet_address IS NOT NULL AND btrim(OLD.wallet_address) <> '' THEN
    NEW.wallet_address := OLD.wallet_address;
  END IF;
  IF OLD.encrypted_vault IS NOT NULL AND btrim(coalesce(OLD.encrypted_vault::text, '')) <> '' THEN
    NEW.encrypted_vault := OLD.encrypted_vault;
  END IF;
  IF NEW.telegram_id IS DISTINCT FROM OLD.telegram_id THEN
    NEW.telegram_id := OLD.telegram_id;
  END IF;

  IF NOT locked THEN
    RETURN NEW;
  END IF;

  IF coalesce(NEW.shard_balance, 0) < coalesce(OLD.shard_balance, 0) THEN
    NEW.shard_balance := OLD.shard_balance;
  ELSIF coalesce(NEW.shard_balance, 0) > coalesce(OLD.shard_balance, 0) + step THEN
    NEW.shard_balance := coalesce(OLD.shard_balance, 0) + step;
  END IF;

  IF coalesce(NEW.lifetime_taps, 0) < coalesce(OLD.lifetime_taps, 0) THEN
    NEW.lifetime_taps := OLD.lifetime_taps;
  ELSIF coalesce(NEW.lifetime_taps, 0) > coalesce(OLD.lifetime_taps, 0) + step THEN
    NEW.lifetime_taps := coalesce(OLD.lifetime_taps, 0) + step;
  END IF;

  IF coalesce(NEW.season_shards, 0) < coalesce(OLD.season_shards, 0) THEN
    NEW.season_shards := OLD.season_shards;
  ELSIF coalesce(NEW.season_shards, 0) > coalesce(OLD.season_shards, 0) + step THEN
    NEW.season_shards := coalesce(OLD.season_shards, 0) + step;
  END IF;

  IF coalesce(NEW.weekly_shards, 0) < coalesce(OLD.weekly_shards, 0) THEN
    NEW.weekly_shards := OLD.weekly_shards;
  ELSIF coalesce(NEW.weekly_shards, 0) > coalesce(OLD.weekly_shards, 0) + step THEN
    NEW.weekly_shards := coalesce(OLD.weekly_shards, 0) + step;
  END IF;

  IF NEW.weekly_week_id IS NULL OR btrim(coalesce(NEW.weekly_week_id::text, '')) = '' THEN
    NEW.weekly_week_id := OLD.weekly_week_id;
  END IF;

  IF coalesce(NEW.current_streak, 0) < coalesce(OLD.current_streak, 0) THEN
    NEW.current_streak := OLD.current_streak;
  END IF;

  IF NEW.last_energy IS NULL THEN
    NEW.last_energy := OLD.last_energy;
  ELSE
    IF NEW.last_energy < 0 THEN NEW.last_energy := 0; END IF;
    IF NEW.last_energy > 500 THEN NEW.last_energy := 500; END IF;
  END IF;

  NEW.sol_balance := OLD.sol_balance;
  NEW.usdc_balance := OLD.usdc_balance;
  BEGIN
    NEW.gft_token_balance := OLD.gft_token_balance;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;

  IF coalesce(NEW.max_unlocked_level, 0) > coalesce(OLD.max_unlocked_level, 0) THEN
    NEW.max_unlocked_level := OLD.max_unlocked_level;
  END IF;

  NEW.frenzy_expires := OLD.frenzy_expires;
  NEW.efficiency_expires := OLD.efficiency_expires;
  NEW.energy_boost_expires := OLD.energy_boost_expires;
  NEW.limit_boost_amount := OLD.limit_boost_amount;
  NEW.limit_boost_expires := OLD.limit_boost_expires;
  NEW.premium_multiplier := OLD.premium_multiplier;
  NEW.premium_multiplier_expires := OLD.premium_multiplier_expires;
  BEGIN
    NEW.bot_expires := OLD.bot_expires;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;

  old_ltd := left(coalesce(OLD.last_tap_date::text, ''), 10);
  new_ltd := left(coalesce(NEW.last_tap_date::text, ''), 10);
  old_dt := coalesce(OLD.daily_taps, 0);
  new_dt := coalesce(NEW.daily_taps, 0);
  IF new_ltd IS NULL OR new_ltd = '' THEN
    new_ltd := CASE WHEN old_ltd IS NULL OR old_ltd = '' THEN today_txt ELSE old_ltd END;
  END IF;
  IF new_ltd > today_txt THEN new_ltd := today_txt; END IF;

  IF old_ltd = today_txt
     OR ((old_ltd IS NULL OR old_ltd = '') AND old_dt > 0 AND new_ltd = today_txt) THEN
    IF new_dt < old_dt THEN new_dt := old_dt;
    ELSIF new_dt > old_dt + step THEN new_dt := old_dt + step;
    END IF;
    new_ltd := today_txt;
  ELSIF new_ltd = today_txt AND (old_ltd IS NULL OR old_ltd = '' OR old_ltd < today_txt) THEN
    IF new_dt < 0 THEN new_dt := 0;
    ELSIF new_dt > step THEN new_dt := step;
    END IF;
  ELSE
    new_dt := old_dt;
    new_ltd := old_ltd;
  END IF;
  NEW.daily_taps := new_dt;
  IF new_ltd IS NULL OR new_ltd = '' THEN
    NEW.last_tap_date := OLD.last_tap_date;
  ELSE
    NEW.last_tap_date := new_ltd;
  END IF;

  IF NEW.inventory IS DISTINCT FROM OLD.inventory
     AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'inventory_client_safe') THEN
    BEGIN
      NEW.inventory := public.inventory_client_safe(OLD.inventory, NEW.inventory);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_player_economy ON public.players;
CREATE TRIGGER trg_protect_player_economy
  BEFORE UPDATE ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_player_economy();

-- 3) Force hard economy lock ON
UPDATE public.game_settings
SET secure_economy = true
WHERE id = 1;

-- If no row:
INSERT INTO public.game_settings (id, secure_economy)
VALUES (1, true)
ON CONFLICT (id) DO UPDATE SET secure_economy = true;

-- 4) Audit helper: recent wallet changes cannot be auto-detected without logs,
--    but you can list accounts with wallets for manual review:
-- SELECT telegram_id, username, wallet_address, last_updated
-- FROM public.players
-- WHERE wallet_address IS NOT NULL
-- ORDER BY last_updated DESC NULLS LAST
-- LIMIT 100;
