/**
 * Gift2u Elves collection helpers (Locksmith + Fate + future classes).
 * Collection: Gift2u Elves — Core on mainnet.
 */
import { RPC_URL } from './rpc';

/** Core collection for Gift2u Elves Gen 1 */
export const LOCKSMITH_COLLECTION =
  'FQPYWSohCPnS57W2AWAqwmQM21KRxGi4YXcCaiXUghPD';

/** Test mint (team) — counts as Locksmith for utility */
export const LOCKSMITH_TEST_ASSET =
  'Fsx9L4oS9pG4P4t338DwUtQpLX7oQTsxgGvK1JmTe3Tt';

/** Official Fate Common OG (treasury) */
export const FATE_OG_COMMON_ASSET =
  '7aR6vPhkU4EKWwPFWf3UrdmZP9AGP4iFbn87vTYs8r19';

const inElvesCollection = (asset) => {
  const id = asset?.id || asset?.mint || '';
  if (id === LOCKSMITH_TEST_ASSET || id === FATE_OG_COMMON_ASSET) return true;
  const grouping = asset?.grouping || [];
  return grouping.some(
    (g) =>
      (g.group_key === 'collection' || g.groupKey === 'collection') &&
      (g.group_value === LOCKSMITH_COLLECTION ||
        g.groupValue === LOCKSMITH_COLLECTION),
  );
};

const attrsOf = (asset) => {
  const meta = asset?.content?.metadata || {};
  return Array.isArray(meta.attributes) ? meta.attributes : [];
};

const attrValue = (asset, trait) => {
  const t = String(trait).toLowerCase();
  for (const a of attrsOf(asset)) {
    const key = String(a?.trait_type || a?.traitType || a?.key || '').toLowerCase();
    if (key === t) return String(a?.value ?? '');
  }
  return '';
};

/** Classify collection member as locksmith | fate | elf */
export function classifyElfAsset(asset) {
  const id = asset?.id || asset?.mint || '';
  if (id === LOCKSMITH_TEST_ASSET) return 'locksmith';
  if (id === FATE_OG_COMMON_ASSET) return 'fate';
  const cls = attrValue(asset, 'class').toLowerCase();
  if (cls === 'fate') return 'fate';
  if (cls === 'giftlocksmith' || cls === 'locksmith') return 'locksmith';
  const name = String(asset?.content?.metadata?.name || '').toLowerCase();
  if (name === 'fate' || name.startsWith('fate ')) return 'fate';
  if (cls === 'echo') return 'echo';
  if (name === 'echo' || name.startsWith('echo ')) return 'echo';
  if (cls === 'rush') return 'rush';
  if (name === 'rush' || name.startsWith('rush ')) return 'rush';
  if (cls === 'shadow') return 'shadow';
  if (name === 'shadow' || name.startsWith('shadow ')) return 'shadow';
  if (cls === 'star badge' || cls === 'star' || cls.includes('star badge')) return 'star';
  if (name === 'star badge' || name.startsWith('star badge')) return 'star';
  if (name.includes('locksmith')) return 'locksmith';
  // Default: treat unknown elves-collection assets as locksmith only if name suggests it
  return name ? 'elf' : 'elf';
}

