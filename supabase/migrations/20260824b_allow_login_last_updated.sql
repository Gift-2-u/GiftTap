-- =============================================================================
-- last_updated = per-player "last in game" + energy regen clock.
-- Login stamps last_energy (caught up) + last_updated together.
-- Drop the old guard that blocked last_updated when energy was already full
-- (same last_energy value → login stamp was reverted).
-- Weekly / inventory-only paths must still omit last_updated in app code.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_preserve_last_updated_unless_energy ON public.players;
DROP FUNCTION IF EXISTS public.preserve_last_updated_unless_energy();
