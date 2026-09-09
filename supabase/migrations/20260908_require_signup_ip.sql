-- Reject any new player row without a real signup_ip (even service_role).
-- Paste in Supabase SQL editor if Edge was stale / bypassed.

CREATE OR REPLACE FUNCTION public.require_player_signup_ip()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.signup_ip IS NULL OR btrim(NEW.signup_ip) = '' THEN
    RAISE EXCEPTION 'signup_ip required';
  END IF;
  IF NEW.ip IS NULL OR btrim(NEW.ip) = '' THEN
    NEW.ip := NEW.signup_ip;
  END IF;
  IF NEW.last_login_ip IS NULL OR btrim(NEW.last_login_ip) = '' THEN
    NEW.last_login_ip := NEW.signup_ip;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_player_signup_ip ON public.players;
CREATE TRIGGER trg_require_player_signup_ip
  BEFORE INSERT ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.require_player_signup_ip();

COMMENT ON FUNCTION public.require_player_signup_ip() IS
  'Blocks player inserts with empty signup_ip (anti sybil / missing CF headers).';
