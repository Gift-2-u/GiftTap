/**
 * Rush (Limit) — Gift2u Elves Gen 1
 * Raises max daily taps. Shared collection with Locksmith + Fate + Echo.
 */
import { LOCKSMITH_COLLECTION } from './locksmith';

export const RUSH_COLLECTION = LOCKSMITH_COLLECTION;

/** Max daily taps by rarity × level 1..5 (base without Rush = 1000). */
export const RUSH_DAILY_LIMIT = {
  common: [1100, 1200, 1300, 1400, 1500],
  rare: [1600, 1700, 1800, 1900, 2000],
  epic: [2100, 2200, 2300, 2400, 2500],
  legendary: [2600, 2700, 2800, 2900, 3000],
};

export function rushDailyLimit(rarityKey, level = 1) {
  const ladder = RUSH_DAILY_LIMIT[String(rarityKey || '').toLowerCase()];
  if (!ladder) return 1000;
  const idx = Math.min(5, Math.max(1, Math.floor(Number(level) || 1))) - 1;
  return ladder[idx] || 1000;
}

export const RUSH_DESCRIPTION =
  "Rush is the Energy elf of the Gift2u Elves. Own it in wallet/backpack and its attributes apply (highest Rush if you hold several). Rush raises your max daily taps by rarity and level (up to 3,000 on Legendary L5).";

export const RUSH_WAVE1 = {
  common: {
    key: 'common',
    label: 'Common',
    priceSol: 0.05,
    itemsAvailable: 5250,
    maxSupply: 17500,
    border: '#C0C0C0',
    imageUrl: '/nft/rush/Rush-common.jpg?v=clean1',
    imageUri: 'https://gateway.irys.xyz/ANU0bbKrQzIS7LNs07bdr9eUtpwUU-ncDpxMEIbeTFM',
    feeBufferSol: 0.02,
    maxPerWallet: 5,
  },
  rare: {
    key: 'rare',
    label: 'Rare',
    priceSol: 0.3,
    itemsAvailable: 1575,
    maxSupply: 5250,
    border: '#3B82F6',
    imageUrl: '/nft/rush/Rush-rare.jpg?v=clean1',
    imageUri: 'https://gateway.irys.xyz/76sbtmD8sgkAVuYy-l54-n_WB5k9mr4QPlslQtU90oA',
    feeBufferSol: 0.02,
    maxPerWallet: 5,
  },
  epic: {
    key: 'epic',
    label: 'Epic',
    priceSol: 1.0,
    itemsAvailable: 525,
    maxSupply: 1750,
    border: '#A855F7',
    imageUrl: '/nft/rush/Rush-epic.jpg?v=clean1',
    imageUri: 'https://gateway.irys.xyz/DPRD-vFRXTt1tCBWRDsEfQ17-0nc8ekXuD39S_bi5pw',
    feeBufferSol: 0.02,
    maxPerWallet: 5,
  },
  legendary: {
    key: 'legendary',
    label: 'Legendary',
    priceSol: 2.5,
    itemsAvailable: 150,
    maxSupply: 500,
    border: '#EAB308',
    imageUrl: '/nft/rush/Rush-legendary.jpg?v=clean1',
    imageUri: 'https://gateway.irys.xyz/ileE2OBxdIdTp7qDaIv8HV-OalcZNVy4xze_1qNp9CE',
    feeBufferSol: 0.02,
    maxPerWallet: 5,
  },
};

export function rushDescription(rarityKey) {
  const r = RUSH_WAVE1[rarityKey];
  if (!r) return RUSH_DESCRIPTION;
  const limL1 = RUSH_DAILY_LIMIT[rarityKey]?.[0];
  const limL5 = RUSH_DAILY_LIMIT[rarityKey]?.[4];
  return `${RUSH_DESCRIPTION} ${r.label} · Gen 1 · daily cap L1 ${limL1?.toLocaleString()} → L5 ${limL5?.toLocaleString()} · max supply ${r.maxSupply.toLocaleString()}.`;
}

export function isRushAsset(asset) {
  const meta = asset?.content?.metadata || {};
  const name = String(meta.name || '');
  if (/^rush$/i.test(name.trim()) || /^rush\s/i.test(name.trim())) return true;
  const attrs = Array.isArray(meta.attributes) ? meta.attributes : [];
  for (const a of attrs) {
    const t = String(a?.trait_type || a?.traitType || a?.key || '').toLowerCase();
    const v = String(a?.value ?? '');
    if (t === 'class' && /^rush$/i.test(v)) return true;
  }
  return false;
}
