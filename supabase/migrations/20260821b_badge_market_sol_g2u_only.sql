-- Badge market: SOL now, G2U token after launch (no G2Ushards).
-- Safe to re-run after 20260821_badge_market.sql

ALTER TABLE public.badge_market_listings
  DROP CONSTRAINT IF EXISTS badge_market_listings_currency_check;

ALTER TABLE public.badge_market_listings
  ADD CONSTRAINT badge_market_listings_currency_check
  CHECK (currency IN ('sol', 'g2u'));

-- Drop any shards listings if someone listed during draft
UPDATE public.badge_market_listings
SET status = 'cancelled',
    cancelled_at = now(),
    updated_at = now()
WHERE status = 'active' AND currency = 'shards';

ALTER TABLE public.badge_market_treasury
  ADD COLUMN IF NOT EXISTS g2u_balance numeric NOT NULL DEFAULT 0;

COMMENT ON TABLE public.badge_market_listings IS
  'In-game P2P weekly badges. currency=sol (live) or g2u (token after launch). Not G2Ushards.';
