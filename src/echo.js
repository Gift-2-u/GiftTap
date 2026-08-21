/**
 * Echo (Power) — Gift2u Elves Gen 1
 * Always-on tap multiplier. Shared collection with Locksmith + Fate.
 */
import { LOCKSMITH_COLLECTION } from './locksmith';

export const ECHO_COLLECTION = LOCKSMITH_COLLECTION;

/** Echo tap multiplier: level 1..5 per rarity */
export const ECHO_MULTI = {
  common: [1.1, 1.2, 1.3, 1.4, 1.5],
  rare: [1.6, 1.7, 1.8, 1.9, 2.0],
  epic: [2.1, 2.2, 2.3, 2.4, 2.5],
  legendary: [2.6, 2.7, 2.8, 2.9, 3.0],
};

export function echoMultiplier(rarityKey, level = 1) {
  const ladder = ECHO_MULTI[rarityKey] || ECHO_MULTI.common;
  const idx = Math.min(5, Math.max(1, Math.floor(Number(level) || 1))) - 1;
  return ladder[idx];
}

export const ECHO_DESCRIPTION =
  "Echo is the Power elf of the Gift2u Elves. Equip one Echo per wallet. Echo multiplies every tap’s G2Ushards by its rarity and level (up to 3.00× on Legendary L5).";

/** Wave 1 shop/mint config (draft prices = Fate parity until approved) */
export const ECHO_WAVE1 = {
  common: {
    key: 'common',
    label: 'Common',
    priceSol: 0.05,
    itemsAvailable: 5250,
    maxSupply: 17500,
    border: '#C0C0C0',
    imageUrl: '/nft/echo/Echo-common.jpg?v=1',
    imageUri: 'https://gateway.irys.xyz/-EZItEGUZeMC1cBePyF890ik7p32ZUqN2bACsLs2KAc',
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
    imageUrl: '/nft/echo/Echo-rare.jpg?v=1',
    imageUri: 'https://gateway.irys.xyz/M547_H8Ku_xm18u4fG-Lzt0JIeUAszEr-V93RW3ONVM',
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
    imageUrl: '/nft/echo/Echo-epic.jpg?v=1',
    imageUri: 'https://gateway.irys.xyz/ZXNOavXlXiy8-mIPr5onCj_Gh43CW-n4fQ3tO-enWdg',
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
    imageUrl: '/nft/echo/Echo-legendary.jpg?v=1',
    imageUri: 'https://gateway.irys.xyz/_pDUVFDhyLDD4YFkGEdVbSC6_OK--v1-O0Lt-12bgsU',
    feeBufferSol: 0.02,
    maxPerWallet: 5,
  },
};

export function echoDescription(rarityKey) {
  const r = ECHO_WAVE1[rarityKey];
  if (!r) return ECHO_DESCRIPTION;
  const multiL1 = ECHO_MULTI[rarityKey]?.[0];
  const multiL5 = ECHO_MULTI[rarityKey]?.[4];
  return `${ECHO_DESCRIPTION} ${r.label} · Gen 1 · L1 ${multiL1}× → L5 ${multiL5}× · max supply ${r.maxSupply.toLocaleString()}.`;
}

export function isEchoAsset(asset) {
  const meta = asset?.content?.metadata || {};
  const name = String(meta.name || '');
  if (/^echo$/i.test(name.trim()) || /^echo\s/i.test(name.trim())) return true;
  const attrs = Array.isArray(meta.attributes) ? meta.attributes : [];
  for (const a of attrs) {
    const t = String(a?.trait_type || a?.traitType || a?.key || '').toLowerCase();
    const v = String(a?.value ?? '');
    if (t === 'class' && /^echo$/i.test(v)) return true;
  }
  return false;
}
