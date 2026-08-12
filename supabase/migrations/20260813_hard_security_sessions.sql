-- =============================================================================
-- Hard security foundation: sessions + economy flag
-- Safe to run before cutover (does not lock RLS yet).
-- =============================================================================

-- Optional durable session registry (logout / ban)
CREATE TABLE IF NOT EXISTS public.player_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  ip_hint text
);

CREATE INDEX IF NOT EXISTS idx_player_sessions_player
  ON public.player_sessions (player_id);

CREATE INDEX IF NOT EXISTS idx_player_sessions_hash
  ON public.player_sessions (token_hash);

COMMENT ON TABLE public.player_sessions IS
  'Session registry for Gift Tap hard auth. JWT is still verified by signature; rows enable revoke/logout.';

-- Economy audit ledger (written only by service_role / future Edge)
CREATE TABLE IF NOT EXISTS public.economy_events (
  id bigserial PRIMARY KEY,
  player_id text NOT NULL,
  kind text NOT NULL,
  delta numeric,
  balance_after numeric,
  ref text,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_economy_events_player_time
  ON public.economy_events (player_id, created_at DESC);

COMMENT ON TABLE public.economy_events IS
  'Append-only economy audit. Never trust client for balances after secure cutover.';

-- Feature flag on game_settings (id=1 row used by app)
ALTER TABLE public.game_settings
  ADD COLUMN IF NOT EXISTS secure_economy boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.game_settings.secure_economy IS
  'When true, clients must use JWT + Edge economy APIs; direct players UPDATE denied (after RLS cutover).';

-- Ensure settings row exists
INSERT INTO public.game_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

UPDATE public.game_settings
SET secure_economy = COALESCE(secure_economy, false)
WHERE id = 1;

-- Badge grants (official weekly awards)
CREATE TABLE IF NOT EXISTS public.badge_grants (
  id bigserial PRIMARY KEY,
  player_id text NOT NULL,
  week_id text NOT NULL,
  rank int,
  tier text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, week_id)
);

CREATE INDEX IF NOT EXISTS idx_badge_grants_week
  ON public.badge_grants (week_id, tier);

GRANT SELECT ON public.economy_events TO anon, authenticated, service_role;
GRANT SELECT ON public.badge_grants TO anon, authenticated, service_role;
GRANT SELECT ON public.player_sessions TO service_role;

-- No anon writes to ledgers
REVOKE INSERT, UPDATE, DELETE ON public.economy_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.badge_grants FROM anon, authenticated;
REVOKE ALL ON public.player_sessions FROM anon, authenticated;
GRANT ALL ON public.economy_events TO service_role;
GRANT ALL ON public.badge_grants TO service_role;
GRANT ALL ON public.player_sessions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.economy_events_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.badge_grants_id_seq TO service_role;
