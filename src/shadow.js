/**
 * Shadow (Night) — Gift2u Elves Gen 1
 * Daily claim share of base daily cap. Shared collection.
 */
import { LOCKSMITH_COLLECTION } from './locksmith';

export const SHADOW_COLLECTION = LOCKSMITH_COLLECTION;

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

export function shadowYield(rarityKey, level, baseDailyCap) {
  const h = shadowHours(rarityKey, level);
  const cap = Math.max(0, Math.floor(Number(baseDailyCap) || 0));
  return Math.floor((h / 24) * cap);
}

export const SHADOW_DESCRIPTION =
  "Shadow is the Night elf of the Gift2u Elves. Own it in wallet/backpack and its attributes apply (highest Shadow if you hold several). Once per UTC day, Shadow grants shards without tapping equal to (hours÷24) of your base max daily taps (Rush cap or 1,000 — boosts not included). Up to 24h = full base daily on Legendary L5.";

export const SHADOW_WAVE1 = {
  common: {
    key: 'common',
    label: 'Common',
    priceSol: 0.05,
    itemsAvailable: 5250,
    maxSupply: 17500,
    border: '#C0C0C0',
    imageUrl: '/nft/shadow/Shadow-common.jpg?v=clean1',
    imageUri: 'https://gateway.irys.xyz/BvEGWDZtGQR-C8Fx2qwF7fvm3jH5Xk5aEO_Qqnvgd7g',
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
    imageUrl: '/nft/shadow/Shadow-rare.jpg?v=clean1',
    imageUri: 'https://gateway.irys.xyz/8K5zrw0YnfuOHAMLJeOa2goFvWO-V_gyZv60afzXemc',
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
    imageUrl: '/nft/shadow/Shadow-epic.jpg?v=clean1',
    imageUri: 'https://gateway.irys.xyz/jmrQI6hyX2sFlveBlX9dY6nPkVzg1rC_UM6VQKttS6o',
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
    imageUrl: '/nft/shadow/Shadow-legendary.jpg?v=clean1',
    imageUri: 'https://gateway.irys.xyz/1N1FY7wuiSLYFzs86X5DgfBuJDMV4-Ro6rjrkhQ2EJI',
    feeBufferSol: 0.02,
    maxPerWallet: 5,
  },
};

export function shadowDescription(rarityKey) {
  const r = SHADOW_WAVE1[rarityKey];
  if (!r) return SHADOW_DESCRIPTION;
  const h1 = SHADOW_HOURS[rarityKey]?.[0];
  const h5 = SHADOW_HOURS[rarityKey]?.[4];
  return `${SHADOW_DESCRIPTION} ${r.label} · Gen 1 · ${h1}h → ${h5}h daily claim · max supply ${r.maxSupply.toLocaleString()}.`;
}

export function isShadowAsset(asset) {
  const meta = asset?.content?.metadata || {};
  const name = String(meta.name || '');
  if (/^shadow$/i.test(name.trim()) || /^shadow\s/i.test(name.trim())) return true;
  const attrs = Array.isArray(meta.attributes) ? meta.attributes : [];
  for (const a of attrs) {
    const t = String(a?.trait_type || a?.traitType || a?.key || '').toLowerCase();
    const v = String(a?.value ?? '');
    if (t === 'class' && /^shadow$/i.test(v)) return true;
  }
  return false;
}
