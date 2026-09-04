/**
 * GiftTap Battle — Falling Gifts duel rules (client + mirrored on server).
 *
 * PvP async: both players get the same seed → same drop timeline.
 * Tap gifts before they hit the floor. Highest catch score wins the pot.
 */

export const BATTLE = {
  DURATION_MS: 20_000,
  /** Entry: spend this much battery energy AND consume the same from today's daily tap room */
  ENTRY_ENERGY: 50,
  /** Winner backpack reward (same weekly badge items) */
  WIN_BADGE: 'badge_bronze',
  WIN_BADGE_QTY: 1,
  MAX_DAILY_MATCHES: 20,
  ARENA_WIDTH: 320,
  ARENA_HEIGHT: 480,
  GIFT_SIZE: 44,
  /** Base fall speed px/s; ramps over the match */
  FALL_SPEED_START: 140,
  FALL_SPEED_END: 280,
  SPAWN_EVERY_MS: 700,
  GOLDEN_CHANCE: 0.12,
  GOLDEN_POINTS: 3,
  NORMAL_POINTS: 1,
};

/** Mulberry32 seeded PRNG — same seed → same drops on both clients + server. */
export function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeedString(s) {
  let h = 2166136261;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Precompute every gift drop for a match (deterministic).
 * @returns {{ id: number, x: number, spawnAt: number, speed: number, points: number, kind: 'normal'|'golden' }[]}
 */
export function buildDropSchedule(seed, opts = {}) {
  const duration = opts.durationMs ?? BATTLE.DURATION_MS;
  const width = opts.width ?? BATTLE.ARENA_WIDTH;
  const size = opts.giftSize ?? BATTLE.GIFT_SIZE;
  const rng = mulberry32(
    typeof seed === 'number' ? seed : hashSeedString(seed),
  );
  const drops = [];
  let t = 400;
  let id = 0;
  while (t < duration - 200) {
    const progress = t / duration;
    const speed =
      BATTLE.FALL_SPEED_START +
      (BATTLE.FALL_SPEED_END - BATTLE.FALL_SPEED_START) * progress;
    const golden = rng() < BATTLE.GOLDEN_CHANCE;
    drops.push({
      id: id++,
      x: Math.floor(rng() * Math.max(8, width - size)),
      spawnAt: Math.floor(t),
      speed: Math.round(speed),
      points: golden ? BATTLE.GOLDEN_POINTS : BATTLE.NORMAL_POINTS,
      kind: golden ? 'golden' : 'normal',
    });
    const jitter = 0.65 + rng() * 0.7;
    t += BATTLE.SPAWN_EVERY_MS * jitter;
  }
  return drops;
}

export function maxPossibleScore(drops) {
  return (drops || []).reduce((s, d) => s + (Number(d.points) || 0), 0);
}

/** @deprecated shards pot removed — Battle stakes energy, pays badges */
export function potShards() {
  return { gross: 0, rake: 0, winner: 0 };
}

export function validateBattleScore({ score, catches, seed, durationMs }) {
  const drops = buildDropSchedule(seed, { durationMs: durationMs || BATTLE.DURATION_MS });
  const max = maxPossibleScore(drops);
  const s = Math.floor(Number(score) || 0);
  const c = Math.floor(Number(catches) || 0);
  if (s < 0 || c < 0) return { ok: false, error: 'Invalid score' };
  if (s > max) return { ok: false, error: 'Score too high for this match' };
  if (c > drops.length) return { ok: false, error: 'Too many catches' };
  return { ok: true, max, dropCount: drops.length };
}
