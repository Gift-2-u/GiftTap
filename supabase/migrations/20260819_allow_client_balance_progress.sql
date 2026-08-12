-- Allow client dual-write of mining counters under secure_economy (same idea as daily_taps).
-- commit-taps remains preferred (service_role bypasses all caps).
-- Anti-cheat: cannot DECREASE balances/lifetime/season/weekly via client (no free un-spend).
-- Max +500 per client UPDATE per field (spam limited; real taps debounce and climb).

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
  old_b numeric;
  new_b numeric;
  old_ltt numeric;
  new_ltt numeric;
  old_s numeric;
  new_s numeric;
  old_w numeric;
  new_w numeric;
  step numeric := 500;
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

  -- ---- Money / ranking: monotonic increase only (client dual-write for mining) ----
  old_b := coalesce(OLD.shard_balance, 0);
  new_b := coalesce(NEW.shard_balance, 0);
  IF new_b < old_b THEN
    new_b := old_b; -- block client spends / wipe; Edge shop/wall still service_role
  ELSIF new_b > old_b + step THEN
    new_b := old_b + step;
  END IF;
  NEW.shard_balance := new_b;

  old_ltt := coalesce(OLD.lifetime_taps, 0);
  new_ltt := coalesce(NEW.lifetime_taps, 0);
  IF new_ltt < old_ltt THEN
    new_ltt := old_ltt;
  ELSIF new_ltt > old_ltt + step THEN
    new_ltt := old_ltt + step;
  END IF;
  NEW.lifetime_taps := new_ltt;

  old_s := coalesce(OLD.season_shards, 0);
  new_s := coalesce(NEW.season_shards, 0);
  IF new_s < old_s THEN
    new_s := old_s;
  ELSIF new_s > old_s + step THEN
    new_s := old_s + step;
  END IF;
  NEW.season_shards := new_s;

  old_w := coalesce(OLD.weekly_shards, 0);
  new_w := coalesce(NEW.weekly_shards, 0);
  IF new_w < old_w THEN
    new_w := old_w;
  ELSIF new_w > old_w + step THEN
    new_w := old_w + step;
  END IF;
  NEW.weekly_shards := new_w;
  -- allow weekly_week_id from client when score moves
  IF NEW.weekly_week_id IS NULL OR NEW.weekly_week_id::text = '' THEN
    NEW.weekly_week_id := OLD.weekly_week_id;
  END IF;

  -- Energy still server/edge preferred (regen cheating); keep freeze
  NEW.last_energy := OLD.last_energy;
  NEW.current_streak := COALESCE(NEW.current_streak, OLD.current_streak);
  -- streak: allow increase only
  IF coalesce(NEW.current_streak, 0) < coalesce(OLD.current_streak, 0) THEN
    NEW.current_streak := OLD.current_streak;
  END IF;
  NEW.sol_balance := OLD.sol_balance;
  NEW.usdc_balance := OLD.usdc_balance;

  -- ---- daily_taps + last_tap_date (unchanged rules; keep working) ----
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

  IF old_ltd = today_txt OR ((old_ltd IS NULL OR old_ltd = '') AND old_dt > 0 AND new_ltd = today_txt) THEN
    IF new_dt < old_dt THEN
      new_dt := old_dt;
    ELSIF new_dt > old_dt + 200 THEN
      new_dt := old_dt + 200;
    END IF;
    new_ltd := today_txt;
  ELSIF new_ltd = today_txt AND (old_ltd IS NULL OR old_ltd = '' OR old_ltd < today_txt) THEN
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

COMMENT ON FUNCTION public.protect_player_economy() IS
  'secure_economy: client may only raise mining counters (capped); cannot lower money; Edge service_role full access.';
