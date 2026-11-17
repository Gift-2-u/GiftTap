-- Track premium / HUD bar buys, milestone claims, mystery opens.
-- VIEW over existing economy_events — no Edge writers.
-- Supabase → Table Editor → player_activity (filter by kind).

CREATE OR REPLACE VIEW public.player_activity AS
SELECT
  e.id,
  CASE
    WHEN e.kind = 'premium_grant' THEN 'premium_boost'
    WHEN e.kind = 'hud_boost_buy' THEN 'hud_boost'
    WHEN e.kind = 'mystery_open' THEN 'mystery_gift'
    ELSE 'milestone_claim'
  END AS kind,
  e.player_id,
  p.username,
  COALESCE(
    e.meta->>'boost_kind',
    e.meta->>'item_id',
    e.meta->>'tier',
    e.meta->>'source'
  ) AS item_id,
  CASE
    WHEN e.kind = 'premium_grant' THEN NULLIF(e.meta->>'priceG2u', '')::numeric
    WHEN e.kind = 'hud_boost_buy' THEN COALESCE(
      NULLIF(e.meta->>'priceG2u', '')::numeric,
      ABS(e.delta)
    )
    WHEN e.kind = 'airdrop_g2u_claim' THEN e.delta
    ELSE NULL
  END AS amount_g2u,
  NULLIF(e.meta->>'fee_sol', '')::numeric AS fee_sol,
  COALESCE(e.meta->>'currency', CASE WHEN e.kind = 'hud_boost_buy' THEN 'g2u' END) AS currency,
  COALESCE(
    NULLIF(e.meta->>'days', '')::integer,
    CASE WHEN e.kind = 'hud_boost_buy' THEN NULLIF(e.meta->>'days', '')::integer END
  ) AS days,
  e.ref AS signature,
  e.meta,
  e.created_at
FROM public.economy_events e
LEFT JOIN public.players p ON p.telegram_id = e.player_id
WHERE e.kind IN ('premium_grant', 'mystery_open', 'hud_boost_buy')
   OR (
     e.kind = 'airdrop_g2u_claim'
     AND COALESCE(e.meta->>'source', '') = 'milestone'
   );

COMMENT ON VIEW public.player_activity IS
  'Premium shop, HUD refill/expand/daily buys, milestone claims, mystery opens — from economy_events.';

GRANT SELECT ON public.player_activity TO anon, authenticated, service_role;
