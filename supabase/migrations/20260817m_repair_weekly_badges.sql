-- =============================================================================
-- Repair weekly badges from OFFICIAL snapshots (source of truth)
-- #1 diamond · #2 gold · #3 silver · #4–10 bronze
--
-- Fixes:
--  - claimed / grant exists but backpack shows 0
--  - wrong tier in inventory vs snapshot (e.g. gold instead of diamond)
--
-- Does NOT wipe other inventory (boosts, etc.) — only badge_* counts + award meta.
-- Run in Supabase SQL Editor.
-- =============================================================================

-- 0) Inspect snapshots for these players (edit names if needed)
SELECT s.week_id, s.rank, s.username, s.telegram_id, s.score, s.badge_tier
FROM public.weekly_leaderboard_snapshots s
WHERE lower(s.username) IN (lower('bonnetto'), lower('TwrLtr'), lower('lats'), lower('Lats'))
   OR s.telegram_id IN (
     SELECT telegram_id::text FROM public.players
     WHERE lower(username) IN (lower('bonnetto'), lower('TwrLtr'), lower('lats'), lower('Lats'))
   )
ORDER BY s.week_id DESC, s.rank;

SELECT g.*
FROM public.badge_grants g
WHERE g.player_id IN (
  SELECT telegram_id::text FROM public.players
  WHERE lower(username) IN (lower('bonnetto'), lower('TwrLtr'), lower('lats'), lower('Lats'))
)
ORDER BY g.week_id DESC;

SELECT
  p.username,
  p.telegram_id,
  p.inventory -> 'badge_diamond' AS diamond,
  p.inventory -> 'badge_gold' AS gold,
  p.inventory -> 'badge_silver' AS silver,
  p.inventory -> 'badge_bronze' AS bronze,
  p.inventory -> 'weekly_badge_award' AS award
FROM public.players p
WHERE lower(p.username) IN (lower('bonnetto'), lower('TwrLtr'), lower('lats'), lower('Lats'));

-- =============================================================================
-- 1) Sync inventory + badge_grants from snapshot for named players (all weeks)
-- =============================================================================
DO $$
DECLARE
  r RECORD;
  inv jsonb;
  item text;
  old_item text;
  n int;
  claim_key text;
  log jsonb;
  arr text[];
BEGIN
  FOR r IN
    SELECT
      s.week_id,
      s.rank,
      s.telegram_id::text AS pid,
      s.username,
      lower(coalesce(s.badge_tier, public.weekly_badge_tier_for_rank(s.rank::int))) AS tier
    FROM public.weekly_leaderboard_snapshots s
    WHERE s.badge_tier IS NOT NULL
      AND s.rank BETWEEN 1 AND 10
      AND (
        lower(s.username) IN (lower('bonnetto'), lower('TwrLtr'), lower('lats'), lower('Lats'))
        OR s.telegram_id::text IN (
          SELECT telegram_id::text FROM public.players
          WHERE lower(username) IN (lower('bonnetto'), lower('TwrLtr'), lower('lats'), lower('Lats'))
        )
      )
  LOOP
    IF r.tier IS NULL OR r.tier NOT IN ('diamond','gold','silver','bronze') THEN
      CONTINUE;
    END IF;

    item := 'badge_' || r.tier;
    claim_key := 'weekly_badge:' || r.week_id || ':award';

    -- Upsert grant to match snapshot (authoritative)
    INSERT INTO public.badge_grants (player_id, week_id, rank, tier)
    VALUES (r.pid, r.week_id, r.rank, r.tier)
    ON CONFLICT (player_id, week_id) DO UPDATE
      SET rank = EXCLUDED.rank,
          tier = EXCLUDED.tier;

    SELECT coalesce(inventory, '{}'::jsonb) INTO inv
    FROM public.players WHERE telegram_id::text = r.pid;

    IF inv IS NULL THEN
      CONTINUE;
    END IF;

    -- If award was wrong tier for this week, remove one from wrong bucket (if present)
    IF inv ? 'weekly_badge_award'
       AND (inv -> 'weekly_badge_award' ->> 'weekId') = r.week_id
       AND (inv -> 'weekly_badge_award' ->> 'tier') IS DISTINCT FROM r.tier
    THEN
      old_item := 'badge_' || (inv -> 'weekly_badge_award' ->> 'tier');
      n := coalesce((inv ->> old_item)::int, 0);
      IF n <= 1 THEN
        inv := inv - old_item;
      ELSE
        inv := jsonb_set(inv, ARRAY[old_item], to_jsonb(n - 1), true);
      END IF;
    END IF;

    -- Ensure at least 1 of correct badge
    n := coalesce((inv ->> item)::int, 0);
    IF n < 1 THEN
      inv := jsonb_set(inv, ARRAY[item], to_jsonb(1), true);
    END IF;

    -- Award meta
    inv := jsonb_set(
      inv,
      '{weekly_badge_award}',
      jsonb_build_object(
        'weekId', r.week_id,
        'tier', r.tier,
        'rank', r.rank,
        'claimedAt', now(),
        'repaired', true
      ),
      true
    );

    -- claim_log
    arr := ARRAY(
      SELECT jsonb_array_elements_text(coalesce(inv -> 'claim_log', '[]'::jsonb))
    );
    IF NOT claim_key = ANY (arr) THEN
      arr := array_append(arr, claim_key);
    END IF;
    inv := jsonb_set(inv, '{claim_log}', to_jsonb(arr), true);

    UPDATE public.players
    SET inventory = inv, last_updated = now()
    WHERE telegram_id::text = r.pid;

    RAISE NOTICE 'repaired % week % → % (rank %)', r.username, r.week_id, r.tier, r.rank;
  END LOOP;
END $$;

-- 2) Re-check
SELECT
  p.username,
  p.inventory -> 'badge_diamond' AS diamond,
  p.inventory -> 'badge_gold' AS gold,
  p.inventory -> 'badge_silver' AS silver,
  p.inventory -> 'badge_bronze' AS bronze,
  p.inventory -> 'weekly_badge_award' AS award
FROM public.players p
WHERE lower(p.username) IN (lower('bonnetto'), lower('TwrLtr'), lower('lats'), lower('Lats'));
