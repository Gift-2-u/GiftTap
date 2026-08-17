-- =============================================================================
-- HARD SECURITY: secrets unreadable to anon/authenticated players
-- Run in Supabase SQL Editor as owner.
--
-- encrypted_vault + password_hash + encryption_iv:
--   • NOT selectable via anon/authenticated PostgREST
--   • service_role (Edge + your dashboard service key) still full access
--   • Owner reads vault ONLY via Edge wallet-vault after game JWT
-- =============================================================================

-- 1) Economy flag
UPDATE public.game_settings SET secure_economy = true WHERE id = 1;

-- 1b) Wipe recon garbage vaults (literal "probe" is not real ciphertext)
UPDATE public.players
SET encrypted_vault = NULL
WHERE encrypted_vault IS NOT NULL
  AND (
    btrim(encrypted_vault::text) = 'probe'
    OR length(btrim(encrypted_vault::text)) < 20
  );

-- 2) Column privileges: strip table-wide access, grant only safe columns
DO $$
DECLARE
  safe_cols text;
  n int;
BEGIN
  SELECT count(*) INTO n
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'players';

  IF n = 0 THEN
    RAISE EXCEPTION 'public.players not found';
  END IF;

  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO safe_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'players'
    AND column_name NOT IN (
      'encrypted_vault',
      'password_hash',
      'encryption_iv'
    );

  IF safe_cols IS NULL OR length(safe_cols) < 3 THEN
    RAISE EXCEPTION 'No safe columns resolved for players';
  END IF;

  -- Drop broad grants that expose secrets
  REVOKE ALL ON TABLE public.players FROM PUBLIC;
  REVOKE ALL ON TABLE public.players FROM anon;
  REVOKE ALL ON TABLE public.players FROM authenticated;

  -- SELECT: public profile/game fields only (NO vault, NO password)
  EXECUTE format(
    'GRANT SELECT (%s) ON TABLE public.players TO anon, authenticated',
    safe_cols
  );

  -- UPDATE: same safe columns only (triggers still freeze values)
  EXECUTE format(
    'GRANT UPDATE (%s) ON TABLE public.players TO anon, authenticated',
    safe_cols
  );

  -- INSERT: allow signup-shaped rows without secrets (Edge auth-register uses service_role)
  EXECUTE format(
    'GRANT INSERT (%s) ON TABLE public.players TO anon, authenticated',
    safe_cols
  );

  -- service_role keeps full access via superuser-style bypass in Supabase
  GRANT ALL ON TABLE public.players TO service_role;
  GRANT ALL ON TABLE public.players TO postgres;

  RAISE NOTICE 'players secrets locked. Safe columns granted: %', safe_cols;
END $$;

-- 3) Explicit deny comments
COMMENT ON COLUMN public.players.encrypted_vault IS
  'HARD SECRET: not granted to anon/authenticated. Owner read via Edge wallet-vault + JWT only.';
COMMENT ON COLUMN public.players.password_hash IS
  'HARD SECRET: not granted to anon/authenticated. Edge auth-login only.';

-- 4) Verify (as owner you still see secrets; anon must not)
-- In SQL editor (postgres) this still works:
--   SELECT encrypted_vault FROM players LIMIT 1;
-- From browser with anon key, encrypted_vault must be omitted or error if forced.
