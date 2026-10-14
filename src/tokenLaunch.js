/**
 * $G2U token — launched 1 Sept 2026 UTC.
 * Homepage no longer shows a countdown board; use G2U_BUY_URL for Buy CTA.
 */

export const TOKEN_LAUNCH_AT = new Date('2026-09-01T00:00:00Z').getTime();

export const TOKEN_LAUNCH_LABEL = '1 Sept 2026';

export const TOKEN_LAUNCH_TITLE = '$G2U Token Launch';

export const TOKEN_LAUNCH_BLURB =
  'Token goes live September 1. Play Gift Tap and earn badges, mystery gift available after launch.';

/** Official $G2U mint (Gift2U). */
export const G2U_MINT = 'EvFu9qKTNi3wWDbgnm5qmZjLFUHDN3o4A8HjUrqaGMBR';

/** Raydium swap: SOL → $G2U */
export const G2U_BUY_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_G2U_BUY_URL) ||
  `https://raydium.io/swap/?inputMint=So11111111111111111111111111111111111111112&outputMint=${G2U_MINT}`;

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
