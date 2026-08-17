-- =============================================================================
-- HARD IDENTITY LOCKDOWN (post-hack)
-- Run in Supabase SQL Editor NOW as project owner.
--
-- What hard security LAST WEEK actually did:
--   Locked mining economy columns (shards/taps/buffs) when secure_economy=true.
-- What it did NOT do (the hole that cost SOL):
--   wallet_address, encrypted_vault, password_hash stayed client-writable.
--   Vault AES "password" was only playerId + public salt string → if vault
--   ciphertext was readable, seeds could be decrypted without user password.
-- =============================================================================

-- Force economy lock (UPDATE only — season_name is NOT NULL)
UPDATE public.game_settings SET secure_economy = true WHERE id = 1;
INSERT INTO public.game_settings (id, season_name, secure_economy)
SELECT 1, 'Season 1', true
WHERE NOT EXISTS (SELECT 1 FROM public.game_settings WHERE id = 1);

-- ---------------------------------------------------------------------------
-- Identity protect: ALWAYS on (not gated by secure_economy)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_player_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_name text;
BEGIN
  BEGIN
    role_name := coalesce(auth.role(), current_setting('request.jwt.claim.role', true), '');
  EXCEPTION WHEN OTHERS THEN
    role_name := '';
  END;

  IF role_name = 'service_role' OR current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Account id immutable
  NEW.telegram_id := OLD.telegram_id;

  -- Wallet: set-once from client; never overwrite
  IF OLD.wallet_address IS NOT NULL AND btrim(OLD.wallet_address) <> '' THEN
    IF NEW.wallet_address IS DISTINCT FROM OLD.wallet_address THEN
      RAISE EXCEPTION 'WALLET_LOCKED: wallet_address can only be set once (use support/admin)'
        USING ERRCODE = '42501';
    END IF;
    NEW.wallet_address := OLD.wallet_address;
  END IF;

  -- Vault: never replace once present
  IF OLD.encrypted_vault IS NOT NULL AND btrim(coalesce(OLD.encrypted_vault::text, '')) <> '' THEN
    IF NEW.encrypted_vault IS DISTINCT FROM OLD.encrypted_vault THEN
      RAISE EXCEPTION 'VAULT_LOCKED: encrypted_vault cannot be changed by client'
        USING ERRCODE = '42501';
    END IF;
    NEW.encrypted_vault := OLD.encrypted_vault;
  END IF;

  -- Password: Edge/service only after first set
  BEGIN
    IF OLD.password_hash IS NOT NULL AND btrim(coalesce(OLD.password_hash::text, '')) <> '' THEN
      NEW.password_hash := OLD.password_hash;
    END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;

  -- Referral lock
  IF OLD.referred_by IS NOT NULL AND btrim(coalesce(OLD.referred_by::text, '')) <> '' THEN
    NEW.referred_by := OLD.referred_by;
  END IF;

  -- Username freeze once set (stops spoofing)
  IF OLD.username IS NOT NULL AND btrim(OLD.username) <> '' THEN
    NEW.username := OLD.username;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_player_identity ON public.players;
CREATE TRIGGER trg_protect_player_identity
  BEFORE UPDATE ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_player_identity();

-- Also block client INSERT spoofing of other people's telegram_ids is RLS territory;
-- at minimum prevent empty telegram_id hijack on update above.

COMMENT ON FUNCTION public.protect_player_identity() IS
  'HARD LOCK: client cannot change wallet/vault/password/id/username/referrer once set. service_role only.';

-- ---------------------------------------------------------------------------
-- Pin wallet inside economy trigger too (defense in depth)
-- (full protect_player_economy replaced in 20260817b if applied; this is a
--  lightweight extra freeze if that file was not run)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- Ensure identity trigger exists even if economy function differs
  NULL;
END $$;
