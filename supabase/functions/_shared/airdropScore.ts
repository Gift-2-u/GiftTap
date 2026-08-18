/**
 * Shared airdrop board scoring (qualified players only).
 * Mirrors src/airdropProgress.js bonuses for public Ranks → Airdrop.
 */

export const L5_MAX_UNLOCKED = 9;
export const L10_MAX_UNLOCKED = 19;

export const AIRDROP_BONUSES = {
  level10: 10,
  level15: 15,
  taps100k: 10,
  taps250k: 15,
  streak14: 5,
  streak30: 10,
  iap: 5,
  nft: 25,
  nftLocksmith: 25,
  nftCommon: 5,
  nftRare: 10,
  nftEpic: 20,
  nftLegendary: 30,
  friends1k: 5,
  friendsL5: 10,
};

export function estimateLevelFromTaps(taps: number): number {
  const t = Number(taps) || 0;
  if (t < 50000) return Math.floor(t / 10000);
  if (t < 125000) return 5 + Math.floor((t - 50000) / 15000);
  if (t < 375000) return 10 + Math.floor((t - 125000) / 25000);
  if (t < 875000) return 20 + Math.floor((t - 375000) / 50000);
  if (t < 2875000) return 30 + Math.floor((t - 875000) / 100000);
  return 50;
}

function normRarityKey(raw: unknown): string {
  const r = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (r.startsWith("legend")) return "legendary";
  if (r.startsWith("epic")) return "epic";
  if (r.startsWith("rare")) return "rare";
  if (r.startsWith("common")) return "common";
  return "";
}

function normKindKey(raw: unknown): string {
  const r = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (r.includes("locksmith") || r === "giftlocksmith") return "locksmith";
  if (r.includes("fate")) return "fate";
  if (r.includes("echo")) return "echo";
  if (r.includes("rush")) return "rush";
  if (r.includes("shadow")) return "shadow";
  return r || "elf";
}

export function nftRarityBonusPct(rarityKey: unknown): number {
  const r = normRarityKey(rarityKey);
  if (r === "legendary") return AIRDROP_BONUSES.nftLegendary;
  if (r === "epic") return AIRDROP_BONUSES.nftEpic;
  if (r === "rare") return AIRDROP_BONUSES.nftRare;
  if (r === "common") return AIRDROP_BONUSES.nftCommon;
  return 0;
}

export type NftPiece = { kind?: string; rarity?: string; name?: string };

/** Locksmith +25% once; each other elf adds by rarity. */
export function scoreNftAirdropBonus(nfts: NftPiece[] = []): {
  hasLocksmith: boolean;
  hasNft: boolean;
  totalNftBonus: number;
} {
  const list = Array.isArray(nfts) ? nfts : [];
  let hasLocksmith = false;
  let collectionBonus = 0;
  let extraCount = 0;

  for (const n of list) {
    const kind = normKindKey(n?.kind) || normKindKey(n?.name) || "elf";
    const rarity = normRarityKey(n?.rarity) || (kind === "locksmith" ? "rare" : "common");
    if (kind === "locksmith") {
      hasLocksmith = true;
      continue;
    }
    if (["fate", "echo", "rush", "shadow", "elf"].includes(kind)) {
      collectionBonus += nftRarityBonusPct(rarity) || AIRDROP_BONUSES.nftCommon;
      extraCount += 1;
    }
  }

  const locksmithBonus = hasLocksmith ? AIRDROP_BONUSES.nftLocksmith : 0;
  const totalNftBonus = locksmithBonus + collectionBonus;
  return {
    hasLocksmith,
    hasNft: hasLocksmith || extraCount > 0,
    totalNftBonus,
  };
}

export type AirdropScoreInput = {
  lifetimeTaps: number;
  maxUnlockedLevel: number;
  streak?: number;
  hasIap?: boolean;
  hasNft?: boolean;
  nfts?: NftPiece[];
  nftBonus?: number;
  friendsTaps1000?: number;
  friendsL5?: number;
  currentLevel?: number;
};

export type AirdropScoreResult = {
  qualified: boolean;
  totalBonus: number;
  level: number;
  lifetimeTaps: number;
};

/** Bonus % for airdrop board (0 if not L5-qualified). */
export function scoreAirdropPlayer(input: AirdropScoreInput): AirdropScoreResult {
  const lifetimeTaps = Math.max(0, Number(input.lifetimeTaps) || 0);
  const maxUnlocked = Math.max(0, Number(input.maxUnlockedLevel) || 0);
  const streak = Math.max(0, Number(input.streak) || 0);
  const hasIap = !!input.hasIap;
  const friendsTaps1000 = Math.max(0, Number(input.friendsTaps1000) || 0);
  const friendsL5 = Math.max(0, Number(input.friendsL5) || 0);

  let effectiveLevel = Number(input.currentLevel);
  if (!Number.isFinite(effectiveLevel)) {
    effectiveLevel = estimateLevelFromTaps(lifetimeTaps);
  }
  effectiveLevel = Math.min(effectiveLevel, maxUnlocked || effectiveLevel);

  const qualified = maxUnlocked >= L5_MAX_UNLOCKED;
  if (!qualified) {
    return { qualified: false, totalBonus: 0, level: effectiveLevel, lifetimeTaps };
  }

  let levelBonus = 0;
  if (maxUnlocked >= L10_MAX_UNLOCKED && effectiveLevel >= 15) {
    levelBonus = AIRDROP_BONUSES.level15;
  } else if (maxUnlocked >= L10_MAX_UNLOCKED && effectiveLevel >= 10) {
    levelBonus = AIRDROP_BONUSES.level10;
  }

  let tapsBonus = 0;
  if (lifetimeTaps >= 250000) tapsBonus = AIRDROP_BONUSES.taps250k;
  else if (lifetimeTaps >= 100000) tapsBonus = AIRDROP_BONUSES.taps100k;

  let streakBonus = 0;
  if (streak >= 30) streakBonus = AIRDROP_BONUSES.streak30;
  else if (streak >= 14) streakBonus = AIRDROP_BONUSES.streak14;

  const iapBonus = hasIap ? AIRDROP_BONUSES.iap : 0;

  let nftBonus = 0;
  if (Array.isArray(input.nfts) && input.nfts.length) {
    nftBonus = scoreNftAirdropBonus(input.nfts).totalNftBonus;
  } else if (input.nftBonus != null && Number.isFinite(Number(input.nftBonus))) {
    nftBonus = Math.max(0, Math.floor(Number(input.nftBonus) || 0));
  } else if (input.hasNft) {
    nftBonus = AIRDROP_BONUSES.nftLocksmith;
  }

  const friends1kBonus = friendsTaps1000 >= 3 ? AIRDROP_BONUSES.friends1k : 0;
  const friendsL5Bonus = friendsL5 >= 3 ? AIRDROP_BONUSES.friendsL5 : 0;

  const totalBonus =
    levelBonus + tapsBonus + streakBonus + iapBonus + nftBonus + friends1kBonus + friendsL5Bonus;

  return {
    qualified: true,
    totalBonus,
    level: effectiveLevel,
    lifetimeTaps,
  };
}
