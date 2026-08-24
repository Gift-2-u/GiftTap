-- Extend economy protect: freeze max_unlocked_level for non-service when locked.
-- Inventory is NOT fully frozen (too many fields); sensitive grants go via Edge.
-- Crate shards already protected via shard_balance freeze.

CREATE OR REPLACE FUNCTION public.protect_player_economy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  locked boolean := false;
  role_name text;
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
    FROM public.game_settings
    WHERE id = 1
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    locked := false;
  END;

  IF NOT locked THEN
    RETURN NEW;
  END IF;

  -- Freeze money / ranking / unlock counters for client writes
  NEW.shard_balance := OLD.shard_balance;
  NEW.lifetime_taps := OLD.lifetime_taps;
  NEW.season_shards := OLD.season_shards;
  NEW.weekly_shards := OLD.weekly_shards;
  NEW.weekly_week_id := OLD.weekly_week_id;
  NEW.daily_taps := OLD.daily_taps;
  NEW.last_energy := OLD.last_energy;
  NEW.current_streak := OLD.current_streak;
  NEW.last_tap_date := OLD.last_tap_date;
  NEW.sol_balance := OLD.sol_balance;
  NEW.usdc_balance := OLD.usdc_balance;
  NEW.max_unlocked_level := OLD.max_unlocked_level;
  -- Daily cap / ads — Edge only (stops client inflating max_daily_limit)
  NEW.max_daily_limit := OLD.max_daily_limit;
  NEW.daily_ads_watched := OLD.daily_ads_watched;
  NEW.last_ad_date := OLD.last_ad_date;
  NEW.ad_energy_boost := OLD.ad_energy_boost;
  NEW.ad_energy_expires := OLD.ad_energy_expires;

  -- Timed buffs / multipliers — only Edge may start these (stops free frenzy etc.)
  NEW.frenzy_expires := OLD.frenzy_expires;
  NEW.efficiency_expires := OLD.efficiency_expires;
  NEW.energy_boost_expires := OLD.energy_boost_expires;
  NEW.limit_boost_amount := OLD.limit_boost_amount;
  NEW.limit_boost_expires := OLD.limit_boost_expires;
  NEW.premium_multiplier := OLD.premium_multiplier;
  NEW.premium_multiplier_expires := OLD.premium_multiplier_expires;
  RETURN NEW;
END;
$$;

-- Ensure trigger still attached
DROP TRIGGER IF EXISTS trg_protect_player_economy ON public.players;
CREATE TRIGGER trg_protect_player_economy
  BEFORE UPDATE ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_player_economy();

COMMENT ON FUNCTION public.protect_player_economy() IS
  'secure_economy=true: client cannot change balances, taps, wall unlock, or buff timers. Edge service_role can.';
