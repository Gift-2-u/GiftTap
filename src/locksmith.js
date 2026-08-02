/**
 * GiftLocksmith (Metaplex Core) ownership helpers.
 * Collection: Gift2u Elves — Wave 1 CM on mainnet.
 */
import { RPC_URL } from './rpc';

/** Core collection for GiftLocksmith Gen 1 (all waves) */
export const LOCKSMITH_COLLECTION =
  'FQPYWSohCPnS57W2AWAqwmQM21KRxGi4YXcCaiXUghPD';

/** Test mint (team) — counts as Locksmith for utility */
export const LOCKSMITH_TEST_ASSET =
  'Fsx9L4oS9pG4P4t338DwUtQpLX7oQTsxgGvK1JmTe3Tt';

/**
 * True if wallet owns a Core asset in the Locksmith collection (or the test mint).
 * Uses Helius DAS getAssetsByOwner when RPC is Helius-compatible.
 */
export async function hasLocksmith(walletAddress) {
  if (!walletAddress || typeof walletAddress !== 'string') return false;
  const owner = walletAddress.trim();
  if (owner.length < 32) return false;

  try {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'locksmith-check',
        method: 'searchAssets',
        params: {
          ownerAddress: owner,
          grouping: ['collection', LOCKSMITH_COLLECTION],
          page: 1,
          limit: 1,
        },
      }),
    });
    const json = await res.json();
    const items = json?.result?.items || json?.result || [];
    if (Array.isArray(items) && items.length > 0) return true;

    // Fallback: getAssetsByOwner + filter (some RPC shapes)
    const res2 = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'locksmith-check-2',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: owner,
          page: 1,
          limit: 100,
          displayOptions: { showCollectionMetadata: true },
        },
      }),
    });
    const json2 = await res2.json();
    const list = json2?.result?.items || [];
    for (const asset of list) {
      const id = asset?.id || asset?.mint;
      if (id === LOCKSMITH_TEST_ASSET) return true;
      const grouping = asset?.grouping || [];
      if (
        grouping.some(
          (g) =>
            (g.group_key === 'collection' || g.groupKey === 'collection') &&
            (g.group_value === LOCKSMITH_COLLECTION ||
              g.groupValue === LOCKSMITH_COLLECTION),
        )
      ) {
        return true;
      }
    }
  } catch (e) {
    console.warn('hasLocksmith check failed', e?.message || e);
  }
  return false;
}
