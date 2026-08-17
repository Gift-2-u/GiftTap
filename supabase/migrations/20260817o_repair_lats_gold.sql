-- lats W33: rank 2 → gold
-- Snapshot: badge_tier = gold, telegram_id = bbb83d58-c498-4b92-ac78-a7ffcacb8061
-- Run in Supabase SQL Editor

BEGIN;

INSERT INTO public.badge_grants (player_id, week_id, rank, tier)
VALUES (
  'bbb83d58-c498-4b92-ac78-a7ffcacb8061',
  '2026-W33',
  2,
  'gold'
)
ON CONFLICT (player_id, week_id) DO UPDATE
  SET rank = 2,
      tier = 'gold';

UPDATE public.players
SET
  inventory =
    coalesce(inventory, '{}'::jsonb)
    || jsonb_build_object(
      'badge_gold',
      GREATEST(1, coalesce((inventory ->> 'badge_gold')::int, 0)),
      'weekly_badge_award',
      jsonb_build_object(
        'weekId', '2026-W33',
        'tier', 'gold',
        'rank', 2,
        'claimedAt', now()::text,
        'repaired', true
      )
    ),
  last_updated = now()
WHERE telegram_id = 'bbb83d58-c498-4b92-ac78-a7ffcacb8061';

COMMIT;

SELECT
  username,
  inventory -> 'badge_gold' AS badge_gold,
  inventory -> 'badge_diamond' AS badge_diamond,
  inventory -> 'weekly_badge_award' AS award
FROM public.players
WHERE telegram_id = 'bbb83d58-c498-4b92-ac78-a7ffcacb8061';
