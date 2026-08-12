-- =============================================================================
-- Hard security cutover gate: protect economy columns when secure_economy = true
-- Non-service_role updates cannot change balances / lifetime / season / weekly score.
-- Inventory still client-writable for backpack activate / legacy until full lock.
-- =============================================================================

-- Ensure flag column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'game_settings'
  ) THEN
    ALTER TABLE public.game_settings
      ADD COLUMN IF NOT EXISTS secure_economy boolean NOT NULL DEFAULT false;
  END IF;
END $$;

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
  -- service_role (Edge Functions) always allowed
  BEGIN
    role_name := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  EXCEPTION WHEN OTHERS THEN
    role_name := '';
  END;

  IF role_name = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Also allow when session is postgres superuser / bypass (migrations)
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

  -- Freeze money / ranking counters for anon & authenticated client writes
  NEW.shard_balance := OLD.shard_balance;
  NEW.lifetime_taps := OLD.lifetime_taps;
  NEW.season_shards := OLD.season_shards;
  NEW.weekly_shards := OLD.weekly_shards;
  NEW.weekly_week_id := OLD.weekly_week_id;
  NEW.daily_taps := OLD.daily_taps;
  NEW.last_energy := OLD.last_energy;
  -- streak/date still freezable if cheating; commit-taps sets them via service_role
  NEW.current_streak := OLD.current_streak;
  NEW.last_tap_date := OLD.last_tap_date;
  NEW.sol_balance := OLD.sol_balance;
  NEW.usdc_balance := OLD.usdc_balance;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_player_economy ON public.players;
CREATE TRIGGER trg_protect_player_economy
  BEFORE UPDATE ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_player_economy();

-- Revoke public execute on raw claim RPCs (force Edge wrappers when locked)
-- Keep EXECUTE for service_role; revoke from anon/authenticated once locked.
-- We revoke always — Edge uses service_role and still works; client falls back only if unlocked.
REVOKE EXECUTE ON FUNCTION public.claim_weekly_quest(text, text, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_weekly_quest(text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_weekly_prize(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_weekly_quest(text, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_weekly_quest(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_weekly_prize(text) TO service_role;

-- ENABLE hard economy lock
UPDATE public.game_settings
SET secure_economy = true
WHERE id = 1;

-- If no row, try insert minimal (best-effort)
INSERT INTO public.game_settings (id, secure_economy)
VALUES (1, true)
ON CONFLICT (id) DO UPDATE SET secure_economy = true;

COMMENT ON FUNCTION public.protect_player_economy() IS
  'When game_settings.secure_economy=true, client (anon) cannot change balances/taps; Edge service_role can.';
