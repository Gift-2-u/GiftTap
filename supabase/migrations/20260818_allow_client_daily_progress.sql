-- =============================================================================
-- Allow client dual-write of daily_taps / last_tap_date under secure_economy.
-- Phones often have no session JWT (close/reopen, old login) so commit-taps never
-- runs and the protect freeze left daily_taps stuck forever.
--
-- Anti-cheat rules:
--   * Cannot LOWER daily_taps on the same UTC day (no reopening the limit)
--   * Max +200 per client UPDATE (limits DevTools spam; real taps flush often)
--   * Cannot set last_tap_date in the future
--   * New UTC day may reset toward 0 then climb again
-- Balances / lifetime / season / weekly / energy stay frozen (Edge only).
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
BEGIN
  -- service_role (Edge Functions) always allowed
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

  -- Freeze money / ranking counters (Edge commit-taps / shop only)
  NEW.shard_balance := OLD.shard_balance;
  NEW.lifetime_taps := OLD.lifetime_taps;
  NEW.season_shards := OLD.season_shards;
  NEW.weekly_shards := OLD.weekly_shards;
  NEW.weekly_week_id := OLD.weekly_week_id;
  NEW.last_energy := OLD.last_energy;
  NEW.current_streak := OLD.current_streak;
  NEW.sol_balance := OLD.sol_balance;
  NEW.usdc_balance := OLD.usdc_balance;
  -- max_unlocked_level still clamped elsewhere if inventory protect exists

  -- ---- daily_taps + last_tap_date: controlled client progress ----
  old_ltd := left(coalesce(OLD.last_tap_date::text, ''), 10);
  new_ltd := left(coalesce(NEW.last_tap_date::text, ''), 10);
  old_dt := coalesce(OLD.daily_taps, 0);
  new_dt := coalesce(NEW.daily_taps, 0);

  IF new_ltd IS NULL OR new_ltd = '' THEN
    new_ltd := old_ltd;
  END IF;

  -- No future calendar days
  IF new_ltd > today_txt THEN
    new_ltd := today_txt;
  END IF;

  IF old_ltd = today_txt THEN
    -- Same UTC day: only allow daily to go UP (cannot reopen limit)
    IF new_dt < old_dt THEN
      new_dt := old_dt;
    ELSIF new_dt > old_dt + 200 THEN
      new_dt := old_dt + 200;
    END IF;
    new_ltd := today_txt;
  ELSIF new_ltd = today_txt AND (old_ltd IS NULL OR old_ltd = '' OR old_ltd < today_txt) THEN
    -- Rolling into today: allow fresh progress, cap first write jump
    IF new_dt < 0 THEN
      new_dt := 0;
    ELSIF new_dt > 200 THEN
      new_dt := 200;
    END IF;
  ELSE
    -- Keep prior day state (client tried something invalid)
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
  'Locks balances under secure_economy; allows monotonic same-day daily_taps client sync.';
