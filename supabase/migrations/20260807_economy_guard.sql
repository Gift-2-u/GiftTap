-- ============================================================
-- Soft economy guard for public.players
-- Stops DevTools / anon-key clients from writing absurd
-- shard_balance / gft_token_balance jumps in one UPDATE.
--
-- Does NOT re-lock normal play (taps, offline bot, spends).
-- Decreases always allowed. Gains must match lifetime growth
-- (or stay under hard caps).
--
-- Run once in Supabase SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION public.players_economy_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  shard_gain numeric;
  ltt_gain numeric;
  gft_gain numeric;
  shards_burned numeric;
  max_shard_gain numeric;
  max_gft_gain numeric;
  -- Slack for referrals / races / multi-device (must stay playable)
  extra_shard_slack numeric := 6000;
  hard_shard_cap numeric := 5000000;   -- single write ceiling
  bare_gft_cap numeric := 50000;      -- G2U credit without shard burn
BEGIN
  -- Inserts: only soft-cap absurd starter values
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.shard_balance, 0) > 100000 THEN
      RAISE EXCEPTION 'ECONOMY_GUARD: starter shard_balance too high';
    END IF;
    IF COALESCE(NEW.gft_token_balance, 0) > 10000 THEN
      RAISE EXCEPTION 'ECONOMY_GUARD: starter gft_token_balance too high';
    END IF;
    RETURN NEW;
  END IF;

  shard_gain := COALESCE(NEW.shard_balance, 0) - COALESCE(OLD.shard_balance, 0);
  ltt_gain := COALESCE(NEW.lifetime_taps, 0) - COALESCE(OLD.lifetime_taps, 0);
  gft_gain := COALESCE(NEW.gft_token_balance, 0) - COALESCE(OLD.gft_token_balance, 0);
  shards_burned := GREATEST(0, COALESCE(OLD.shard_balance, 0) - COALESCE(NEW.shard_balance, 0));

  -- lifetime_taps cannot jump by absurd amounts in one write (blocks dual DevTools edit)
  IF ltt_gain > hard_shard_cap THEN
    RAISE EXCEPTION 'ECONOMY_GUARD: lifetime_taps jump blocked (gain %, max %)',
      ltt_gain, hard_shard_cap;
  END IF;

  -- Shard increases must track lifetime_taps growth (this game adds both together)
  IF shard_gain > 0.001 THEN
    max_shard_gain := GREATEST(0, ltt_gain) + extra_shard_slack;
    IF max_shard_gain > hard_shard_cap THEN
      max_shard_gain := hard_shard_cap;
    END IF;
    IF shard_gain > max_shard_gain THEN
      RAISE EXCEPTION 'ECONOMY_GUARD: shard_balance jump blocked (gain %, max %)',
        shard_gain, max_shard_gain;
    END IF;
  END IF;

  -- G2U credit jumps: allow if shards burned (swap), else small bare cap
  IF gft_gain > 0.000001 THEN
    -- ~1000 shards per G2U; 2x slack for fees/tiers; also bare vault-style room
    max_gft_gain := GREATEST(bare_gft_cap, (shards_burned / 100.0) * 2.0);
    IF gft_gain > max_gft_gain THEN
      RAISE EXCEPTION 'ECONOMY_GUARD: gft_token_balance jump blocked (gain %, max %)',
        gft_gain, max_gft_gain;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_players_economy_guard ON public.players;
CREATE TRIGGER trg_players_economy_guard
  BEFORE INSERT OR UPDATE OF shard_balance, gft_token_balance, lifetime_taps
  ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.players_economy_guard();

COMMENT ON FUNCTION public.players_economy_guard() IS
  'Soft anti-cheat 2026-08-07: block absurd shard/G2U writes; allows normal taps/bot/spends/swaps.';
