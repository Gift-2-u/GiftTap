/**
 * Gift2u NFT ownership sync — ALL mining NFTs + Star.
 *
 * Kinds: echo, fate, rush, shadow, locksmith, star
 *
 * Rules (no guessing):
 *   - Activate only when wallet list (successful DAS) includes that NFT.
 *   - Clear / unequip only when getAsset proves owner !== this wallet.
 *   - RPC failure or ambiguous result → NO inventory change.
 */

import { RPC_URL } from './rpc';
import { listGiftNftsWithStatus } from './locksmith';
import {
  secureEchoActivate,
  secureFateActivate,
  secureRushActivate,
  secureShadowActivate,
  secureLocksmithActivate,
  secureFateEquip,
  ensureSecureSession,
} from './secureApi';
import { getElfLevel, normElfRarity } from './elfLevelUp';
import { locksmithLevelFromInv } from './locksmithWalls';

/** Mining focus slots (inventory keys + activate Edge). */
export const MINING_NFT_SLOTS = [
  {
    kind: 'echo',
    invKey: 'echo_active',
    activate: (p) => secureEchoActivate(p),
  },
  {
    kind: 'fate',
    invKey: 'fate_power',
    activate: (p) => secureFateActivate(p),
  },
  {
    kind: 'rush',
    invKey: 'rush_active',
    activate: (p) => secureRushActivate(p),
  },
  {
    kind: 'shadow',
    invKey: 'shadow_active',
    activate: (p) => secureShadowActivate(p),
  },
  {
    kind: 'locksmith',
    invKey: 'locksmith_active',
    activate: (p) => secureLocksmithActivate(p),
  },
];

function normAddr(a) {
  return String(a || '')
    .trim()
    .toLowerCase();
}

/**
 * DAS getAsset → ownership proof for one asset id.
 * @returns {'owned'|'not_owned'|'unknown'}
 */
export async function proveWalletOwnsAsset(walletAddress, assetId) {
  const wallet = normAddr(walletAddress);
  const id = String(assetId || '').trim();
  if (!wallet || wallet.length < 32 || !id) return 'unknown';

  try {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'gift-get-asset',
        method: 'getAsset',
        params: { id },
      }),
    });
    if (!res.ok) return 'unknown';
    const json = await res.json();
    if (json?.error) return 'unknown';
    const asset = json?.result;
    if (!asset || typeof asset !== 'object') return 'unknown';

    const owner = normAddr(
      asset?.ownership?.owner ||
        asset?.ownership?.owner_address ||
        asset?.owner,
    );
    if (!owner) return 'unknown';
    return owner === wallet ? 'owned' : 'not_owned';
  } catch (e) {
    console.warn('proveWalletOwnsAsset', e?.message || e);
    return 'unknown';
  }
}

/**
 * List wallet NFTs with an explicit success flag.
 * ok=false → do not clear anything (scan unreliable).
 */
export async function fetchOwnedGiftNftsReliable(walletAddress) {
  try {
    return await listGiftNftsWithStatus(walletAddress);
  } catch (e) {
    return {
      ok: false,
      nfts: [],
      searchOk: false,
      ownerOk: false,
      error: e?.message || 'list_failed',
    };
  }
}

function pickBestOfKind(nfts, kind, inv) {
  const owned = (nfts || []).filter(
    (n) => String(n.kind || '').toLowerCase() === kind,
  );
  if (!owned.length) return null;
  let best = owned[0];
  let bestLv = getElfLevel(inv, best.id);
  for (const n of owned) {
    const lv = getElfLevel(inv, n.id);
    if (lv > bestLv) {
      best = n;
      bestLv = lv;
    }
  }
  if (kind === 'locksmith') {
    bestLv = Math.max(
      bestLv || 1,
      locksmithLevelFromInv(inv) || 1,
      getElfLevel(inv, best.id) || 1,
    );
  }
  return { nft: best, level: bestLv || 1 };
}

function activeAssetId(row) {
  if (!row || typeof row !== 'object') return '';
  return String(row.asset_id || row.assetId || '').trim();
}

/**
 * Sync all mining NFT slots + Star equip links for one wallet.
 * @returns {{ inventory, nfts, changed, scanOk, actions: string[] }}
 */
