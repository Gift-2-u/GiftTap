-- Fix: if daily_taps already > 0 but last_tap_date was null/empty, do NOT cap to 200.
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

  NEW.shard_balance := OLD.shard_balance;
  NEW.lifetime_taps := OLD.lifetime_taps;
  NEW.season_shards := OLD.season_shards;
  NEW.weekly_shards := OLD.weekly_shards;
  NEW.weekly_week_id := OLD.weekly_week_id;
  NEW.last_energy := OLD.last_energy;
  NEW.current_streak := OLD.current_streak;
  NEW.sol_balance := OLD.sol_balance;
  NEW.usdc_balance := OLD.usdc_balance;

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

  -- Same UTC day OR missing ltd with existing progress → monotonic increase only
  IF old_ltd = today_txt OR ((old_ltd IS NULL OR old_ltd = '') AND old_dt > 0 AND new_ltd = today_txt) THEN
    IF new_dt < old_dt THEN
      new_dt := old_dt;
    ELSIF new_dt > old_dt + 200 THEN
      new_dt := old_dt + 200;
    END IF;
    new_ltd := today_txt;
  ELSIF new_ltd = today_txt AND (old_ltd IS NULL OR old_ltd = '' OR old_ltd < today_txt) THEN
    -- True new day (or first ever): allow start, cap first jump
    IF new_dt < 0 THEN
      new_dt := 0;
    ELSIF new_dt > 200 THEN
      new_dt := 200;
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
