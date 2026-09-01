-- =============================================================================
-- Prune high-growth tables to last 7 days (Mem / Disk IO relief).
-- Policy: keep 7d (was 14d).
--
-- KEEP (do not prune here):
--   weekly_score_ledger, weekly_leaderboard_snapshots, weekly_season_meta,
--   badge_grants, airdrop_allocations, badge_market_*, nft_market_*
--
-- Paste in Supabase SQL Editor as postgres / service_role.
-- Run PREVIEW first; then DELETEs; then optional VACUUM.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PREVIEW (safe — run this first)
-- -----------------------------------------------------------------------------
SELECT 'tap_batches' AS tbl,
       count(*) AS total_rows,
       count(*) FILTER (WHERE created_at < now() - interval '7 days') AS older_than_7d,
       min(created_at) AS oldest,
       max(created_at) AS newest
FROM public.tap_batches
UNION ALL
SELECT 'economy_events',
       count(*),
       count(*) FILTER (WHERE created_at < now() - interval '7 days'),
       min(created_at),
       max(created_at)
FROM public.economy_events
UNION ALL
SELECT 'player_sessions',
       count(*),
       count(*) FILTER (WHERE created_at < now() - interval '7 days'),
       min(created_at),
       max(created_at)
FROM public.player_sessions;

-- -----------------------------------------------------------------------------
-- DELETE (7-day retention) — run after preview looks right
-- -----------------------------------------------------------------------------
-- DELETE FROM public.tap_batches
-- WHERE created_at < now() - interval '7 days';

-- DELETE FROM public.economy_events
-- WHERE created_at < now() - interval '7 days';

-- DELETE FROM public.player_sessions
-- WHERE created_at < now() - interval '7 days';

-- -----------------------------------------------------------------------------
-- RE-CHECK counts
-- -----------------------------------------------------------------------------
-- SELECT 'tap_batches' AS t, count(*) FROM public.tap_batches
-- UNION ALL SELECT 'economy_events', count(*) FROM public.economy_events
-- UNION ALL SELECT 'player_sessions', count(*) FROM public.player_sessions;

-- -----------------------------------------------------------------------------
-- OPTIONAL: reclaim space after large deletes (can lock briefly — off-peak)
-- -----------------------------------------------------------------------------
-- VACUUM (ANALYZE) public.tap_batches;
-- VACUUM (ANALYZE) public.economy_events;
-- VACUUM (ANALYZE) public.player_sessions;
