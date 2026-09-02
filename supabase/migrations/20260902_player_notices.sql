-- Targeted in-app notices (e.g. multi-account warning). Returned by player-state.
CREATE TABLE IF NOT EXISTS public.player_notices (
  id bigserial PRIMARY KEY,
  player_id text NOT NULL,
  kind text NOT NULL DEFAULT 'warning',
  title text,
  message text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_notices_active_player
  ON public.player_notices (player_id)
  WHERE active = true;

COMMENT ON TABLE public.player_notices IS
  'Admin-targeted popups. Edge player-state returns active rows; dismiss is client-session only until active=false.';

REVOKE ALL ON TABLE public.player_notices FROM PUBLIC;
REVOKE ALL ON TABLE public.player_notices FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.player_notices TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.player_notices_id_seq TO service_role;
