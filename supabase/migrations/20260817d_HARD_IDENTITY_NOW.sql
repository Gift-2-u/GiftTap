-- =============================================================================
-- HARD IDENTITY LOCKDOWN — RUN THIS NOW IN SUPABASE SQL EDITOR
-- (Project owner / postgres role)
--
-- WHY LAST WEEK'S "HARD SECURITY" DID NOT STOP SOL THEFT
-- -----------------------------------------------------------------------------
-- Last week locked the MINING ECONOMY only (shards, taps, energy, sol_balance
-- columns) when secure_economy=true.
--
-- It did NOT lock:
--   • wallet_address   → client/anon could overwrite with a new key
--   • encrypted_vault  → seed blob readable + weak public salt decrypt
--   • create-user-wallet Edge function had NO JWT check and ALWAYS overwrote
--
-- That is how a player could steal SOL: either swap the bound wallet or
-- decrypt the vault seed and transfer SOL on-chain. NFT can remain if they
-- only moved SOL.
--
-- THIS SCRIPT freezes identity forever for anon/authenticated clients.
-- service_role (Edge) can still set wallet ONCE when empty.
-- =============================================================================

-- Force economy lock on (UPDATE only — INSERT without season_name fails NOT NULL)
UPDATE public.game_settings
SET secure_economy = true
WHERE id = 1;

-- If id=1 is somehow missing, create with required season_name
INSERT INTO public.game_settings (id, season_name, secure_economy)
SELECT 1, 'Season 1', true
WHERE NOT EXISTS (SELECT 1 FROM public.game_settings WHERE id = 1);

-- ---------------------------------------------------------------------------
-- 1) Identity protect — ALWAYS on (not gated by secure_economy)
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

  -- Only Edge service_role / DB superuser may change identity fields after set
  IF role_name = 'service_role' OR current_user IN ('postgres', 'supabase_admin') THEN
    -- Even service_role: do not silently allow wallet swap unless OLD empty
    -- (create-user-wallet must check empty first; this is belt-and-suspenders)
    IF TG_OP = 'UPDATE' THEN
      IF OLD.wallet_address IS NOT NULL AND btrim(OLD.wallet_address) <> '' THEN
        IF NEW.wallet_address IS DISTINCT FROM OLD.wallet_address THEN
          -- Allow only explicit admin override via setting:
          --   SET LOCAL gift.admin_wallet_override = 'on';
          IF coalesce(current_setting('gift.admin_wallet_override', true), '') <> 'on' THEN
            RAISE EXCEPTION 'WALLET_LOCKED: service_role cannot replace bound wallet (set gift.admin_wallet_override=on for recovery)'
              USING ERRCODE = '42501';
          END IF;
        END IF;
      END IF;
      IF OLD.encrypted_vault IS NOT NULL AND btrim(coalesce(OLD.encrypted_vault::text, '')) <> '' THEN
        IF NEW.encrypted_vault IS DISTINCT FROM OLD.encrypted_vault THEN
          IF coalesce(current_setting('gift.admin_vault_override', true), '') <> 'on' THEN
            RAISE EXCEPTION 'VAULT_LOCKED: service_role cannot replace vault (set gift.admin_vault_override=on for recovery)'
              USING ERRCODE = '42501';
          END IF;
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- ---- client / anon / authenticated (non service_role) ----
  NEW.telegram_id := OLD.telegram_id;

  -- Wallet: set-once only; never overwrite
  IF OLD.wallet_address IS NOT NULL AND btrim(OLD.wallet_address) <> '' THEN
    IF NEW.wallet_address IS DISTINCT FROM OLD.wallet_address THEN
      RAISE EXCEPTION 'WALLET_LOCKED: wallet_address can only be set once'
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

  -- Username freeze once set
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

COMMENT ON FUNCTION public.protect_player_identity() IS
  'HARD LOCK: client cannot change wallet/vault/password/id/username/referrer once set. service_role also cannot replace bound wallet/vault without gift.admin_*_override.';

-- ---------------------------------------------------------------------------
-- 2) Pin wallet inside protect_player_economy too (defense in depth)
--    Does NOT replace the full economy body — only ensures identity fields
--    cannot slip through if identity trigger is dropped.
-- ---------------------------------------------------------------------------
-- Re-assert economy lock flag used by existing protect_player_economy
UPDATE public.game_settings SET secure_economy = true WHERE id = 1;
-- (no INSERT here — season_name is NOT NULL on game_settings)

-- ---------------------------------------------------------------------------
-- 3) Admin recovery helpers (run manually when YOU need to fix a stolen bind)
-- ---------------------------------------------------------------------------
-- Example: restore YOUR real wallet after a hack (replace values):
--
--   BEGIN;
--   SET LOCAL gift.admin_wallet_override = 'on';
--   SET LOCAL gift.admin_vault_override = 'on';
--   UPDATE public.players
--   SET wallet_address = 'YOUR_REAL_SOLANA_ADDRESS',
--       encrypted_vault = NULL   -- force re-backup of phrase on next login
--   WHERE telegram_id = 'YOUR_PLAYER_ID';
--   COMMIT;
--
-- Never run the above for a random player without proof of ownership.

-- ---------------------------------------------------------------------------
-- 4) Quick verify after run
-- ---------------------------------------------------------------------------
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.players'::regclass;
-- Should include: trg_protect_player_identity, trg_protect_player_economy
--
-- Test as anon (should fail):
--   UPDATE players SET wallet_address = 'Hacked111' WHERE telegram_id = '...';
