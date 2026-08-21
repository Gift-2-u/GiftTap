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

/** Locksmith level required for free climb + shoe on this wall key */
export const LOCKSMITH_LEVEL_FOR_WALL = {
  4: 1, // → Level 5  + Common Shoe
  9: 2, // → Level 10 + Common Shoe
  19: 3, // → Level 20 + Common Shoe
  29: 4, // → Level 30 (shoe rarity TBD)
  49: 5, // → Level 50+
  74: 5, // → Level 75 (L5 covers 50+)
  99: 5, // → Level 100
};

/** Walls that grant Common Shoe L1 when climbed via Locksmith */
export const WALLS_GRANT_COMMON_SHOE = new Set([4, 9, 19]);

export const WALL_TARGET_LABEL = {
  4: 5,
  9: 10,
  19: 20,
  29: 30,
  49: 50,
  74: 75,
  99: 100,
};

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

/** True if equipped Locksmith level can free-climb this wall (+ shoe if mapped) */
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
    'L1: free climb wall → Level 5 + Common Walk2u Shoe',
    'L2: free → Level 10 + Common Shoe · L3: free → Level 20 + Common Shoe',
    'Higher Locksmith levels unlock later walls (levels grow with new walls)',
    'Paying the wall fee = better taps only (no shoe)',
  ];
}
