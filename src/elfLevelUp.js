/**
 * Elf NFT level-up costs (SOL) — from Fate/Echo design sheets.
 * L1→2 … L4→5 by rarity.
 *
 * GiftLocksmith is separate: wall-tied (mint = first wall ×4 = 0.10).
 * L1→5 ladder set explicitly (not the Rare elf table).
 */

export const ELF_LEVEL_UP_SOL = {
  // Totals: Common 0.20 · Rare 0.60 · Epic 1.25 · Legendary 4.50
  // So mint+L5 stays under next rarity W1 mint (budget path vs ceiling).
  common: [0.02, 0.04, 0.06, 0.08],
  rare: [0.05, 0.1, 0.2, 0.25],
  epic: [0.15, 0.25, 0.35, 0.5],
  legendary: [0.5, 0.8, 1.2, 2.0],
};

/** Locksmith L1→2 … L4→5 (mint already buys L1 / first wall ×4) */
export const LOCKSMITH_LEVEL_UP_SOL = [0.2, 0.35, 0.6, 1.5];

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
