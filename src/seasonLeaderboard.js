/**
 * Season main board eligibility (GiftLocksmith giveaway tiers use the same set).
 *
 * Reference pace: 1000 taps/day of the season.
 * Floor = 20% of that pace × day number:
 *   day 1 → 200, day 5 → 1000, day 10 → 2000, …
 */

export const SEASON_DAILY_REFERENCE = 1000;
/** 20% of 1000/day reference pace */
export const SEASON_FLOOR_PCT = 0.2;

/**
 * 1-based UTC-ish day index from season start.
 * Day 1 = first calendar day of the season (including partial day).
 */
export function getSeasonDayNumber(seasonStartMs, nowMs = Date.now()) {
  const start = Number(seasonStartMs);
  if (!Number.isFinite(start) || start <= 0) return 1;
  if (nowMs < start) return 1;
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((nowMs - start) / dayMs) + 1;
}

/** Minimum season score to appear on the main season leaderboard */
export function getSeasonBoardFloor(seasonDayNumber) {
  const day = Math.max(1, Math.floor(Number(seasonDayNumber) || 1));
  return Math.floor(SEASON_DAILY_REFERENCE * SEASON_FLOOR_PCT * day);
}

export function getSeasonScore(row) {
  if (!row) return 0;
  return Number(row.score ?? row.season_shards ?? row.lifetime_taps ?? 0) || 0;
}

/**
 * Main board list: score >= floor, sorted desc, max `limit` rows.
 */
export function filterSeasonMainBoard(rows, floor, limit = 100) {
  const f = Math.max(0, Number(floor) || 0);
  return (rows || [])
    .filter((r) => getSeasonScore(r) >= f)
    .sort((a, b) => getSeasonScore(b) - getSeasonScore(a))
    .slice(0, limit);
}

/**
 * Rank among full season list (1 = highest score).
 * `allRows` should be sorted desc by score when possible.
 */
export function rankInSeason(allRows, playerId, dbPlayerIdCol = 'telegram_id') {
  if (!playerId || !allRows?.length) return null;
  const pid = String(playerId);
  const sorted = [...allRows].sort((a, b) => getSeasonScore(b) - getSeasonScore(a));
  const idx = sorted.findIndex(
    (r) => String(r[dbPlayerIdCol] || r.id || '') === pid,
  );
  if (idx < 0) return null;
  return {
    rank: idx + 1,
    row: sorted[idx],
    score: getSeasonScore(sorted[idx]),
    total: sorted.length,
  };
}

export function seasonFloorLabel(floor, day) {
  const pct = Math.round(SEASON_FLOOR_PCT * 100);
  return `Main board: ≥ ${Number(floor).toLocaleString()} season score (day ${day} · ${pct}% of ${SEASON_DAILY_REFERENCE.toLocaleString()}/day). Under that: off main board; giveaway tiers count main-board players only.`;
}
