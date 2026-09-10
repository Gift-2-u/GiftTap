/**
 * GiftLocksmith → free wall climb + Walk2u shoe (Locksmith only).
 *
 * Paying the wall fee = higher tap mult only (NO shoe).
 * Climbing with GiftLocksmith = free climb + Common Shoe L1 (for that wall).
 *
 * Levels scale 1:1 with walls (not capped at 5). More walls later = more levels.
 *
 * Wall keys = current max_unlocked_level when the wall appears.
 */

/**
 * Locksmith level required for free climb.
 * L1 mint: walls 5 / 10 / 20 · L2: 30 · L3: 50 · L4: 75 · L5: 100
 */
export const LOCKSMITH_LEVEL_FOR_WALL = {
  4: 1, // → Level 5
  9: 1, // → Level 10
  19: 1, // → Level 20
  29: 2, // → Level 30
  49: 3, // → Level 50
  74: 4, // → Level 75
  99: 5, // → Level 100
};

/** Shoe on Locksmith free climb: wall 5, wall 30, wall 50 only */
export const WALLS_GRANT_COMMON_SHOE = new Set([4, 29, 49]);

export const WALL_TARGET_LABEL = {
  4: 5,
  9: 10,
  19: 20,
  29: 30,
  49: 50,
  74: 75,
  99: 100,
};


/**
 * Walls cleared = player has reached that level (passed the wall).
 * Level 5+ → Wall-5 · Level 10+ → Wall-5 · Wall-10 · etc.
 */
export function wallsClimbedLabels(maxUnlockedLevel) {
  const m = Math.max(0, Math.floor(Number(maxUnlockedLevel) || 0));
  const out = [];
  const targets = [...new Set(Object.values(WALL_TARGET_LABEL))].sort(
    (a, b) => a - b,
  );
  for (const target of targets) {
    if (m >= Number(target)) out.push(`Wall-${target}`);
  }
  return out;
}

/** Next wall target label, or null if past last wall — e.g. "Wall-5" */
export function nextWallTargetLabel(maxUnlockedLevel) {
  const m = Math.max(0, Math.floor(Number(maxUnlockedLevel) || 0));
  const keys = Object.keys(WALL_TARGET_LABEL)
    .map(Number)
    .sort((a, b) => a - b);
  for (const k of keys) {
    if (m <= k) return `Wall-${WALL_TARGET_LABEL[k]}`;
  }
  return null;
}

export const WALK2U_SHOE_COMMON_KEY = 'walk2u_shoe_common';

/** Highest Locksmith level defined by current wall map (grows when walls are added) */
export function maxLocksmithLevelDefined() {
  return Math.max(0, ...Object.values(LOCKSMITH_LEVEL_FOR_WALL));
}

export function locksmithLevelFromInv(inv) {
  const raw = inv?.locksmith_active;
  if (!raw || typeof raw !== 'object') return 0;
  let level = Math.floor(Number(raw.level) || 0);
  if (level < 0) level = 0;
  const cap = maxLocksmithLevelDefined();
  if (cap > 0 && level > cap) level = cap;
  return level;
}

/** True if owned Locksmith level can free-climb this wall (+ shoe if mapped) */
export function locksmithCoversWall(inv, wallKey) {
  const need = LOCKSMITH_LEVEL_FOR_WALL[Number(wallKey)];
  if (!need) return false;
  return locksmithLevelFromInv(inv) >= need;
}

export function wallGrantsCommonShoe(wallKey) {
  return WALLS_GRANT_COMMON_SHOE.has(Number(wallKey));
}

export function getCommonShoeCount(inv) {
  return Math.max(0, Math.floor(Number(inv?.[WALK2U_SHOE_COMMON_KEY]) || 0));
}

export function grantCommonShoeL1(inv) {
  const next = { ...(inv || {}) };
  next[WALK2U_SHOE_COMMON_KEY] = getCommonShoeCount(next) + 1;
  return next;
}

export function locksmithWallPerkLines() {
  return [
    'L1 (mint): free walls 5 · 10 · 20 · shoe on wall 5',
    'L2 (250k $G2U): free wall 30 + shoe · L3 (750k $G2U): free wall 50 + shoe',
    'L4 (1.5M $G2U): free wall 75 · L5 (2.5M $G2U): free wall 100',
    'Shoes grant on Locksmith climb of walls 5 · 30 · 50 only',
    'Paying the wall fee = better taps only (no shoe)',
  ];
}
