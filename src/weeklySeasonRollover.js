/**
 * Client no longer runs weekly snapshot or badge grants.
 *
 * Snapshot + awarding winners = server cron only
 * (ensure_weekly_leaderboard_rollover / grant_weekly_badges_from_snapshot).
 *
 * Kept as a no-op so GiftTap call sites still compile; opening the game or
 * Weekly as TwrLtr (or anyone) must not touch winners.
 */
export async function ensureWeeklySeasonRollover(_opts = {}) {
  return { ok: true, skipped: 'server_only' };
}