const assetToCard = (asset) => {
  const id = asset?.id || asset?.mint || '';
  const meta = asset?.content?.metadata || {};
  const kind = classifyElfAsset(asset);
  const name =
    meta.name ||
    (kind === 'fate'
      ? 'Fate'
      : kind === 'echo'
        ? 'Echo'
        : kind === 'rush'
          ? 'Rush'
          : kind === 'shadow'
            ? 'Shadow'
            : kind === 'star'
              ? 'Star Badge'
              : kind === 'locksmith'
                ? 'GiftLocksmith'
                : 'Gift2u Elf');
  const image =
    asset?.content?.links?.image ||
    asset?.content?.files?.find((f) => f?.uri || f?.cdn_uri)?.cdn_uri ||
    asset?.content?.files?.find((f) => f?.uri || f?.cdn_uri)?.uri ||
    null;
  const attributes = attrsOf(asset)
    .map((a) => ({
      trait_type: String(a?.trait_type || a?.traitType || a?.key || ''),
      value: String(a?.value ?? ''),
    }))
    .filter((a) => a.trait_type || a.value);
  const rarity =
    attributes.find((a) => a.trait_type.toLowerCase() === 'rarity')?.value ||
    (kind === 'locksmith' ? 'Rare' : '');
  const levelRaw = attributes.find(
    (a) => ['level', 'lvl', 'lv'].includes(a.trait_type.toLowerCase()),
  )?.value;
  let level = Math.floor(Number(levelRaw) || 0);
  if (level < 1 || level > 5) level = 1;
  return {
    id,
    name: String(name),
    symbol: meta.symbol
      ? String(meta.symbol)
      : kind === 'echo'
        ? '⚡'
        : kind === 'rush'
          ? '🔋'
          : kind === 'shadow'
            ? '🌑'
            : kind === 'fate'
        ? 'Fate'
        : 'Locksmith',
    description: meta.description ? String(meta.description) : '',
    image: image ? String(image) : null,
    collection: 'Gift2u Elves',
    kind,
    rarity,
    level,
    attributes,
    jsonUri: asset?.content?.json_uri ? String(asset.content.json_uri) : null,
  };
};

/** In-memory DAS list cache — Helius credits are limited (avoid 2× DAS per UI open). */
const NFT_LIST_CACHE_TTL_MS = 120_000;
const nftListCache = new Map(); // owner -> { at, result }
const nftListInflight = new Map();

export function invalidateGiftNftListCache(walletAddress) {
  const owner = String(walletAddress || '').trim();
  if (owner) nftListCache.delete(owner);
  else nftListCache.clear();
}

/**
 * List Gift2u Elves (+ Star) owned by the game wallet.
 * Returns { ok, nfts, searchOk, ownerOk }.
 * ok=false means DAS failed — callers must NOT treat empty nfts as "sold".
 *
 * Credits: prefer collection searchAssets only; getAssetsByOwner is fallback
 * when search fails (was always doing BOTH = 2× DAS every call).
 */
