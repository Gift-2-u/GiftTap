-- =============================================================================
-- Prune high-growth tables to last 5 days (Mem / Disk IO).
-- KEEP: weekly/season ledgers, snapshots, badge_grants, airdrop_*, season_history
-- Paste in Supabase SQL Editor. VACUUM must run via psql (not in a transaction).
-- =============================================================================

-- PREVIEW
SELECT 'tap_batches' AS tbl,
       count(*) AS total_rows,
       count(*) FILTER (WHERE created_at < now() - interval '5 days') AS older_than_5d,
       min(created_at) AS oldest,
       max(created_at) AS newest
FROM public.tap_batches
UNION ALL
SELECT 'economy_events',
       count(*),
       count(*) FILTER (WHERE created_at < now() - interval '5 days'),
       min(created_at),
       max(created_at)
FROM public.economy_events
UNION ALL
SELECT 'player_sessions',
       count(*),
       count(*) FILTER (WHERE created_at < now() - interval '5 days'),
       min(created_at),
       max(created_at)
FROM public.player_sessions;

-- DELETE (run after preview)
-- DELETE FROM public.tap_batches WHERE created_at < now() - interval '5 days';
-- DELETE FROM public.economy_events WHERE created_at < now() - interval '5 days';
-- DELETE FROM public.player_sessions WHERE created_at < now() - interval '5 days';
