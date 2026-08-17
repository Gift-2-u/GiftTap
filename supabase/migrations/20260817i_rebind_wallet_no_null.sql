-- =============================================================================
-- New game wallet WITHOUT setting wallet_address to NULL
-- (wallet_address is in a PRIMARY KEY → cannot be null)
--
-- Stats are NOT touched — only wallet_address + vault.
-- =============================================================================

-- Optional: see your keys/constraints
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.players'::regclass;

-- ---------------------------------------------------------------------------
-- STEP A — You create a NEW Solana wallet first (Phantom / Solflare):
--   1. Create wallet
--   2. Write down the 12 words
--   3. Copy the public address
-- ---------------------------------------------------------------------------

BEGIN;
SET LOCAL gift.admin_wallet_override = 'on';

-- Replace BOTH placeholders:
UPDATE public.players
SET
  wallet_address = 'PASTE_NEW_PUBLIC_ADDRESS_HERE',
  last_updated = now()
WHERE lower(username) = lower('TwrLtr')
   OR telegram_id::text = '8120672321';

-- Clear old vault so you can bind the NEW phrase once (password stays)
UPDATE public.player_secrets
SET
  encrypted_vault = NULL,
  updated_at = now()
WHERE telegram_id IN (
  SELECT telegram_id::text FROM public.players
  WHERE lower(username) = lower('TwrLtr')
     OR telegram_id::text = '8120672321'
);

COMMIT;

SELECT telegram_id, username, wallet_address
FROM public.players
WHERE lower(username) = lower('TwrLtr')
   OR telegram_id::text = '8120672321';

-- Then in game:
-- 1. Log out → log in as TwrLtr (password unchanged)
-- 2. Restore with the NEW 12 words (same wallet as the address you pasted)
-- 3. Backup confirmed → send NFT to this address if it is not there yet
