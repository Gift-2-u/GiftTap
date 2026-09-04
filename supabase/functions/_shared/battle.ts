/** Falling Gifts duel rules — keep in sync with src/battleLogic.js */

export const BATTLE = {
  DURATION_MS: 20_000,
  ENTRY_ENERGY: 50,
  WIN_BADGE: "badge_bronze",
  WIN_BADGE_QTY: 1,
  MAX_DAILY_MATCHES: 20,
  ARENA_WIDTH: 320,
  GIFT_SIZE: 44,
  FALL_SPEED_START: 140,
  FALL_SPEED_END: 280,
  SPAWN_EVERY_MS: 700,
  GOLDEN_CHANCE: 0.12,
  GOLDEN_POINTS: 3,
  NORMAL_POINTS: 1,
};

const ENERGY_CAP_DEFAULT = 500;
const ENERGY_SECONDS_PER_POINT = 1.5;

function utcDayStr(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function energyCapFromInv(inv: Record<string, unknown>, nowMs = Date.now()): number {
  const b = inv?.energy_cap_boost as { cap?: number; expires?: string } | undefined;
  if (!b?.expires) return ENERGY_CAP_DEFAULT;
  if (new Date(String(b.expires)).getTime() <= nowMs) return ENERGY_CAP_DEFAULT;
  const cap = Math.floor(Number(b.cap) || 0);
  return cap >= 1000 ? 1000 : ENERGY_CAP_DEFAULT;
}

export function energyFromAnchor(
  value: number,
  atIso: string | null | undefined,
  nowMs = Date.now(),
  cap = ENERGY_CAP_DEFAULT,
): number {
  const at = atIso ? Date.parse(String(atIso)) : NaN;
  if (Number.isFinite(at) && utcDayStr(at) < utcDayStr(nowMs)) return cap;
  const base = Number.isFinite(Number(value))
    ? Math.max(0, Math.min(cap, Number(value)))
    : cap;
  const t0 = Number.isFinite(at) ? at : nowMs;
  const seconds = Math.max(0, Math.floor((nowMs - t0) / 1000));
  const gained = Math.floor(seconds / ENERGY_SECONDS_PER_POINT);
  return Math.min(cap, base + gained);
}

/** Effective daily tap cap (mirrors commit-taps / economy.effectiveDailyLimit when available). */
export function battleDailyCap(row: Record<string, unknown>, now = new Date()): number {
  const base = Math.max(1000, Math.floor(Number(row.max_daily_limit) || 1000));
  return base;
}

export function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeedString(s: string): number {
  let h = 2166136261;
  const str = String(s || "");
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type Drop = {
  id: number;
  x: number;
  spawnAt: number;
  speed: number;
  points: number;
  kind: "normal" | "golden";
};

export function buildDropSchedule(seed: string | number, durationMs = BATTLE.DURATION_MS): Drop[] {
  const width = BATTLE.ARENA_WIDTH;
  const size = BATTLE.GIFT_SIZE;
  const rng = mulberry32(typeof seed === "number" ? seed : hashSeedString(seed));
  const drops: Drop[] = [];
  let t = 400;
  let id = 0;
  while (t < durationMs - 200) {
    const progress = t / durationMs;
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
      kind: golden ? "golden" : "normal",
    });
    const jitter = 0.65 + rng() * 0.7;
    t += BATTLE.SPAWN_EVERY_MS * jitter;
  }
  return drops;
}

export function maxPossibleScore(drops: Drop[]): number {
  return drops.reduce((s, d) => s + (Number(d.points) || 0), 0);
}

export function potShards() {
  return { gross: 0, rake: 0, winner: 0 };
}

export function validateBattleScore(opts: {
  score: number;
  catches: number;
  seed: string;
  durationMs?: number;
}) {
  const drops = buildDropSchedule(opts.seed, opts.durationMs || BATTLE.DURATION_MS);
  const max = maxPossibleScore(drops);
  const s = Math.floor(Number(opts.score) || 0);
  const c = Math.floor(Number(opts.catches) || 0);
  if (s < 0 || c < 0) return { ok: false as const, error: "Invalid score", max };
  if (s > max) return { ok: false as const, error: "Score too high for this match", max };
  if (c > drops.length) return { ok: false as const, error: "Too many catches", max };
  return { ok: true as const, max, dropCount: drops.length };
}
