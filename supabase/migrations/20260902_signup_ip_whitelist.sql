-- Owner / trusted networks: skip MAX_ACCOUNTS_PER_IP signup cap
CREATE TABLE IF NOT EXISTS public.signup_ip_whitelist (
  ip text PRIMARY KEY,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.signup_ip_whitelist IS
  'IPs that may create unlimited accounts (owner/dev). Checked by auth-register assertSignupIpCap.';

REVOKE ALL ON TABLE public.signup_ip_whitelist FROM PUBLIC;
REVOKE ALL ON TABLE public.signup_ip_whitelist FROM anon, authenticated;
GRANT ALL ON TABLE public.signup_ip_whitelist TO service_role;
GRANT ALL ON TABLE public.signup_ip_whitelist TO postgres;

INSERT INTO public.signup_ip_whitelist (ip, note)
VALUES ('70.81.239.95', 'owner network — TwrLtr/lats/lili')
ON CONFLICT (ip) DO UPDATE SET note = EXCLUDED.note;
