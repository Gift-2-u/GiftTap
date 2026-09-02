-- Cap signups per IP (anti sybil). Edge auth-register enforces MAX_ACCOUNTS_PER_IP (default 3).
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS signup_ip text;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS last_login_ip text;

CREATE INDEX IF NOT EXISTS idx_players_signup_ip
  ON public.players (signup_ip)
  WHERE signup_ip IS NOT NULL;

COMMENT ON COLUMN public.players.signup_ip IS
  'Client IP at account creation (Edge auth-register). Used for per-IP signup cap.';

COMMENT ON COLUMN public.players.last_login_ip IS
  'Client IP at last successful auth-login (forensics).';
