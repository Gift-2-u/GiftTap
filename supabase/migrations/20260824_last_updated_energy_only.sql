-- =============================================================================
-- last_updated is the ENERGY REGEN clock for each player individually.
-- It must NOT move when weekly heals / quests / inventory-only updates run.
-- Rule: last_updated may change only when last_energy also changes
--       (commit-taps, Instant Refill, UTC day fill — same player only).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.preserve_last_updated_unless_energy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If someone bumps last_updated without changing last_energy, revert the stamp.
  -- Weekly board / badge / quest / NFT activate used to mass-move this clock.
  IF NEW.last_updated IS DISTINCT FROM OLD.last_updated
     AND NEW.last_energy IS NOT DISTINCT FROM OLD.last_energy THEN
    NEW.last_updated := OLD.last_updated;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_preserve_last_updated_unless_energy ON public.players;
CREATE TRIGGER trg_preserve_last_updated_unless_energy
  BEFORE UPDATE ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.preserve_last_updated_unless_energy();

COMMENT ON FUNCTION public.preserve_last_updated_unless_energy() IS
  'Keeps last_updated as per-player energy regen clock: ignore stamps that do not also change last_energy.';
