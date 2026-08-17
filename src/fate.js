/**
 * Fate (Luck) — Gift2u Elves Gen 1
 * Collection shared with GiftLocksmith.
 */
import { RPC_URL } from './rpc';
import { LOCKSMITH_COLLECTION } from './locksmith';

export const FATE_COLLECTION = LOCKSMITH_COLLECTION;

/** Official treasury / OG Fate Common (final art + collection + 5%) */
export const FATE_OG_COMMON_ASSET =
  '7aR6vPhkU4EKWwPFWf3UrdmZP9AGP4iFbn87vTYs8r19';

/** Wave 1 prices (SOL) — locked */
export const FATE_WAVE1 = {
  common: {
    key: 'common',
    label: 'Common',
    priceSol: 0.05,
    itemsAvailable: 5250,
    maxSupply: 17500,
    border: '#C0C0C0',
    /** Local shop art (bordered) */
    imageUrl: '/nft/fate/Fate-common.jpg',
    /** Irys from final Common mint (on-chain reference) */
    imageUri:
      'https://gateway.irys.xyz/cgeZtO0e0Z7rPvRKZkT5iKVKn63y_V6K2eUADJRMYq4',
  },
  rare: {
    key: 'rare',
    label: 'Rare',
    priceSol: 0.2,
    itemsAvailable: 1575,
    maxSupply: 5250,
    border: '#3B82F6',
    imageUrl: '/nft/fate/Fate-rare.jpg',
    imageUri: 'https://gateway.irys.xyz/lSpSRDil7KTBEzZPs7fs4z8XrEoQCgS54LBhZ03AonM',
  },
  epic: {
    key: 'epic',
    label: 'Epic',
    priceSol: 0.8,
    itemsAvailable: 525,
    maxSupply: 1750,
    border: '#A855F7',
    imageUrl: '/nft/fate/Fate-epic.jpg',
    imageUri: 'https://gateway.irys.xyz/NRJ4FhUzJH6Et6Ga3IVDxkgcsbCc9WH02ReGZpCnUn4',
  },
  legendary: {
    key: 'legendary',
    label: 'Legendary',
    priceSol: 1.75,
    itemsAvailable: 150,
    maxSupply: 500,
    border: '#EAB308',
    imageUrl: '/nft/fate/Fate-legendary.jpg',
    imageUri: 'https://gateway.irys.xyz/vsqWsnHGvfkQBp9LIbZECwdYXEyvs_X-ZdNEPeaqEis',
  },
};

export const FATE_DESCRIPTION =
  'Fate is the Luck elf of the Gift2u Elves. Equip one Fate per wallet. On each tap, Fate has a chance to hit a jackpot that multiplies that tap’s G2Ushards.';

export function fateDescription(rarityKey) {
  const r = FATE_WAVE1[rarityKey];
  if (!r) return FATE_DESCRIPTION;
  return `${FATE_DESCRIPTION} ${r.label} · Gen 1 · max supply ${r.maxSupply.toLocaleString()}.`;
}

export function isFateAsset(asset) {
  const id = asset?.id || asset?.mint || '';
  if (id === FATE_OG_COMMON_ASSET) return true;
  const meta = asset?.content?.metadata || {};
  const name = String(meta.name || '');
  if (/^fate$/i.test(name.trim())) return true;
  const attrs = Array.isArray(meta.attributes) ? meta.attributes : [];
  for (const a of attrs) {
    const t = String(a?.trait_type || a?.traitType || a?.key || '').toLowerCase();
    const v = String(a?.value ?? '');
    if (t === 'class' && /^fate$/i.test(v)) return true;
  }
  return false;
}

export function fateRarityFromAsset(asset) {
  const meta = asset?.content?.metadata || {};
  const attrs = Array.isArray(meta.attributes) ? meta.attributes : [];
  for (const a of attrs) {
    const t = String(a?.trait_type || a?.traitType || a?.key || '').toLowerCase();
    if (t === 'rarity') return String(a?.value ?? 'Common');
  }
  return 'Common';
}

/**
 * List Fate NFTs in game wallet (same Gift2u Elves collection).
 */
export async function listFateNfts(walletAddress) {
  if (!walletAddress || typeof walletAddress !== 'string') return [];
  const owner = walletAddress.trim();
  if (owner.length < 32) return [];

  const byId = new Map();
  try {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'fate-nfts',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: owner,
          page: 1,
          limit: 100,
          displayOptions: { showCollectionMetadata: true },
        },
      }),
    });
    const json = await res.json();
    for (const asset of json?.result?.items || []) {
      if (!isFateAsset(asset)) continue;
      const id = asset?.id || asset?.mint || '';
      if (!id) continue;
      const meta = asset?.content?.metadata || {};
      const image =
        asset?.content?.links?.image ||
        asset?.content?.files?.find((f) => f?.uri || f?.cdn_uri)?.cdn_uri ||
        asset?.content?.files?.find((f) => f?.uri || f?.cdn_uri)?.uri ||
        null;
      byId.set(id, {
        id,
        name: meta.name || 'Fate',
        image: image ? String(image) : null,
        collection: 'Gift2u Elves',
        kind: 'fate',
        rarity: fateRarityFromAsset(asset),
        attributes: Array.isArray(meta.attributes) ? meta.attributes : [],
      });
    }
  } catch (e) {
    console.warn('listFateNfts', e?.message || e);
  }
  return Array.from(byId.values());
}
