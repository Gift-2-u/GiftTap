-- =============================================================================
-- Airdrop allocations (L5 / weekly / monthly)
-- Snapshot scripts write rows here. Players claim via Edge only.
-- Does NOT touch players.last_updated (energy clock stays alone).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.airdrop_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id text NOT NULL,
  username text,
  source text NOT NULL CHECK (source IN ('l5', 'weekly', 'monthly')),
  period_id text NOT NULL,
  amount numeric(24, 6) NOT NULL CHECK (amount > 0),
  weight numeric(24, 6),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claim_tx text,
  CONSTRAINT airdrop_allocations_unique_drop UNIQUE (telegram_id, source, period_id)
);

CREATE INDEX IF NOT EXISTS airdrop_allocations_player_pending_idx
  ON public.airdrop_allocations (telegram_id)
  WHERE claimed_at IS NULL;

CREATE INDEX IF NOT EXISTS airdrop_allocations_source_period_idx
  ON public.airdrop_allocations (source, period_id);

COMMENT ON TABLE public.airdrop_allocations IS
  'Snapshot $G2U drops (l5/weekly/monthly). Claim via Edge; never mass-update players.';

REVOKE ALL ON TABLE public.airdrop_allocations FROM PUBLIC;
REVOKE ALL ON TABLE public.airdrop_allocations FROM anon;
REVOKE ALL ON TABLE public.airdrop_allocations FROM authenticated;
GRANT ALL ON TABLE public.airdrop_allocations TO service_role;
GRANT ALL ON TABLE public.airdrop_allocations TO postgres;
