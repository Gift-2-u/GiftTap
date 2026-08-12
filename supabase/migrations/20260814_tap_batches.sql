-- Tap batches for commit-taps idempotency (hard security earn path)
CREATE TABLE IF NOT EXISTS public.tap_batches (
  batch_id text PRIMARY KEY,
  player_id text NOT NULL,
  taps int NOT NULL DEFAULT 0,
  energy_spent numeric,
  shards numeric,
  result jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tap_batches_player_time
  ON public.tap_batches (player_id, created_at DESC);

REVOKE ALL ON public.tap_batches FROM anon, authenticated;
GRANT ALL ON public.tap_batches TO service_role;
GRANT SELECT ON public.tap_batches TO service_role;

COMMENT ON TABLE public.tap_batches IS
  'Idempotent mining commits from commit-taps Edge Function. service_role only.';
