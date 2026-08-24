/**
 * Client helpers for Echo / Fate / Rush / Shadow durability.
 * Own NFT = attributes apply (highest level of each kind). No equip step.
 */

export const NFT_DURABILITY_MAX = 100;
export const NFT_DURABILITY_DRAIN_PER_1K_TAPS = 1;
export const NFT_DURABILITY_G2U_PER_PERCENT = 1000;

export const NFT_ACTIVE_KEY = {
  echo: 'echo_active',
  fate: 'fate_power',
  rush: 'rush_active',
  shadow: 'shadow_active',
};

export function kindFromNft(nftOrKind) {
  if (!nftOrKind) return null;
  if (typeof nftOrKind === 'string') {
    const k = nftOrKind.toLowerCase();
    return NFT_ACTIVE_KEY[k] ? k : null;
  }
  const k = String(nftOrKind.kind || nftOrKind.name || '').toLowerCase();
  return NFT_ACTIVE_KEY[k] ? k : null;
}

export function getActiveRow(inventory, kind) {
  const key = NFT_ACTIVE_KEY[kind];
  if (!key) return null;
  const raw = inventory?.[key];
  if (!raw || typeof raw !== 'object') return null;
  return raw;
}

export function getNftDurabilityMap(inventory = {}) {
  const m = inventory?.nft_durability;
  if (m && typeof m === 'object' && !Array.isArray(m)) return { ...m };
  return {};
}

export function getNftDurability(row) {
  if (!row || typeof row !== 'object') return 0;
  if (row.durability === undefined || row.durability === null) return 100;
  const n = Number(row.durability);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/** Durability for an owned mining NFT (by asset id). Own = active — no equip. */
export function durabilityForWalletNft(inventory, nft) {
  const kind = kindFromNft(nft);
  if (!kind) return null;
  const nid = String(nft?.id || nft?.asset_id || '');
  if (!nid) return null;

  const map = getNftDurabilityMap(inventory);
  if (map[nid] !== undefined && map[nid] !== null) {
    const n = Number(map[nid]);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));
  }

  // Fall back to active row if this asset is the synced highest of that kind
  const row = getActiveRow(inventory, kind);
  if (row) {
    const aid = String(row.asset_id || row.assetId || '');
    if (!aid || aid === nid) return getNftDurability(row);
  }

  // Owned but never drained → 100%
  return 100;
}

export function isNftPerkLive(inventory, kind) {
  const row = getActiveRow(inventory, kind);
  if (!row) return false;
  return getNftDurability(row) > 0;
}

export function topUpCostG2u(percent) {
  const p = Math.max(1, Math.floor(Number(percent) || 0));
  return p * NFT_DURABILITY_G2U_PER_PERCENT;
}