export async function listGiftNftsWithStatus(walletAddress, opts = {}) {
  if (!walletAddress || typeof walletAddress !== 'string') {
    return { ok: false, nfts: [], searchOk: false, ownerOk: false };
  }
  const owner = walletAddress.trim();
  if (owner.length < 32) {
    return { ok: false, nfts: [], searchOk: false, ownerOk: false };
  }

  const force = opts.force === true;
  const now = Date.now();
  const knownFromInv = (inv) => {
    const ids = [];
    if (!inv || typeof inv !== 'object') return ids;
    for (const key of [
      'locksmith_active',
      'fate_power',
      'echo_active',
      'rush_active',
      'shadow_active',
    ]) {
      const id = String(inv[key]?.asset_id || inv[key]?.assetId || '').trim();
      if (id.length >= 32) ids.push(id);
    }
    return ids;
  };
  if (!force) {
    const hit = nftListCache.get(owner);
    if (hit && now - hit.at < NFT_LIST_CACHE_TTL_MS) {
      const known = knownFromInv(opts.inventory);
      const cachedIds = new Set((hit.result?.nfts || []).map((n) => n.id));
      const miss = known.some((id) => !cachedIds.has(id));
      // Stale cache omitted Locksmith (or other equipped) — refresh
      if (!miss) return hit.result;
    }
    const pending = nftListInflight.get(owner);
    if (pending) return pending;
  }

  const run = (async () => {
    const byId = new Map();
    let searchOk = false;
    let ownerOk = false;

    try {
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
      if (res.ok) {
        const json = await res.json();
        if (!json?.error) {
          searchOk = true;
          const items = json?.result?.items || [];
          if (Array.isArray(items)) {
            for (const asset of items) {
              if (!inElvesCollection(asset) && !(asset?.id || asset?.mint)) continue;
              const card = assetToCard(asset);
              if (card.id) byId.set(card.id, card);
            }
          }
        }
      }
    } catch (e) {
      console.warn('listGiftNfts searchAssets failed', e?.message || e);
    }

    // Known equipped asset ids (e.g. locksmith_active) — searchAssets can return
    // other elves but miss Locksmith; never skip fallback when these are missing.
    const knownIds = [];
    const invOpt = opts.inventory && typeof opts.inventory === 'object' ? opts.inventory : null;
    if (invOpt) {
      for (const key of [
        'locksmith_active',
        'fate_power',
        'echo_active',
        'rush_active',
        'shadow_active',
      ]) {
        const row = invOpt[key];
        const id = String(row?.asset_id || row?.assetId || '').trim();
        if (id.length >= 32) knownIds.push(id);
      }
    }
    const missingKnown = () => knownIds.filter((id) => !byId.has(id));

    // Fallback when search fails, empty, OR known inventory NFTs are missing from search
    if (!searchOk || byId.size === 0 || missingKnown().length > 0) {
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
        if (res2.ok) {
          const json2 = await res2.json();
          if (!json2?.error) {
            ownerOk = true;
            for (const asset of json2?.result?.items || []) {
              if (!inElvesCollection(asset)) continue;
              const card = assetToCard(asset);
              if (card.id) byId.set(card.id, { ...byId.get(card.id), ...card });
            }
          }
        }
      } catch (e) {
        console.warn('listGiftNfts getAssetsByOwner failed', e?.message || e);
      }
    }

    // Still missing? Fetch each known asset by id (Locksmith often missed by collection search)
    for (const assetId of missingKnown()) {
      try {
        const res3 = await fetch(RPC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'gift-nft-get',
            method: 'getAsset',
            params: { id: assetId },
          }),
        });
        if (!res3.ok) continue;
        const json3 = await res3.json();
        const asset = json3?.result;
        if (!asset || json3?.error) continue;
        const own =
          asset?.ownership?.owner != null
            ? String(asset.ownership.owner).trim()
            : '';
        if (own && own !== owner) continue;
        if (!inElvesCollection(asset) && assetId !== LOCKSMITH_TEST_ASSET) {
          // Still allow if name/class says Locksmith
          const card0 = assetToCard(asset);
          if (card0.kind !== 'locksmith' && card0.kind !== 'fate' && card0.kind !== 'echo' && card0.kind !== 'rush' && card0.kind !== 'shadow' && card0.kind !== 'star') {
            continue;
          }
        }
        const card = assetToCard(asset);
        if (card.id) {
          byId.set(card.id, { ...byId.get(card.id), ...card });
          ownerOk = true;
        }
      } catch (e) {
        console.warn('listGiftNfts getAsset failed', assetId?.slice?.(0, 8), e?.message || e);
      }
    }

    const result = {
      ok: searchOk || ownerOk || byId.size > 0,
      nfts: Array.from(byId.values()),
      searchOk,
      ownerOk,
    };
    // Never cache a list that omits known inventory assets (e.g. Locksmith)
    if (result.ok && missingKnown().length === 0) {
      nftListCache.set(owner, { at: Date.now(), result });
    }
    return result;
  })();

  nftListInflight.set(owner, run);
  try {
    return await run;
  } finally {
    nftListInflight.delete(owner);
  }
}

/**
 * List Gift2u Elves NFTs owned by the game wallet (Locksmith + Fate + Echo + Rush + Shadow + Star).
 * Note: [] can mean zero NFTs OR a failed scan — prefer listGiftNftsWithStatus for ownership sync.
 */
export async function listGiftNfts(walletAddress, opts = {}) {
  const { nfts } = await listGiftNftsWithStatus(walletAddress, opts);
  return nfts;
}

/**
 * True if wallet owns a GiftLocksmith (not Fate).
 */
export async function hasLocksmith(walletAddress) {
  try {
    const nfts = await listGiftNfts(walletAddress);
    return nfts.some((n) => n.kind === 'locksmith');
  } catch (e) {
    console.warn('hasLocksmith check failed', e?.message || e);
    return false;
  }
}

/**
 * True if wallet owns at least one Fate.
 */
export async function hasFate(walletAddress) {
  try {
    const nfts = await listGiftNfts(walletAddress);
    return nfts.some((n) => n.kind === 'fate');
  } catch (e) {
    console.warn('hasFate check failed', e?.message || e);
    return false;
  }
}
