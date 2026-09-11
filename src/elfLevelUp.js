/**
 * Elf NFT level-up.
 * Fate · Echo · Rush · Shadow: same fixed $G2U for all rarities.
 * GiftLocksmith: separate fixed $G2U ladder (mint = L1).
 */

export const ELF_LEVEL_UP_SOL = {
  // Legacy SOL ladders — prefer ELF_LEVEL_UP_G2U for payment.
  common: [0.02, 0.04, 0.06, 0.08],
  rare: [0.05, 0.1, 0.2, 0.25],
  epic: [0.15, 0.25, 0.35, 0.5],
  legendary: [0.5, 0.8, 1.2, 2.0],
};

/** Fate · Echo · Rush · Shadow — L1→2 … L4→5 fixed $G2U (all rarities) */
export const ELF_LEVEL_UP_G2U = [75_000, 150_000, 225_000, 300_000];

/** Locksmith L1→2 … L4→5 (legacy SOL; payment uses fixed $G2U) */
export const LOCKSMITH_LEVEL_UP_SOL = [0.2, 0.35, 0.6, 1.5];

/** Locksmith L1→2 … L4→5 fixed $G2U (mint = L1) */
export const LOCKSMITH_LEVEL_UP_G2U = [250_000, 750_000, 1_500_000, 2_500_000];

export const ELF_MAX_LEVEL = 5;

export function normElfRarity(r) {
  const k = String(r || 'common')
    .toLowerCase()
    .replace(/\s+/g, '');
  return ELF_LEVEL_UP_SOL[k] ? k : 'common';
}

export function getElfLevel(inv, assetId) {
  if (!assetId || !inv) return 1;
  const map = inv.elf_levels;
  if (map && typeof map === 'object') {
    const n = Math.floor(Number(map[assetId]) || 0);
    if (n >= 1) return Math.min(ELF_MAX_LEVEL, n);
  }
  for (const key of [
    'echo_active',
    'fate_power',
    'rush_active',
    'shadow_active',
    'locksmith_active',
  ]) {
    const row = inv[key];
    if (row && typeof row === 'object') {
      const id = String(row.asset_id || row.assetId || '');
      if (id && id === String(assetId)) {
        const n = Math.floor(Number(row.level) || 1);
        return Math.min(ELF_MAX_LEVEL, Math.max(1, n));
      }
    }
  }
  return 1;
}

/**
 * SOL cost to go from currentLevel → currentLevel+1, or null if maxed.
 * @param {string} rarity
 * @param {number} currentLevel
 * @param {string} [kind] — when 'locksmith', uses LOCKSMITH_LEVEL_UP_SOL
 */
export function elfLevelUpCostSol(rarity, currentLevel, kind) {
  const lvl = Math.floor(Number(currentLevel) || 1);
  if (lvl < 1 || lvl >= ELF_MAX_LEVEL) return null;
  const isLocksmith = String(kind || '').toLowerCase() === 'locksmith';
  const ladder = isLocksmith
    ? LOCKSMITH_LEVEL_UP_SOL
    : ELF_LEVEL_UP_SOL[normElfRarity(rarity)] || ELF_LEVEL_UP_SOL.common;
  const cost = ladder[lvl - 1];
  return Number.isFinite(cost) ? cost : null;
}

export const ELF_LEVEL_UP_TREASURY =
  'D4GufPTvp6tnzkaYGfombFLs48UjDANsxjMFJnSYz4Gh';
export const ELF_LEVEL_UP_FEE_WALLET =
  '8G7uEcPS6dwA5wW9bGoqi98EzBunF8trjbbFJkgkvBPm';
export const ELF_LEVEL_UP_FEE_SOL = 0.0005;

/** LP default 20 SOL / 100M G2U — keep in sync with premium-grant / Edge G2U_PER_SOL */
export function g2uPerSolClient() {
  const n = Number(import.meta.env.VITE_G2U_PER_SOL) || 5_000_000;
  return Number.isFinite(n) && n > 0 ? n : 5_000_000;
}

export function elfLevelUpCostG2u(rarity, currentLevel, kind) {
  const lvl = Math.floor(Number(currentLevel) || 1);
  if (lvl < 1 || lvl >= ELF_MAX_LEVEL) return null;
  if (String(kind || '').toLowerCase() === 'locksmith') {
    const g2u = LOCKSMITH_LEVEL_UP_G2U[lvl - 1];
    return Number.isFinite(g2u) ? g2u : null;
  }
  // Fate · Echo · Rush · Shadow — same $G2U for every rarity
  const g2u = ELF_LEVEL_UP_G2U[lvl - 1];
  return Number.isFinite(g2u) ? g2u : null;
}
