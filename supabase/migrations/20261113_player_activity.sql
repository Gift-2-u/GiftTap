-- Track who buys premium boosts and who claims milestone / mystery prizes.
-- VIEW over existing economy_events — no Edge writers, no new function URL.
-- Supabase → Table Editor → player_activity (filter by kind).

CREATE OR REPLACE VIEW public.player_activity AS
SELECT
  e.id,
  CASE
    WHEN e.kind = 'premium_grant' THEN 'premium_boost'
    WHEN e.kind = 'mystery_open' THEN 'mystery_gift'
    ELSE 'milestone_claim'
  END AS kind,
  e.player_id,
  p.username,
  COALESCE(
    e.meta->>'item_id',
    e.meta->>'tier',
    e.meta->>'source'
  ) AS item_id,
  CASE
    WHEN e.kind = 'premium_grant' THEN NULLIF(e.meta->>'priceG2u', '')::numeric
    WHEN e.kind = 'airdrop_g2u_claim' THEN e.delta
    ELSE NULL
  END AS amount_g2u,
  NULLIF(e.meta->>'fee_sol', '')::numeric AS fee_sol,
  e.meta->>'currency' AS currency,
  NULLIF(e.meta->>'days', '')::integer AS days,
  e.ref AS signature,
  e.meta,
  e.created_at
FROM public.economy_events e
LEFT JOIN public.players p ON p.telegram_id = e.player_id
WHERE e.kind IN ('premium_grant', 'mystery_open')
   OR (
     e.kind = 'airdrop_g2u_claim'
     AND COALESCE(e.meta->>'source', '') = 'milestone'
   );

COMMENT ON VIEW public.player_activity IS
  'Premium boost buys, milestone $G2U claims, mystery gift opens — from economy_events.';

GRANT SELECT ON public.player_activity TO anon, authenticated, service_role;
