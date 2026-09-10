-- Allow personal milestone rows in airdrop_allocations (stack into one open claim).
ALTER TABLE public.airdrop_allocations
  DROP CONSTRAINT IF EXISTS airdrop_allocations_source_check;

ALTER TABLE public.airdrop_allocations
  ADD CONSTRAINT airdrop_allocations_source_check
  CHECK (source IN ('l5', 'weekly', 'monthly', 'milestone'));

COMMENT ON TABLE public.airdrop_allocations IS
  'Snapshot $G2U drops (l5/weekly/monthly/milestone). Claim via Edge; never mass-update players.';
