/**
 * Mirror of airdrop board weights (L5+). Used only by snapshot scripts.
 * Keep in sync with supabase/functions/_shared/airdropScore.ts
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
  nftLocksmith: 25,
  nftCommon: 5,
  nftRare: 10,
  nftEpic: 20,
  nftLegendary: 30,
  friends1k: 5,
  friendsL5: 10,
};

function estimateLevelFromTaps(taps) {
  const t = Number(taps) || 0;
  if (t < 50000) return Math.floor(t / 10000);
  if (t < 125000) return 5 + Math.floor((t - 50000) / 15000);
  if (t < 375000) return 10 + Math.floor((t - 125000) / 25000);
  if (t < 875000) return 20 + Math.floor((t - 375000) / 50000);
  if (t < 2875000) return 30 + Math.floor((t - 875000) / 100000);
  return 50;
}

function nftBonusFromSnap(inv) {
  const snap = inv?.airdrop_nft;
  if (!snap || typeof snap !== 'object') return 0;
  const b = Number(snap.bonus);
  if (Number.isFinite(b) && b > 0) return Math.floor(b);
  const nfts = Array.isArray(snap.nfts) ? snap.nfts : [];
  let locksmith = false;
  let extra = 0;
  for (const n of nfts) {
    const kind = String(n?.kind || n?.name || '')
      .toLowerCase()
      .replace(/\s+/g, '');
    const rarity = String(n?.rarity || '')
      .toLowerCase()
      .replace(/\s+/g, '');
    if (kind.includes('locksmith')) {
      locksmith = true;
      continue;
    }
    if (['fate', 'echo', 'rush', 'shadow', 'elf'].some((k) => kind.includes(k))) {
      if (rarity.startsWith('legend')) extra += AIRDROP_BONUSES.nftLegendary;
      else if (rarity.startsWith('epic')) extra += AIRDROP_BONUSES.nftEpic;
      else if (rarity.startsWith('rare')) extra += AIRDROP_BONUSES.nftRare;
      else extra += AIRDROP_BONUSES.nftCommon;
    }
  }
  return (locksmith ? AIRDROP_BONUSES.nftLocksmith : 0) + extra;
}

/** Total bonus weight for L5 pool split (0 if not qualified). */
export function l5Weight(row, friends1k = 0, friendsL5 = 0) {
  const maxU = Number(row.max_unlocked_level) || 0;
  if (maxU < L5_MAX_UNLOCKED) return 0;
  const lifetimeTaps = Number(row.lifetime_taps) || 0;
  const streak = Number(row.current_streak) || 0;
  const hasIap =
    !!row.has_made_purchase ||
    (Array.isArray(row.completed_tasks) &&
      row.completed_tasks.includes('first_purchase'));

  let level = estimateLevelFromTaps(lifetimeTaps);
  level = Math.min(level, maxU || level);

  let levelBonus = 0;
  if (maxU >= L10_MAX_UNLOCKED && level >= 15) levelBonus = AIRDROP_BONUSES.level15;
  else if (maxU >= L10_MAX_UNLOCKED && level >= 10) levelBonus = AIRDROP_BONUSES.level10;

  let tapsBonus = 0;
  if (lifetimeTaps >= 250000) tapsBonus = AIRDROP_BONUSES.taps250k;
  else if (lifetimeTaps >= 100000) tapsBonus = AIRDROP_BONUSES.taps100k;

  let streakBonus = 0;
  if (streak >= 30) streakBonus = AIRDROP_BONUSES.streak30;
  else if (streak >= 14) streakBonus = AIRDROP_BONUSES.streak14;

  const iapBonus = hasIap ? AIRDROP_BONUSES.iap : 0;
  const nftBonus = nftBonusFromSnap(row.inventory);
  const f1 = friends1k >= 3 ? AIRDROP_BONUSES.friends1k : 0;
  const f5 = friendsL5 >= 3 ? AIRDROP_BONUSES.friendsL5 : 0;

  // Board bonus % only (same as airdrop-board). L5 with 0 extras → 0%.
  return levelBonus + tapsBonus + streakBonus + iapBonus + nftBonus + f1 + f5;
}

/**
 * L5 airdrop payout: baseG2u × (1 + bonusPct/100).
 * Example: base 500_000, bonus 30 → 650_000.
 */
export function l5AmountFromBonus(baseG2u, bonusPct) {
  const base = Math.max(0, Number(baseG2u) || 0);
  const pct = Math.max(0, Number(bonusPct) || 0);
  return Math.round(base * (1 + pct / 100) * 1e6) / 1e6;
}
