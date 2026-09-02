-- players.ip = most recent login/register IP
-- players.signup_ip = IP at account creation (already added earlier; ensure present)

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS signup_ip text;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS ip text;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS last_login_ip text;

CREATE INDEX IF NOT EXISTS idx_players_ip
  ON public.players (ip)
  WHERE ip IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_players_signup_ip
  ON public.players (signup_ip)
  WHERE signup_ip IS NOT NULL;

COMMENT ON COLUMN public.players.ip IS
  'Most recent client IP (auth-login / auth-register).';

COMMENT ON COLUMN public.players.signup_ip IS
  'Client IP at account creation (auth-register).';

-- Backfill from player_sessions when possible
-- latest session ip → players.ip
UPDATE public.players p
SET ip = s.ip_hint,
    last_login_ip = COALESCE(p.last_login_ip, s.ip_hint)
FROM (
  SELECT DISTINCT ON (player_id)
    player_id,
    ip_hint
  FROM public.player_sessions
  WHERE ip_hint IS NOT NULL AND btrim(ip_hint) <> ''
  ORDER BY player_id, created_at DESC NULLS LAST
) s
WHERE p.telegram_id = s.player_id
  AND (p.ip IS NULL OR btrim(p.ip) = '');

-- earliest session ip → signup_ip (only if empty)
UPDATE public.players p
SET signup_ip = s.ip_hint
FROM (
  SELECT DISTINCT ON (player_id)
    player_id,
    ip_hint
  FROM public.player_sessions
  WHERE ip_hint IS NOT NULL AND btrim(ip_hint) <> ''
  ORDER BY player_id, created_at ASC NULLS LAST
) s
WHERE p.telegram_id = s.player_id
  AND (p.signup_ip IS NULL OR btrim(p.signup_ip) = '');
