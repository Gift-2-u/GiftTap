-- =============================================================================
-- Repair ALL weekly badge backpack counts from official snapshots (2026-W33)
-- Does NOT invent prizes — only snapshot top-10 with badge_tier.
-- Safe: badge_* + award meta + badge_grants only; keeps other inventory keys.
-- WSL path: /home/tower/gift_memecoin/supabase/migrations/20260817p_repair_all_w33_badges.sql
-- =============================================================================

-- Preview who is missing inventory badge
SELECT
  s.week_id,
  s.rank,
  s.username,
  s.telegram_id,
  s.badge_tier,
  s.score,
  coalesce((p.inventory ->> ('badge_' || s.badge_tier))::int, 0) AS inv_count,
  g.tier AS grant_tier
FROM public.weekly_leaderboard_snapshots s
LEFT JOIN public.players p ON p.telegram_id::text = s.telegram_id::text
LEFT JOIN public.badge_grants g
  ON g.player_id = s.telegram_id::text AND g.week_id = s.week_id
WHERE s.week_id = '2026-W33'
  AND s.badge_tier IS NOT NULL
  AND s.rank BETWEEN 1 AND 10
ORDER BY s.rank;

-- Repair everyone for that week
DO $$
DECLARE
  r RECORD;
  inv jsonb;
  item text;
  n int;
  week_fixed text := '2026-W33';
  fixed int := 0;
BEGIN
  FOR r IN
    SELECT
      s.week_id,
      s.rank,
      s.telegram_id::text AS pid,
      s.username,
      lower(btrim(s.badge_tier)) AS tier
    FROM public.weekly_leaderboard_snapshots s
    WHERE s.week_id = week_fixed
      AND s.badge_tier IS NOT NULL
      AND lower(btrim(s.badge_tier)) IN ('diamond', 'gold', 'silver', 'bronze')
      AND s.rank BETWEEN 1 AND 10
  LOOP
    item := 'badge_' || r.tier;

    INSERT INTO public.badge_grants (player_id, week_id, rank, tier)
    VALUES (r.pid, r.week_id, r.rank, r.tier)
    ON CONFLICT (player_id, week_id) DO UPDATE
      SET rank = EXCLUDED.rank,
          tier = EXCLUDED.tier;

    SELECT coalesce(inventory, '{}'::jsonb) INTO inv
    FROM public.players
    WHERE telegram_id::text = r.pid;

    IF NOT FOUND THEN
      RAISE NOTICE 'skip missing player % %', r.username, r.pid;
      CONTINUE;
    END IF;

    n := coalesce((inv ->> item)::int, 0);
    IF n < 1 THEN
      inv := inv || jsonb_build_object(item, 1);
      fixed := fixed + 1;
    END IF;

    inv := inv || jsonb_build_object(
      'weekly_badge_award',
      jsonb_build_object(
        'weekId', r.week_id,
        'tier', r.tier,
        'rank', r.rank,
        'claimedAt', now()::text,
        'repaired', true
      )
    );

    UPDATE public.players
    SET inventory = inv, last_updated = now()
    WHERE telegram_id::text = r.pid;

    RAISE NOTICE 'ok % rank % → %', r.username, r.rank, r.tier;
  END LOOP;

  RAISE NOTICE 'players that needed badge count fill: %', fixed;
END $$;

-- Re-check top 10
SELECT
  s.rank,
  s.username,
  s.badge_tier,
  coalesce((p.inventory ->> ('badge_' || s.badge_tier))::int, 0) AS inv_count,
  p.inventory -> 'weekly_badge_award' AS award
FROM public.weekly_leaderboard_snapshots s
JOIN public.players p ON p.telegram_id::text = s.telegram_id::text
WHERE s.week_id = '2026-W33'
  AND s.rank BETWEEN 1 AND 10
ORDER BY s.rank;
