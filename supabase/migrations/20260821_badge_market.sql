-- =============================================================================
-- In-game weekly badge marketplace (P2P)
-- - Sell badges from backpack (escrowed on list)
-- - Buy with G2Ushards (server balance) or SOL (on-chain pay, then settle)
-- - 5% fee to treasury
-- Safe to paste in Supabase SQL Editor (idempotent).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.badge_market_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id text NOT NULL,
  seller_username text,
  tier text NOT NULL CHECK (tier IN ('bronze', 'silver', 'gold', 'diamond')),
  qty int NOT NULL CHECK (qty > 0),
  -- sol = live; g2u = G2U token after launch (never G2Ushards)
  currency text NOT NULL CHECK (currency IN ('sol', 'g2u')),
  unit_price numeric NOT NULL CHECK (unit_price > 0),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'sold', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sold_at timestamptz,
  cancelled_at timestamptz,
  buyer_id text,
  buyer_username text,
  tx_signature text,
  gross_amount numeric,
  fee_amount numeric,
  seller_net numeric
);

CREATE INDEX IF NOT EXISTS idx_badge_market_active
  ON public.badge_market_listings (status, currency, tier, created_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_badge_market_seller
  ON public.badge_market_listings (seller_id, status);

CREATE INDEX IF NOT EXISTS idx_badge_market_tx
  ON public.badge_market_listings (tx_signature)
  WHERE tx_signature IS NOT NULL;

-- Treasury accumulators (shards fees + accounting for SOL fees)
CREATE TABLE IF NOT EXISTS public.badge_market_treasury (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  g2u_balance numeric NOT NULL DEFAULT 0 CHECK (g2u_balance >= 0),
  sol_fees_accounted numeric NOT NULL DEFAULT 0 CHECK (sol_fees_accounted >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.badge_market_treasury (id, g2u_balance, sol_fees_accounted)
VALUES (1, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- If an older draft table used shard_balance / shards currency, normalize:
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'badge_market_treasury'
      AND column_name = 'shard_balance'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'badge_market_treasury'
      AND column_name = 'g2u_balance'
  ) THEN
    ALTER TABLE public.badge_market_treasury RENAME COLUMN shard_balance TO g2u_balance;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- RLS: clients read active listings only; writes via service_role Edge only
ALTER TABLE public.badge_market_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_market_treasury ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS badge_market_listings_select ON public.badge_market_listings;
CREATE POLICY badge_market_listings_select ON public.badge_market_listings
  FOR SELECT TO anon, authenticated
  USING (status = 'active' OR true);
  -- allow select all for now (seller sees own sold/cancelled via Edge); tighten later if needed

DROP POLICY IF EXISTS badge_market_treasury_deny ON public.badge_market_treasury;
CREATE POLICY badge_market_treasury_deny ON public.badge_market_treasury
  FOR SELECT TO anon, authenticated
  USING (false);

GRANT SELECT ON public.badge_market_listings TO anon, authenticated, service_role;
GRANT ALL ON public.badge_market_listings TO service_role;
GRANT ALL ON public.badge_market_treasury TO service_role;

COMMENT ON TABLE public.badge_market_listings IS
  'In-game P2P weekly badge listings; badges escrowed (removed from seller inventory) while active';
COMMENT ON TABLE public.badge_market_treasury IS
  '5% market fees: shard_balance + sol_fees_accounted (SOL fees paid on-chain to treasury wallet)';
