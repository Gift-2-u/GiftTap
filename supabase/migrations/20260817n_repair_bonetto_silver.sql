-- Bonetto W33: rank 3 → silver
-- Snapshot: badge_tier = silver, telegram_id = ca9b64d8-b2ce-4992-936a-661d999c5a74
-- Run in Supabase SQL Editor

BEGIN;

INSERT INTO public.badge_grants (player_id, week_id, rank, tier)
VALUES (
  'ca9b64d8-b2ce-4992-936a-661d999c5a74',
  '2026-W33',
  3,
  'silver'
)
ON CONFLICT (player_id, week_id) DO UPDATE
  SET rank = 3,
      tier = 'silver';

UPDATE public.players
SET
  inventory =
    coalesce(inventory, '{}'::jsonb)
    || jsonb_build_object(
      'badge_silver',
      GREATEST(1, coalesce((inventory ->> 'badge_silver')::int, 0)),
      'weekly_badge_award',
      jsonb_build_object(
        'weekId', '2026-W33',
        'tier', 'silver',
        'rank', 3,
        'claimedAt', now()::text,
        'repaired', true
      )
    ),
  last_updated = now()
WHERE telegram_id = 'ca9b64d8-b2ce-4992-936a-661d999c5a74';

COMMIT;

SELECT
  username,
  inventory -> 'badge_silver' AS badge_silver,
  inventory -> 'weekly_badge_award' AS award
FROM public.players
WHERE telegram_id = 'ca9b64d8-b2ce-4992-936a-661d999c5a74';
