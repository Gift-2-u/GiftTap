-- Track premium shop purchases (duration boosts, fees, txs)
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS premium_purchase_log jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.players.premium_purchase_log IS
  'Append-only log of premium buys: [{at,item_id,days,price_g2u,price_sol,fee_sol,currency,tx}]';
