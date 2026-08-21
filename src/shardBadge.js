/**
 * Star Badge — equipable asset for NFT sockets (Fate · Echo · Rush · Shadow).
 *
 * Inventory key: shard_badge (count) — kept for existing balances / market.
 * Equip map: inventory.fate_equip[assetId] = { itemId: 'shard_badge', equipped_at }
 *
 * Tradeable on the in-game Badge market (tier: "shard").
 * Obtain via Mystery Gift / prize / Badge market. Not a Premium Boost.
 */

export const SHARD_BADGE = {
  id: 'shard_badge',
  itemId: 'shard_badge',
  /** badge-market tier string */
  marketTier: 'shard',
  name: 'Star Badge',
  emoji: '⭐',
  color: '#fbbf24',
  /** Desktop Gift folder: socket star2.jpg */
  image: '/shop/socket-star2.jpg',
  /** Primary shop price kept for edge compat; not listed in Premium Boost */
  priceSol: 0.02,
  category: 'shard_badge',
  desc:
    'Socket outside the NFT art (Backpack → NFT). Buy/sell on Badge market · equip from Backpack.',
};

/** Market tier used in badge_market_listings.tier */
export const SHARD_BADGE_MARKET_TIER = 'shard';

/** Star L1→2 … L4→5 — one Star for all rarities, priced above Common elf */
export const STAR_LEVEL_UP_SOL = [0.1, 0.15, 0.25, 0.4];
export const STAR_MAX_LEVEL = 5;
export const STAR_MINT_SOL = 0.1;

export function starLevelUpCostSol(currentLevel) {
  const lvl = Math.floor(Number(currentLevel) || 1);
  if (lvl < 1 || lvl >= STAR_MAX_LEVEL) return null;
  const cost = STAR_LEVEL_UP_SOL[lvl - 1];
  return Number.isFinite(cost) ? cost : null;
}


export function getShardBadgeCount(inv) {
  if (!inv || typeof inv !== 'object') return 0;
  return Math.max(0, Math.floor(Number(inv[SHARD_BADGE.itemId]) || 0));
}

/**
 * How many NFT sockets currently hold a Star Badge.
 */
export function countEquippedShardBadges(inv) {
  const map = inv?.fate_equip;
  if (!map || typeof map !== 'object') return 0;
  let n = 0;
  for (const row of Object.values(map)) {
    if (!row || typeof row !== 'object') continue;
    const itemId = String(row.itemId || row.item_id || '').toLowerCase();
    const tier = String(row.tier || '').toLowerCase();
    if (itemId === SHARD_BADGE.itemId || tier === 'shard' || tier === 'shard_badge') {
      n += 1;
    }
  }
  return n;
}

/** Owned − currently equipped (available to equip or list for sale). */
export function getFreeShardBadgeCount(inv) {
  return Math.max(0, getShardBadgeCount(inv) - countEquippedShardBadges(inv));
}

/**
 * Equipped Star Badge on an NFT asset (if any).
 * @returns {{ itemId: string, image: string, name: string, tier: string } | null}
 */
export function getEquippedShardBadgeOnFate(inv, fateAssetId) {
  if (!fateAssetId || !inv || typeof inv !== 'object') return null;
  const map = inv.fate_equip;
  if (!map || typeof map !== 'object') return null;
  const row = map[fateAssetId];
  if (!row || typeof row !== 'object') return null;
  const itemId = String(row.itemId || row.item_id || '').toLowerCase();
  const tier = String(row.tier || '').toLowerCase().replace(/^badge_/, '');
  const isStar =
    itemId === SHARD_BADGE.itemId || tier === 'shard' || tier === 'shard_badge';
  if (!isStar) return null;
  return {
    itemId: SHARD_BADGE.itemId,
    tier: SHARD_BADGE_MARKET_TIER,
    image: SHARD_BADGE.image,
    name: SHARD_BADGE.name,
    color: SHARD_BADGE.color,
  };
}

export function shardBadgeCatalogEntry() {
  return {
    id: SHARD_BADGE.itemId,
    tier: SHARD_BADGE_MARKET_TIER,
    name: SHARD_BADGE.name,
    emoji: SHARD_BADGE.emoji,
    color: SHARD_BADGE.color,
    image: SHARD_BADGE.image,
    category: 'shard_badge',
    desc: SHARD_BADGE.desc,
  };
}
