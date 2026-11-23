-- Permanent activity log. Replaces the old VIEW over economy_events
-- (that view disappeared when economy_events was pruned ~5d).
-- This TABLE is never pruned.

DROP VIEW IF EXISTS public.player_activity;

CREATE TABLE IF NOT EXISTS public.player_activity (
  id bigserial PRIMARY KEY,
  kind text NOT NULL
    CHECK (kind IN (
      'premium_boost',
      'hud_boost',
      'milestone_claim',
      'mystery_gift'
    )),
  player_id text NOT NULL,
  username text,
  item_id text,
  amount_g2u numeric,
  fee_sol numeric,
  currency text,
  days integer,
  signature text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_activity_created
  ON public.player_activity (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_player_activity_kind_time
  ON public.player_activity (kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_player_activity_player
  ON public.player_activity (player_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_player_activity_signature
  ON public.player_activity (signature)
  WHERE signature IS NOT NULL AND length(signature) >= 32;

COMMENT ON TABLE public.player_activity IS
  'Durable log: premium / HUD boosts / milestone claims / mystery opens. Never prune.';

GRANT SELECT ON public.player_activity TO anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.player_activity FROM anon, authenticated;
GRANT ALL ON public.player_activity TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.player_activity_id_seq TO service_role;
