-- Energy regen clock separate from login last-seen.
-- last_updated = when the player last logged in / opened the game
-- energy_at + last_energy = battery regen anchor (commit-taps / refill / login catch-up)

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS energy_at timestamptz;

UPDATE public.players
SET energy_at = COALESCE(energy_at, last_updated, now())
WHERE energy_at IS NULL;

COMMENT ON COLUMN public.players.last_updated IS
  'Last time this player logged into / opened the game (per player).';

COMMENT ON COLUMN public.players.energy_at IS
  'Energy regen clock with last_energy. Independent of last_updated.';
