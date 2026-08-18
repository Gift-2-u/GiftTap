/**
 * Shadow mint config — daily claim hours ladder + Fate parity prices.
 */
export const SHADOW_TREASURY = 'AdvMvv6GzGvdLRtuxaso1Eubk7jmn6LCZEeEFHn22yeb';
export const GIFT2U_ELVES_COLLECTION =
  'FQPYWSohCPnS57W2AWAqwmQM21KRxGi4YXcCaiXUghPD';
export const ROYALTY_BPS = 500;
export const WAVE_SHARE = { 1: 0.3, 2: 0.4, 3: 0.3 };
export const FEE_BUFFER_SOL = 0.02;

/** daily claim coverage hours by rarity × level 1..5. 24h = full base daily cap. */
export const SHADOW_HOURS = {
  common: [2, 3, 4, 5, 6],
  rare: [8, 9, 10, 11, 12],
  epic: [14, 15, 16, 17, 18],
  legendary: [20, 21, 22, 23, 24],
};

export function shadowHours(rarityKey, level = 1) {
  const ladder = SHADOW_HOURS[String(rarityKey || '').toLowerCase()];
  if (!ladder) return 0;
  const idx = Math.min(5, Math.max(1, Math.floor(Number(level) || 1))) - 1;
  return ladder[idx] || 0;
}

/** yield = floor((hours/24) * baseDailyCap) */
export function shadowYield(rarityKey, level, baseDailyCap) {
  const h = shadowHours(rarityKey, level);
  const cap = Math.max(0, Math.floor(Number(baseDailyCap) || 0));
  return Math.floor((h / 24) * cap);
}

export const SHADOW_RARITIES = {
  common: {
    key: 'common',
    label: 'Common',
    border: '#C0C0C0',
    supply: 17500,
    prices: { 1: 0.05, 2: 0.1, 3: 0.15 },
    levelUpSol: [0.03, 0.05, 0.08, 0.12],
    levelUpTotal: 0.28,
  },
  rare: {
    key: 'rare',
    label: 'Rare',
    border: '#3B82F6',
    supply: 5250,
    prices: { 1: 0.2, 2: 0.35, 3: 0.5 },
    levelUpSol: [0.1, 0.15, 0.25, 0.4],
    levelUpTotal: 0.9,
  },
  epic: {
    key: 'epic',
    label: 'Epic',
    border: '#A855F7',
    supply: 1750,
    prices: { 1: 0.8, 2: 1.25, 3: 1.75 },
    levelUpSol: [0.25, 0.4, 0.65, 1.0],
    levelUpTotal: 2.3,
  },
  legendary: {
    key: 'legendary',
    label: 'Legendary',
    border: '#EAB308',
    supply: 500,
    prices: { 1: 1.75, 2: 3.0, 3: 4.5 },
    levelUpSol: [0.6, 0.8, 1.3, 2.0],
    levelUpTotal: 4.7,
  },
};

export function waveItems(rarityKey, wave) {
  const r = SHADOW_RARITIES[rarityKey];
  if (!r) throw new Error(`Unknown rarity: ${rarityKey}`);
  const w = Number(wave);
  if (![1, 2, 3].includes(w)) throw new Error('Wave must be 1, 2, or 3');
  return Math.round(r.supply * WAVE_SHARE[w]);
}

export function wavePrice(rarityKey, wave) {
  const r = SHADOW_RARITIES[rarityKey];
  if (!r) throw new Error(`Unknown rarity: ${rarityKey}`);
  const p = r.prices[Number(wave)];
  if (p == null) throw new Error(`No price for ${rarityKey} wave ${wave}`);
  return p;
}

export const SHADOW_DESCRIPTION =
  "Shadow is the Night elf of the Gift2u Elves. Equip one Shadow per wallet. Once per UTC day, Shadow grants shards without tapping equal to (hours÷24) of your base max daily taps. Up to 24h = full base daily on Legendary L5.";
