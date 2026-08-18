/**
 * Shard Badge — equipable asset for the Fate NFT socket.
 *
 * Inventory key: shard_badge (count)
 * Equip map: inventory.fate_equip[fateAssetId] = { itemId: 'shard_badge', equipped_at }
 *
 * Tradeable on the in-game Badge market (tier: "shard").
 * Buy primary from Shop (SOL). Not a weekly season prize.
 */

export const SHARD_BADGE = {
  id: 'shard_badge',
  itemId: 'shard_badge',
  /** badge-market tier string */
  marketTier: 'shard',
  name: 'Shard Badge',
  emoji: '💠',
  color: '#fbbf24',
  image: '/shop/G2Ushard.png',
  /** Primary shop price (SOL) via premium-grant */
  priceSol: 0.02,
  category: 'shard_badge',
  desc:
    'Socket on Fate. Shows in the badge hole. Buy/sell on Badge market · equip from Pack → NFT.',
};

/** Market tier used in badge_market_listings.tier */
export const SHARD_BADGE_MARKET_TIER = 'shard';

export function getShardBadgeCount(inv) {
  if (!inv || typeof inv !== 'object') return 0;
  return Math.max(0, Math.floor(Number(inv[SHARD_BADGE.itemId]) || 0));
}

/**
 * How many Fate sockets currently hold a Shard Badge.
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
 * Equipped Shard Badge on a Fate asset (if any).
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
  const isShard =
    itemId === SHARD_BADGE.itemId || tier === 'shard' || tier === 'shard_badge';
  if (!isShard) return null;
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
