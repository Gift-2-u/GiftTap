-- Optional one-shot: repair TwrLtr backpack badge/boost visibility
-- Run in SQL Editor if UI still shows Badges empty after deploy + re-open backpack.

-- 1) Inspect
SELECT
  telegram_id,
  username,
  inventory -> 'badge_diamond' AS badge_diamond,
  inventory -> 'badge_gold' AS badge_gold,
  inventory -> 'weekly_badge_award' AS weekly_badge_award,
  inventory -> 'bot' AS bot,
  inventory -> 'refill' AS refill,
  inventory -> 'battery' AS battery,
  inventory -> 'frenzy' AS frenzy
FROM public.players
WHERE lower(username) = lower('TwrLtr')
   OR telegram_id::text = '8120672321';

SELECT * FROM public.badge_grants
WHERE player_id IN ('8120672321', (
  SELECT telegram_id::text FROM public.players WHERE lower(username) = lower('TwrLtr') LIMIT 1
));

-- 2) If badge_grants has diamond (or any tier) but inventory count is 0, re-add count
--    (service_role / SQL editor bypasses inventory freeze)
DO $$
DECLARE
  pid text;
  inv jsonb;
  g record;
  item text;
  n int;
BEGIN
  SELECT telegram_id::text INTO pid
  FROM public.players
  WHERE lower(username) = lower('TwrLtr') OR telegram_id::text = '8120672321'
  LIMIT 1;

  IF pid IS NULL THEN
    RAISE NOTICE 'player not found';
    RETURN;
  END IF;

  SELECT coalesce(inventory, '{}'::jsonb) INTO inv
  FROM public.players WHERE telegram_id::text = pid;

  FOR g IN
    SELECT week_id, tier, rank
    FROM public.badge_grants
    WHERE player_id = pid
  LOOP
    item := 'badge_' || g.tier;
    n := coalesce((inv ->> item)::int, 0);
    IF n < 1 THEN
      inv := jsonb_set(inv, ARRAY[item], to_jsonb(1), true);
    END IF;
    inv := jsonb_set(
      inv,
      '{weekly_badge_award}',
      jsonb_build_object(
        'weekId', g.week_id,
        'tier', g.tier,
        'rank', g.rank,
        'claimedAt', now(),
        'repaired', true
      ),
      true
    );
  END LOOP;

  UPDATE public.players
  SET inventory = inv, last_updated = now()
  WHERE telegram_id::text = pid;

  RAISE NOTICE 'inventory repaired for %', pid;
END $$;

-- 3) Re-check
SELECT
  inventory -> 'badge_diamond' AS badge_diamond,
  inventory -> 'weekly_badge_award' AS award,
  inventory -> 'bot' AS bot,
  inventory -> 'refill' AS refill,
  inventory -> 'battery' AS battery
FROM public.players
WHERE lower(username) = lower('TwrLtr')
   OR telegram_id::text = '8120672321';
