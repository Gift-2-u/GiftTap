-- =============================================================================
-- Unified mining security (matches game logic)
--
-- Game rule: one tap increases daily_taps + lifetime_taps + season_shards +
--            weekly_shards + shard_balance together.
-- Security must allow that whole bundle to sync from the client.
--
-- What we block (anti-cheat):
--   * Client cannot LOWER shard/lifetime/season/weekly (no wipe / fake refund)
--   * Client cannot raise max_unlocked_level (walls stay Edge-paid)
--   * Client cannot change sol/usdc
--   * Per-write climb cap stops DevTools "set to 999999999" in one request
--     (real tapping saves often and climbs past the cap)
--
-- service_role (Edge: shop, wall, commit-taps) still has full write access.
-- =============================================================================

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
  -- Per client UPDATE: enough for a real multi-tap burst, not a DevTools jackpot
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

  IF NOT locked THEN
    RETURN NEW;
  END IF;

  -- ===== MINING BUNDLE (must stay in sync with game code) =====
  -- shard_balance
  IF coalesce(NEW.shard_balance, 0) < coalesce(OLD.shard_balance, 0) THEN
    NEW.shard_balance := OLD.shard_balance;
  ELSIF coalesce(NEW.shard_balance, 0) > coalesce(OLD.shard_balance, 0) + step THEN
    NEW.shard_balance := coalesce(OLD.shard_balance, 0) + step;
  END IF;

  -- lifetime_taps (all-time)
  IF coalesce(NEW.lifetime_taps, 0) < coalesce(OLD.lifetime_taps, 0) THEN
    NEW.lifetime_taps := OLD.lifetime_taps;
  ELSIF coalesce(NEW.lifetime_taps, 0) > coalesce(OLD.lifetime_taps, 0) + step THEN
    NEW.lifetime_taps := coalesce(OLD.lifetime_taps, 0) + step;
  END IF;

  -- season_shards
  IF coalesce(NEW.season_shards, 0) < coalesce(OLD.season_shards, 0) THEN
    NEW.season_shards := OLD.season_shards;
  ELSIF coalesce(NEW.season_shards, 0) > coalesce(OLD.season_shards, 0) + step THEN
    NEW.season_shards := coalesce(OLD.season_shards, 0) + step;
  END IF;

  -- weekly_shards
  IF coalesce(NEW.weekly_shards, 0) < coalesce(OLD.weekly_shards, 0) THEN
    NEW.weekly_shards := OLD.weekly_shards;
  ELSIF coalesce(NEW.weekly_shards, 0) > coalesce(OLD.weekly_shards, 0) + step THEN
    NEW.weekly_shards := coalesce(OLD.weekly_shards, 0) + step;
  END IF;

  IF NEW.weekly_week_id IS NULL OR btrim(NEW.weekly_week_id::text) = '' THEN
    NEW.weekly_week_id := OLD.weekly_week_id;
  END IF;

  -- streak: allow increase only
  IF coalesce(NEW.current_streak, 0) < coalesce(OLD.current_streak, 0) THEN
    NEW.current_streak := OLD.current_streak;
  END IF;

  -- Energy pool 0..500 (regen + spend from client is OK for playability)
  IF NEW.last_energy IS NULL THEN
    NEW.last_energy := OLD.last_energy;
  ELSIF NEW.last_energy < 0 THEN
    NEW.last_energy := 0;
  ELSIF NEW.last_energy > 500 THEN
    NEW.last_energy := 500;
  END IF;

  -- ===== NOT mining — keep locked =====
  NEW.sol_balance := OLD.sol_balance;
  NEW.usdc_balance := OLD.usdc_balance;
  -- Walls / paid unlocks only via Edge
  IF coalesce(NEW.max_unlocked_level, 0) > coalesce(OLD.max_unlocked_level, 0) THEN
    NEW.max_unlocked_level := OLD.max_unlocked_level;
  END IF;

  -- ===== daily_taps (same day only increase; new day may reset) =====
  old_ltd := left(coalesce(OLD.last_tap_date::text, ''), 10);
  new_ltd := left(coalesce(NEW.last_tap_date::text, ''), 10);
  old_dt := coalesce(OLD.daily_taps, 0);
  new_dt := coalesce(NEW.daily_taps, 0);

  IF new_ltd IS NULL OR new_ltd = '' THEN
    new_ltd := CASE WHEN old_ltd IS NULL OR old_ltd = '' THEN today_txt ELSE old_ltd END;
  END IF;
  IF new_ltd > today_txt THEN
    new_ltd := today_txt;
  END IF;

  IF old_ltd = today_txt
     OR ((old_ltd IS NULL OR old_ltd = '') AND old_dt > 0 AND new_ltd = today_txt) THEN
    -- same UTC day: only climb (cannot reopen limit)
    IF new_dt < old_dt THEN
      new_dt := old_dt;
    ELSIF new_dt > old_dt + step THEN
      new_dt := old_dt + step;
    END IF;
    new_ltd := today_txt;
  ELSIF new_ltd = today_txt AND (old_ltd IS NULL OR old_ltd = '' OR old_ltd < today_txt) THEN
    IF new_dt < 0 THEN
      new_dt := 0;
    ELSIF new_dt > step THEN
      new_dt := step;
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

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_player_economy() IS
  'Mining bundle (daily+lifetime+season+weekly+shards) may rise together from client; cannot fall; walls/SOL locked.';

-- Keep lock ON — security still active, just aligned with game
UPDATE public.game_settings SET secure_economy = true WHERE id = 1;
