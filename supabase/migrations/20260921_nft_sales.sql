-- Dedicated NFT mint sales log (Shop CM mints). Easy to open in Table Editor.
-- Do not bury sales in economy_events.

CREATE TABLE IF NOT EXISTS public.nft_sales (
  id bigserial PRIMARY KEY,
  player_id text NOT NULL,
  username text,
  elf text NOT NULL,
  rarity text NOT NULL,
  price_sol numeric,
  asset_id text NOT NULL,
  signature text,
  promo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nft_sales_asset_unique UNIQUE (asset_id)
);

CREATE INDEX IF NOT EXISTS idx_nft_sales_created
  ON public.nft_sales (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nft_sales_elf_rarity
  ON public.nft_sales (elf, rarity);

COMMENT ON TABLE public.nft_sales IS
  'One row per Gift Tap NFT mint sale. Filter/sort in Table Editor for sales tracking.';

GRANT SELECT ON public.nft_sales TO anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.nft_sales FROM anon, authenticated;
GRANT ALL ON public.nft_sales TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.nft_sales_id_seq TO service_role;
