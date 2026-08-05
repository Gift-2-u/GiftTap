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

const isLocksmithAsset = (asset) => {
  const id = asset?.id || asset?.mint || '';
  if (id === LOCKSMITH_TEST_ASSET) return true;
  const grouping = asset?.grouping || [];
  return grouping.some(
    (g) =>
      (g.group_key === 'collection' || g.groupKey === 'collection') &&
      (g.group_value === LOCKSMITH_COLLECTION ||
        g.groupValue === LOCKSMITH_COLLECTION),
  );
};

const assetToCard = (asset) => {
  const id = asset?.id || asset?.mint || '';
  const meta = asset?.content?.metadata || {};
  const name =
    meta.name ||
    asset?.content?.json_uri ||
    'GiftLocksmith';
  const image =
    asset?.content?.links?.image ||
    asset?.content?.files?.find((f) => f?.uri || f?.cdn_uri)?.cdn_uri ||
    asset?.content?.files?.find((f) => f?.uri || f?.cdn_uri)?.uri ||
    null;
  const attributes = Array.isArray(meta.attributes)
    ? meta.attributes
        .map((a) => ({
          trait_type: String(a?.trait_type || a?.traitType || a?.key || ''),
          value: String(a?.value ?? ''),
        }))
        .filter((a) => a.trait_type || a.value)
    : [];
  return {
    id,
    name: String(name),
    symbol: meta.symbol ? String(meta.symbol) : 'Locksmith',
    description: meta.description ? String(meta.description) : '',
    image: image ? String(image) : null,
    collection: 'Gift2u Elves',
    kind: 'locksmith',
    attributes,
    jsonUri: asset?.content?.json_uri ? String(asset.content.json_uri) : null,
  };
};

/**
 * List Gift2u Elves / Locksmith NFTs owned by the game wallet (DAS).
 * @returns {Promise<Array<{ id: string, name: string, image: string|null, collection: string, kind: string }>>}
 */
export async function listGiftNfts(walletAddress) {
  if (!walletAddress || typeof walletAddress !== 'string') return [];
  const owner = walletAddress.trim();
  if (owner.length < 32) return [];

  const byId = new Map();

  try {
    // Preferred: search by collection grouping
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'gift-nfts-search',
        method: 'searchAssets',
        params: {
          ownerAddress: owner,
          grouping: ['collection', LOCKSMITH_COLLECTION],
          page: 1,
          limit: 50,
          displayOptions: { showCollectionMetadata: true },
        },
      }),
    });
    const json = await res.json();
    const items = json?.result?.items || [];
    if (Array.isArray(items)) {
      for (const asset of items) {
        if (!isLocksmithAsset(asset) && !(asset?.id || asset?.mint)) continue;
        const card = assetToCard(asset);
        if (card.id) byId.set(card.id, card);
      }
    }
  } catch (e) {
    console.warn('listGiftNfts searchAssets failed', e?.message || e);
  }

  // Always scan owner assets so test mint / alternate DAS shapes are included
  try {
    const res2 = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'gift-nfts-owner',
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
      if (!isLocksmithAsset(asset)) continue;
      const card = assetToCard(asset);
      if (card.id) byId.set(card.id, { ...byId.get(card.id), ...card });
    }
  } catch (e) {
    console.warn('listGiftNfts getAssetsByOwner failed', e?.message || e);
  }

  return Array.from(byId.values());
}

/**
 * True if wallet owns a Core asset in the Locksmith collection (or the test mint).
 */
export async function hasLocksmith(walletAddress) {
  try {
    const nfts = await listGiftNfts(walletAddress);
    return nfts.length > 0;
  } catch (e) {
    console.warn('hasLocksmith check failed', e?.message || e);
    return false;
  }
}
