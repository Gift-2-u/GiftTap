-- =============================================================================
-- New in-game wallet for TwrLtr (wallet_address is NOT NULL — cannot set null)
-- Run in Supabase SQL Editor as owner.
-- =============================================================================

-- 1) Allow empty wallet only for rotate / first-bind (was blocking admin clear)
ALTER TABLE public.players
  ALTER COLUMN wallet_address DROP NOT NULL;

-- 2) Clear this player's bound wallet + vault (keep password)
BEGIN;
SET LOCAL gift.admin_wallet_override = 'on';

UPDATE public.players
SET
  wallet_address = NULL,
  last_updated = now()
WHERE lower(username) = lower('TwrLtr')
   OR telegram_id::text = '8120672321';

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

-- 3) Verify
SELECT telegram_id, username, wallet_address
FROM public.players
WHERE lower(username) = lower('TwrLtr')
   OR telegram_id::text = '8120672321';

-- Expect: wallet_address is null
-- Then: log out → log in to GiftTap → new wallet is created once → BACK UP the 12 words
