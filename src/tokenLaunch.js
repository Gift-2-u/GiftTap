/**
 * $G2U token launch — shared countdown for site + Gift Tap.
 * Target: 1 September 2026, 00:00 UTC.
 */

export const TOKEN_LAUNCH_AT = new Date('2026-09-01T00:00:00Z').getTime();

export const TOKEN_LAUNCH_LABEL = '1 Sept 2026';

export const TOKEN_LAUNCH_TITLE = '$G2U Token Launch';

export const TOKEN_LAUNCH_BLURB =
  'Token goes live September 1. Play Gift Tap and earn badges, mystery gift available after launch.';

/** Live countdown string, or null when launched / past. */
export function formatLaunchCountdown(msLeft = TOKEN_LAUNCH_AT - Date.now()) {
  if (msLeft <= 0) return null;
  const days = Math.floor(msLeft / (1000 * 60 * 60 * 24));
  const hours = Math.floor((msLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((msLeft % (1000 * 60)) / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  if (days > 0) return `${days}d ${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`;
  return `${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`;
}

export function isTokenLaunched(now = Date.now()) {
  return now >= TOKEN_LAUNCH_AT;
}
