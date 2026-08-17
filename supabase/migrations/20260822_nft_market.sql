-- In-game P2P market for owned Gift NFTs (GiftLocksmith / Gift2u Elves).
-- SOL now; G2U after launch. 5% treasury. Not G2Ushards.
-- Safe to paste in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.nft_market_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id text NOT NULL,
  seller_username text,
  seller_wallet text NOT NULL,
  asset_id text NOT NULL,
  collection text,
  name text,
  image_url text,
  currency text NOT NULL DEFAULT 'sol' CHECK (currency IN ('sol', 'g2u')),
  price numeric NOT NULL CHECK (price > 0),
  -- active = listed; paid = buyer paid, waiting NFT transfer; sold = complete; cancelled
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paid', 'sold', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  sold_at timestamptz,
  cancelled_at timestamptz,
  buyer_id text,
  buyer_username text,
  buyer_wallet text,
  pay_tx_signature text,
  transfer_tx_signature text,
  gross_amount numeric,
  fee_amount numeric,
  seller_net numeric
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_nft_market_one_active_asset
  ON public.nft_market_listings (asset_id)
  WHERE status IN ('active', 'paid');

CREATE INDEX IF NOT EXISTS idx_nft_market_active
  ON public.nft_market_listings (status, created_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_nft_market_seller
  ON public.nft_market_listings (seller_id, status);

CREATE INDEX IF NOT EXISTS idx_nft_market_pay_tx
  ON public.nft_market_listings (pay_tx_signature)
  WHERE pay_tx_signature IS NOT NULL;

ALTER TABLE public.nft_market_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nft_market_listings_select ON public.nft_market_listings;
CREATE POLICY nft_market_listings_select ON public.nft_market_listings
  FOR SELECT TO anon, authenticated
  USING (true);

GRANT SELECT ON public.nft_market_listings TO anon, authenticated, service_role;
GRANT ALL ON public.nft_market_listings TO service_role;

COMMENT ON TABLE public.nft_market_listings IS
  'In-game NFT P2P (Locksmith). SOL live; G2U after launch. paid=awaiting seller transfer.';
