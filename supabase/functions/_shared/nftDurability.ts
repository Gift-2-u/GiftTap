/**
 * Mining NFT durability (Echo / Fate / Rush / Shadow).
 *
 * - Starts at 100% on first activate
 * - Drains 1% per 1,000 raw taps (commit-taps validTaps)
 * - At 0% perk is fully off
 * - Reload: 1,000 $G2U (gft_token_balance) per 1%
 */

export const NFT_DURABILITY_MAX = 100;
/** Percent points lost per 1,000 raw taps */
export const NFT_DURABILITY_DRAIN_PER_1K_TAPS = 1;
/** $G2U per +1% reload */
export const NFT_DURABILITY_G2U_PER_PERCENT = 1000;

export const NFT_DURABILITY_KINDS = [
  "echo",
  "fate",
  "rush",
  "shadow",
] as const;

export type NftDurabilityKind = (typeof NFT_DURABILITY_KINDS)[number];

/** inventory key for each kind */
export const NFT_ACTIVE_KEY: Record<NftDurabilityKind, string> = {
  echo: "echo_active",
  fate: "fate_power",
  rush: "rush_active",
  shadow: "shadow_active",
};

export function roundDurability(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.max(0, Math.min(NFT_DURABILITY_MAX, n)) * 1000) / 1000;
}

/**
 * Read durability from an active row.
 * Missing field on an owned/active NFT → treat as full (legacy actives).
 */
export function getNftDurability(
  row: Record<string, unknown> | null | undefined,
): number {
  if (!row || typeof row !== "object") return 0;
  if (row.durability === undefined || row.durability === null) {
    return NFT_DURABILITY_MAX;
  }
  return roundDurability(Number(row.durability));
}

export function isNftPerkLive(
  row: Record<string, unknown> | null | undefined,
): boolean {
  if (!row || typeof row !== "object") return false;
  return getNftDurability(row) > 0;
}

/** Ensure durability field exists (100) without resetting an existing charge. */
export function ensureNftDurabilityOnActivate(
  next: Record<string, unknown>,
  prev: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const sameAsset =
    prev &&
    typeof prev === "object" &&
    String(prev.asset_id || "") !== "" &&
    String(prev.asset_id) === String(next.asset_id || "");
  if (sameAsset && prev.durability !== undefined && prev.durability !== null) {
    return {
      ...next,
      durability: getNftDurability(prev as Record<string, unknown>),
      durability_updated_at:
        prev.durability_updated_at || new Date().toISOString(),
    };
  }
  if (next.durability !== undefined && next.durability !== null) {
    return {
      ...next,
      durability: getNftDurability(next),
    };
  }
  return {
    ...next,
    durability: NFT_DURABILITY_MAX,
    durability_updated_at: new Date().toISOString(),
  };
}

function durabilityMap(inv: Record<string, unknown>): Record<string, number> {
  const m = inv.nft_durability;
  if (m && typeof m === "object" && !Array.isArray(m)) {
    return { ...(m as Record<string, number>) };
  }
  return {};
}

/**
 * Drain every active mining elf by raw taps (highest owned of each kind,
 * synced into *_active). Also writes inventory.nft_durability[assetId].
 */
export function drainActiveNfts(
  inv: Record<string, unknown>,
  rawTaps: number,
): boolean {
  const taps = Math.max(0, Math.floor(Number(rawTaps) || 0));
  if (taps <= 0) return false;
  const drainPct =
    (taps / 1000) * NFT_DURABILITY_DRAIN_PER_1K_TAPS;
  if (drainPct <= 0) return false;

  let changed = false;
  const now = new Date().toISOString();
  const map = durabilityMap(inv);
  for (const kind of NFT_DURABILITY_KINDS) {
    const key = NFT_ACTIVE_KEY[kind];
    const raw = inv[key];
    if (!raw || typeof raw !== "object") continue;
    const row = { ...(raw as Record<string, unknown>) };
    const assetId = String(row.asset_id || row.assetId || "");
    let before = getNftDurability(row);
    if (assetId && map[assetId] !== undefined && map[assetId] !== null) {
      before = roundDurability(Number(map[assetId]));
    }
    if (before <= 0) {
      if (row.durability === undefined || row.durability === null || before === 0) {
        row.durability = 0;
        row.durability_updated_at = now;
        inv[key] = row;
        if (assetId) map[assetId] = 0;
        changed = true;
      }
      continue;
    }
    const after = roundDurability(before - drainPct);
    if (after !== before) {
      row.durability = after;
      row.durability_updated_at = now;
      inv[key] = row;
      if (assetId) map[assetId] = after;
      changed = true;
    }
  }
  if (changed) inv.nft_durability = map;
  return changed;
}

export function durabilitySnapshot(inv: Record<string, unknown>): Record<
  string,
  { durability: number; live: boolean }
> {
  const out: Record<string, { durability: number; live: boolean }> = {};
  for (const kind of NFT_DURABILITY_KINDS) {
    const key = NFT_ACTIVE_KEY[kind];
    const raw = inv[key];
    if (!raw || typeof raw !== "object") continue;
    const d = getNftDurability(raw as Record<string, unknown>);
    out[kind] = { durability: d, live: d > 0 };
  }
  return out;
}

export function activeRowForKind(
  inv: Record<string, unknown>,
  kind: NftDurabilityKind,
): Record<string, unknown> | null {
  const key = NFT_ACTIVE_KEY[kind];
  const raw = inv[key];
  if (!raw || typeof raw !== "object") return null;
  return raw as Record<string, unknown>;
}

/** Top-up math: percent points to add, G2U cost. */
export function computeDurabilityTopUp(
  current: number,
  wantPercent: number,
): { add: number; costG2u: number; after: number } {
  const cur = roundDurability(current);
  const want = Math.max(1, Math.floor(Number(wantPercent) || 0));
  const room = Math.max(0, NFT_DURABILITY_MAX - cur);
  const add = Math.min(want, room);
  const costG2u = add * NFT_DURABILITY_G2U_PER_PERCENT;
  return {
    add,
    costG2u,
    after: roundDurability(cur + add),
  };
}

export function g2uNftEconomyEnabled(): boolean {
  try {
    const v = String(Deno.env.get("G2U_NFT_DURABILITY_ENABLED") || "")
      .trim()
      .toLowerCase();
    if (["1", "true", "yes", "on"].includes(v)) return true;
    // Shared launch switch with premium
    const p = String(Deno.env.get("G2U_PREMIUM_ENABLED") || "")
      .trim()
      .toLowerCase();
    return ["1", "true", "yes", "on"].includes(p);
  } catch {
    return false;
  }
}
