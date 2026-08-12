-- Clamp inventory economic keys for non-service_role when secure_economy=true.
-- Client may still update weekly_quests / claim_log / wall_snooze, but cannot
-- freely mint badges or shop items.

CREATE OR REPLACE FUNCTION public.inventory_client_safe(old_inv jsonb, new_inv jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result jsonb;
  k text;
  protected text[] := ARRAY[
    'badge_bronze','badge_silver','badge_gold','badge_diamond',
    'frenzy','battery','heavy','refill','bot','grinder','whale','crate',
    'x2_boost','x3_boost','exclusive_nft_voucher'
  ];
  ov numeric;
  nv numeric;
BEGIN
  result := coalesce(new_inv, '{}'::jsonb);
  IF jsonb_typeof(result) <> 'object' THEN
    result := '{}'::jsonb;
  END IF;
  IF old_inv IS NULL OR jsonb_typeof(old_inv) <> 'object' THEN
    old_inv := '{}'::jsonb;
  END IF;

  FOREACH k IN ARRAY protected LOOP
    ov := coalesce(nullif(old_inv->>k, '')::numeric, 0);
    nv := coalesce(nullif(result->>k, '')::numeric, 0);
    IF nv > ov THEN
      IF ov <= 0 THEN
        result := result - k;
      ELSE
        result := jsonb_set(result, ARRAY[k], to_jsonb(ov), true);
      END IF;
    END IF;
  END LOOP;

  RETURN result;
END;
$$;

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
  NEW.frenzy_expires := OLD.frenzy_expires;
  NEW.efficiency_expires := OLD.efficiency_expires;
  NEW.energy_boost_expires := OLD.energy_boost_expires;
  NEW.limit_boost_amount := OLD.limit_boost_amount;
  NEW.limit_boost_expires := OLD.limit_boost_expires;
  NEW.premium_multiplier := OLD.premium_multiplier;
  NEW.premium_multiplier_expires := OLD.premium_multiplier_expires;

  -- Clamp free mint of badges / shop items; allow decreases + weekly progress fields
  IF NEW.inventory IS DISTINCT FROM OLD.inventory THEN
    NEW.inventory := public.inventory_client_safe(OLD.inventory, NEW.inventory);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_player_economy ON public.players;
CREATE TRIGGER trg_protect_player_economy
  BEFORE UPDATE ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_player_economy();