export async function syncAllGiftNftOwnership({
  walletAddress,
  inventory = {},
}) {
  const actions = [];
  let inv = inventory && typeof inventory === 'object' ? { ...inventory } : {};
  let changed = false;

  const scan = await fetchOwnedGiftNftsReliable(walletAddress);
  if (!scan.ok) {
    return {
      inventory: inv,
      nfts: scan.nfts || [],
      changed: false,
      scanOk: false,
      actions: ['scan_failed_no_mutation'],
    };
  }

  const nfts = scan.nfts;
  await ensureSecureSession();

  // —— Activate / clear mining slots (5 elves) ——
  for (const slot of MINING_NFT_SLOTS) {
    const { kind, invKey, activate } = slot;
    const best = pickBestOfKind(nfts, kind, inv);
    const cur = inv[invKey];
    const curId = activeAssetId(cur);

    if (best) {
      const wantId = String(best.nft.id || '').trim();
      const curLv =
        cur && typeof cur === 'object'
          ? Math.max(1, Math.floor(Number(cur.level) || 1))
          : 0;
      if (curId === wantId && curLv >= best.level) {
        continue;
      }
      try {
        const payload =
          kind === 'locksmith'
            ? { level: best.level, assetId: wantId, clear: false }
            : {
                rarity: normElfRarity(best.nft.rarity),
                level: best.level,
                assetId: wantId,
                clear: false,
              };
        const data = await activate(payload);
        if (data?.inventory) {
          inv = { ...inv, ...data.inventory };
          changed = true;
          actions.push(`activate:${kind}:${wantId.slice(0, 8)}`);
        }
      } catch (e) {
        console.warn(`nft sync activate ${kind}`, e?.message || e);
        actions.push(`activate_fail:${kind}`);
      }
      continue;
    }

    // No NFT of this kind in successful list — prove before clear
    if (cur && typeof cur === 'object' && curId) {
      const proof = await proveWalletOwnsAsset(walletAddress, curId);
      if (proof === 'not_owned') {
        try {
          const data = await activate({ clear: true });
          if (data?.inventory) {
            inv = { ...inv, ...data.inventory };
            changed = true;
            actions.push(`clear:${kind}:${curId.slice(0, 8)}`);
          }
        } catch (e) {
          console.warn(`nft sync clear ${kind}`, e?.message || e);
          actions.push(`clear_fail:${kind}`);
        }
      } else if (proof === 'unknown') {
        actions.push(`clear_skipped_unknown:${kind}`);
      } else {
        // owned but not in list (classifier miss) — leave active, do not clear
        actions.push(`kept_owned_not_in_list:${kind}`);
      }
    }
  }

  // —— Star: unequip fate_equip sockets whose star_asset_id is proven gone ——
  const fateEquip = inv.fate_equip;
  if (fateEquip && typeof fateEquip === 'object') {
    for (const [fateAssetId, row] of Object.entries(fateEquip)) {
      if (!row || typeof row !== 'object') continue;
      const itemId = String(row.itemId || row.item_id || '').toLowerCase();
      const tier = String(row.tier || '').toLowerCase();
      const isStar =
        itemId === 'shard_badge' ||
        tier === 'shard' ||
        tier === 'shard_badge';
      if (!isStar) continue;
      const starId = String(
        row.star_asset_id || row.starAssetId || '',
      ).trim();
      // Prefer proving the star asset; if missing id, prove nothing / skip
      const proveId = starId || '';
      if (!proveId) {
        actions.push(`star_equip_no_asset_id:${String(fateAssetId).slice(0, 8)}`);
        continue;
      }
      const proof = await proveWalletOwnsAsset(walletAddress, proveId);
      if (proof === 'not_owned') {
        try {
          const data = await secureFateEquip({
            assetId: fateAssetId,
            equip: false,
          });
          if (data?.inventory) {
            inv = { ...inv, ...data.inventory };
            changed = true;
            actions.push(`unequip_star:${proveId.slice(0, 8)}`);
          }
        } catch (e) {
          console.warn('nft sync unequip star', e?.message || e);
          actions.push('unequip_star_fail');
        }
      } else if (proof === 'unknown') {
        actions.push(`star_unequip_skipped_unknown:${proveId.slice(0, 8)}`);
      }
    }
  }

  return {
    inventory: inv,
    nfts,
    changed,
    scanOk: true,
    actions,
  };
}
