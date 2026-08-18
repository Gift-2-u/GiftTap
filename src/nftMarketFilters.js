/**
 * NFT marketplace filters — mint catalog + P2P browse.
 * Role / rarity / level keep the grid organized as more players list.
 */

export const NFT_RARITY_OPTS = [
  { id: 'all', label: 'All' },
  { id: 'common', label: 'Common' },
  { id: 'rare', label: 'Rare' },
  { id: 'epic', label: 'Epic' },
  { id: 'legendary', label: 'Legendary' },
];

export const NFT_ROLE_OPTS = [
  { id: 'all', label: 'All' },
  { id: 'locksmith', label: 'Locksmith' },
  { id: 'fate', label: 'Fate' },
  { id: 'echo', label: 'Echo' },
  { id: 'rush', label: 'Rush' },
  { id: 'shadow', label: 'Shadow' },
];

export const NFT_LEVEL_OPTS = [
  { id: 'all', label: 'All' },
  { id: '1', label: 'L1' },
  { id: '2', label: 'L2' },
  { id: '3', label: 'L3' },
  { id: '4', label: 'L4' },
  { id: '5', label: 'L5' },
];

export const NFT_SORT_OPTS = [
  { id: 'default', label: 'Default' },
  { id: 'price_asc', label: 'Price ↑' },
  { id: 'price_desc', label: 'Price ↓' },
  { id: 'name', label: 'Name' },
];

function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

/** Normalize rarity label → common|rare|epic|legendary|'' */
export function normalizeRarityKey(raw) {
  const r = norm(raw);
  if (r.startsWith('legend')) return 'legendary';
  if (r.startsWith('epic')) return 'epic';
  if (r.startsWith('rare')) return 'rare';
  if (r.startsWith('common')) return 'common';
  return '';
}

/** Normalize class/role → locksmith|fate|echo|rush|shadow|'' */
export function normalizeRoleKey(raw) {
  const r = norm(raw);
  if (!r) return '';
  if (r.includes('locksmith') || r === 'giftlocksmith') return 'locksmith';
  if (r.includes('fate') || r === 'luck') return 'fate';
  if (r.includes('echo') || r === 'power') return 'echo';
  if (r.includes('rush') || r === 'energy') return 'rush';
  if (r.includes('shadow') || r === 'night') return 'shadow';
  return '';
}

function attrMap(attributes) {
  const out = {};
  if (!Array.isArray(attributes)) return out;
  for (const a of attributes) {
    const k = norm(a?.trait_type || a?.traitType || a?.key);
    if (!k) continue;
    out[k] = String(a?.value ?? '');
  }
  return out;
}

/**
 * Derive filter fields from a mint-catalog item or owned/listing card.
 */
export function deriveNftFilterMeta(item) {
  if (!item || typeof item !== 'object') {
    return { role: '', rarity: '', level: null, price: 0, name: '' };
  }

  const attrs = attrMap(item.attributes);
  const name = String(item.name || '');
  const nameL = name.toLowerCase();

  let role =
    normalizeRoleKey(item.kind) ||
    normalizeRoleKey(item.role) ||
    normalizeRoleKey(attrs.class) ||
    normalizeRoleKey(attrs.role) ||
    '';

  if (!role) {
    if (item.isFateMint || item.fateRarity) role = 'fate';
    else if (item.isEchoMint || item.echoRarity) role = 'echo';
    else if (item.isRushMint || item.rushRarity) role = 'rush';
    else if (item.isShadowMint || item.shadowRarity) role = 'shadow';
    else if (
      item.id === 'locksmith' ||
      (item.isNftMint &&
        !item.isFateMint &&
        !item.isEchoMint &&
        !item.isRushMint &&
        !item.isShadowMint)
    ) {
      role = 'locksmith';
    } else {
      role =
        normalizeRoleKey(name) ||
        (nameL.includes('locksmith') ? 'locksmith' : '');
    }
  }

  let rarity =
    normalizeRarityKey(item.rarity) ||
    normalizeRarityKey(item.fateRarity) ||
    normalizeRarityKey(item.echoRarity) ||
    normalizeRarityKey(item.rushRarity) ||
    normalizeRarityKey(item.shadowRarity) ||
    normalizeRarityKey(attrs.rarity) ||
    '';

  if (!rarity) {
    for (const r of ['legendary', 'epic', 'rare', 'common']) {
      if (nameL.includes(r)) {
        rarity = r;
        break;
      }
    }
  }
  if (!rarity && role === 'locksmith') rarity = 'rare';

  let level = null;
  const rawLv =
    item.level ??
    item.nftLevel ??
    attrs.level ??
    attrs.lvl ??
    null;
  if (rawLv != null && String(rawLv).trim() !== '') {
    const n = Math.floor(Number(String(rawLv).replace(/^[^\d]*/, '')) || 0);
    if (n >= 1 && n <= 5) level = n;
  }
  if (level == null) {
    const m = name.match(/\bL(?:v|evel)?\s*([1-5])\b/i);
    if (m) level = Number(m[1]);
  }
  // Mint catalog cards are always L1 until upgraded copies hit P2P
  if (level == null && item.isNftMint) level = 1;

  const price = Number(item.price ?? item.unit_price) || 0;

  return { role, rarity, level, price, name };
}

/** Build a listing title that stays filterable later: "Fate · Rare · L2" */
export function formatNftListingTitle(nft) {
  const meta = deriveNftFilterMeta(nft);
  const roleLabel =
    meta.role === 'locksmith'
      ? 'GiftLocksmith'
      : meta.role
        ? meta.role.charAt(0).toUpperCase() + meta.role.slice(1)
        : String(nft?.name || 'NFT').split(/[·•|]/)[0].trim() || 'NFT';
  const rarityLabel = meta.rarity
    ? meta.rarity.charAt(0).toUpperCase() + meta.rarity.slice(1)
    : '';
  const levelLabel = meta.level ? `L${meta.level}` : '';
  return [roleLabel, rarityLabel, levelLabel].filter(Boolean).join(' · ');
}

export function matchesNftFilters(item, filters = {}) {
  const meta = deriveNftFilterMeta(item);
  const rarity = filters.rarity || 'all';
  const role = filters.role || 'all';
  const level = filters.level || 'all';

  if (rarity !== 'all' && meta.rarity !== rarity) return false;
  if (role !== 'all' && meta.role !== role) return false;
  if (level !== 'all') {
    const want = Number(level);
    if (!meta.level || meta.level !== want) return false;
  }
  return true;
}

export function sortNftItems(items, sortId = 'default') {
  const arr = [...(items || [])];
  if (sortId === 'price_asc') {
    arr.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
  } else if (sortId === 'price_desc') {
    arr.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
  } else if (sortId === 'name') {
    arr.sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), undefined, {
        sensitivity: 'base',
      }),
    );
  }
  return arr;
}

export function filterAndSortNfts(items, filters = {}) {
  const filtered = (items || []).filter((it) => matchesNftFilters(it, filters));
  return sortNftItems(filtered, filters.sort || 'default');
}
