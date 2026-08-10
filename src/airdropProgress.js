/**
 * G2U Q4 airdrop eligibility + % bonuses.
 * L5 (wall cleared) = base ticket. All bonuses stack across categories;
 * within level / taps / streak only the highest tier counts.
 */

export const AIRDROP_META = {
  title: 'G2U Airdrop',
  season: 'Q4 launch',
  subtitle:
    'Clear Level 5 to qualify. Boost your share with levels, lifetime taps, streaks, IAP, NFT, and real friends.',
  disclaimer:
    'Community allocation for launch. Not financial advice. Rules may be refined before the official snapshot.',
};

/** Level 5 wall cleared → max_unlocked_level becomes 9 */
export const L5_MAX_UNLOCKED = 9;
/** Lifetime taps at the L4→L5 paywall (progress bar target for qualification) */
export const L5_LIFETIME_TAPS_TARGET = 50000;
/** Level 10 wall → cap 19 */
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
  friends1k: 5,
  friendsL5: 10,
};

/**
 * @param {object} input
 * @param {number} input.lifetimeTaps
 * @param {number} input.maxUnlockedLevel
 * @param {number} [input.currentLevel] effective level if already computed
 * @param {number} input.streak current UTC streak (same as Tasks claim readiness)
 * @param {boolean} input.hasIap has_made_purchase (Tasks "first purchase" claim ready)
 * @param {string[]} [input.completedTasks] players.completed_tasks — first_purchase claimed
 * @param {boolean} input.hasNft GiftLocksmith
 * @param {number} input.friendsTaps1000 count of referrals with lifetime_taps >= 1000
 * @param {number} input.friendsL5 count of referrals with max_unlocked_level >= 9
 */
export function computeAirdropProgress(input = {}) {
  const lifetimeTaps = Math.max(0, Number(input.lifetimeTaps) || 0);
  const maxUnlocked = Math.max(0, Number(input.maxUnlockedLevel) || 0);
  const streak = Math.max(0, Number(input.streak) || 0);
  // Same as Tasks first_purchase: claim appears when has_made_purchase; also honor claimed task id
  const completedTasks = Array.isArray(input.completedTasks) ? input.completedTasks : [];
  const hasIap =
    !!input.hasIap ||
    completedTasks.includes('first_purchase');
  const hasNft = !!input.hasNft;
  const friendsTaps1000 = Math.max(0, Number(input.friendsTaps1000) || 0);
  const friendsL5 = Math.max(0, Number(input.friendsL5) || 0);

  // Effective play level cannot exceed unlocked cap
  let effectiveLevel = Number(input.currentLevel);
  if (!Number.isFinite(effectiveLevel)) {
    effectiveLevel = estimateLevelFromTaps(lifetimeTaps);
  }
  effectiveLevel = Math.min(effectiveLevel, maxUnlocked || effectiveLevel);

  const qualified = maxUnlocked >= L5_MAX_UNLOCKED;
  const l5TapsTarget = L5_LIFETIME_TAPS_TARGET;
  const l5TapsProgress = Math.min(1, lifetimeTaps / l5TapsTarget);
  const l5TapsRemaining = Math.max(0, l5TapsTarget - lifetimeTaps);

  // Level: highest only (requires wall progress for L10+)
  let levelBonus = 0;
  let levelTier = null;
  if (qualified && maxUnlocked >= L10_MAX_UNLOCKED && effectiveLevel >= 15) {
    levelBonus = AIRDROP_BONUSES.level15;
    levelTier = 15;
  } else if (qualified && maxUnlocked >= L10_MAX_UNLOCKED && effectiveLevel >= 10) {
    levelBonus = AIRDROP_BONUSES.level10;
    levelTier = 10;
  }

  // Lifetime taps: highest only
  let tapsBonus = 0;
  let tapsTier = null;
  if (lifetimeTaps >= 250000) {
    tapsBonus = AIRDROP_BONUSES.taps250k;
    tapsTier = 250000;
  } else if (lifetimeTaps >= 100000) {
    tapsBonus = AIRDROP_BONUSES.taps100k;
    tapsTier = 100000;
  }

  // Streak: same thresholds as Tasks claim for 14 / 30 day streak tasks
  let streakBonus = 0;
  let streakTier = null;
  if (streak >= 30) {
    streakBonus = AIRDROP_BONUSES.streak30;
    streakTier = 30;
  } else if (streak >= 14) {
    streakBonus = AIRDROP_BONUSES.streak14;
    streakTier = 14;
  }

  const iapBonus = hasIap ? AIRDROP_BONUSES.iap : 0;
  const nftBonus = hasNft ? AIRDROP_BONUSES.nft : 0;
  const friends1kDone = friendsTaps1000 >= 3;
  const friendsL5Done = friendsL5 >= 3;
  const friends1kBonus = friends1kDone ? AIRDROP_BONUSES.friends1k : 0;
  const friendsL5Bonus = friendsL5Done ? AIRDROP_BONUSES.friendsL5 : 0;

  const checks = [
    {
      id: 'l5',
      label: 'Level 5 wall cleared',
      detail: qualified
        ? 'Base airdrop ticket — you qualify for a share'
        : `Progress to Level 5 wall: ${lifetimeTaps.toLocaleString()} / ${l5TapsTarget.toLocaleString()} lifetime taps`,
      done: qualified,
      earnedPct: 0, // base ticket, not a % bonus
      bonusLabel: 'BASE',
      required: true,
      progress: {
        current: lifetimeTaps,
        target: l5TapsTarget,
        ratio: l5TapsProgress,
        remaining: l5TapsRemaining,
      },
    },
    {
      id: 'level',
      label: 'Level 10 / Level 15',
      detail:
        levelTier === 15
          ? `Level 15 reached (+${AIRDROP_BONUSES.level15}%)`
          : levelTier === 10
            ? `Level 10 reached (+${AIRDROP_BONUSES.level10}%)`
            : `Highest only: +${AIRDROP_BONUSES.level10}% at L10, +${AIRDROP_BONUSES.level15}% at L15`,
      done: levelBonus > 0,
      earnedPct: levelBonus,
      bonusLabel:
        levelBonus > 0 ? `+${levelBonus}%` : `up to +${AIRDROP_BONUSES.level15}%`,
      sub: [
        { label: 'Level 10', done: levelTier === 10 || levelTier === 15, pct: AIRDROP_BONUSES.level10 },
        { label: 'Level 15', done: levelTier === 15, pct: AIRDROP_BONUSES.level15 },
      ],
    },
    {
      id: 'taps',
      label: 'Lifetime taps',
      detail:
        tapsTier === 250000
          ? `250,000+ lifetime taps (+${AIRDROP_BONUSES.taps250k}%)`
          : tapsTier === 100000
            ? `100,000+ lifetime taps (+${AIRDROP_BONUSES.taps100k}%)`
            : `${lifetimeTaps.toLocaleString()} / 100,000 · highest tier only`,
      done: tapsBonus > 0,
      earnedPct: tapsBonus,
      bonusLabel:
        tapsBonus > 0 ? `+${tapsBonus}%` : `up to +${AIRDROP_BONUSES.taps250k}%`,
      sub: [
        {
          label: '100,000 taps',
          done: lifetimeTaps >= 100000,
          pct: AIRDROP_BONUSES.taps100k,
        },
        {
          label: '250,000 taps',
          done: lifetimeTaps >= 250000,
          pct: AIRDROP_BONUSES.taps250k,
        },
      ],
    },
    {
      id: 'streak',
      label: 'Streak (UTC)',
      detail:
        streakTier === 30
          ? `30-day streak — claimable in Tasks (+${AIRDROP_BONUSES.streak30}%)`
          : streakTier === 14
            ? `14-day streak — claimable in Tasks (+${AIRDROP_BONUSES.streak14}%)`
            : `Current streak ${streak} · checkmarks when Tasks claim unlocks (14 / 30)`,
      done: streakBonus > 0,
      earnedPct: streakBonus,
      bonusLabel:
        streakBonus > 0
          ? `+${streakBonus}%`
          : `up to +${AIRDROP_BONUSES.streak30}%`,
      sub: [
        {
          label: '14-day streak',
          done: streak >= 14,
          pct: AIRDROP_BONUSES.streak14,
        },
        {
          label: '30-day streak',
          done: streak >= 30,
          pct: AIRDROP_BONUSES.streak30,
        },
      ],
    },
    {
      id: 'iap',
      label: 'In-app purchase',
      detail: hasIap
        ? 'Matches Tasks “Make an In-App Purchase” (claim ready or claimed)'
        : 'Same as Tasks: buy once in the shop → claim unlocks → +5% here',
      done: hasIap,
      earnedPct: iapBonus,
      bonusLabel: hasIap ? `+${AIRDROP_BONUSES.iap}%` : `up to +${AIRDROP_BONUSES.iap}%`,
    },
    {
      id: 'nft',
      label: 'GiftLocksmith NFT',
      detail: hasNft ? 'NFT detected in game wallet' : 'Hold GiftLocksmith on snapshot',
      done: hasNft,
      earnedPct: nftBonus,
      bonusLabel: hasNft ? `+${AIRDROP_BONUSES.nft}%` : `up to +${AIRDROP_BONUSES.nft}%`,
    },
    {
      id: 'friends1k',
      label: '3 friends · 1,000 lifetime taps',
      detail: `${Math.min(friendsTaps1000, 3)} / 3 referrals with 1,000+ lifetime taps`,
      done: friends1kDone,
      earnedPct: friends1kBonus,
      bonusLabel: friends1kDone
        ? `+${AIRDROP_BONUSES.friends1k}%`
        : `up to +${AIRDROP_BONUSES.friends1k}%`,
    },
    {
      id: 'friendsL5',
      label: '3 friends · Level 5 wall',
      detail: `${Math.min(friendsL5, 3)} / 3 referrals who cleared Level 5`,
      done: friendsL5Done,
      earnedPct: friendsL5Bonus,
      bonusLabel: friendsL5Done
        ? `+${AIRDROP_BONUSES.friendsL5}%`
        : `up to +${AIRDROP_BONUSES.friendsL5}%`,
    },
  ];

  // Sum earned % from checkmarks (always, even before L5 — motivation).
  // L5 is base ticket only (earnedPct 0). Share weight still 0 until qualified.
  const totalBonus = checks.reduce((sum, c) => sum + (Number(c.earnedPct) || 0), 0);

  const multiplier = qualified ? 1 + totalBonus / 100 : 0;
  const potentialMultiplier = 1 + totalBonus / 100;
  const tier = estimateTier(qualified, totalBonus);

  return {
    qualified,
    totalBonus,
    multiplier,
    potentialMultiplier,
    tier,
    lifetimeTaps,
    effectiveLevel,
    maxUnlocked,
    streak,
    checks,
    friendsTaps1000,
    friendsL5,
    l5TapsTarget,
    l5TapsProgress,
    l5TapsRemaining,
  };
}

/** Mirror GiftTap early curve enough for board display */
export function estimateLevelFromTaps(taps) {
  const t = Number(taps) || 0;
  if (t < 50000) return Math.floor(t / 10000);
  if (t < 125000) return 5 + Math.floor((t - 50000) / 15000);
  if (t < 375000) return 10 + Math.floor((t - 125000) / 25000);
  if (t < 875000) return 20 + Math.floor((t - 375000) / 50000);
  if (t < 2875000) return 30 + Math.floor((t - 875000) / 100000);
  return 50;
}

function estimateTier(qualified, totalBonus) {
  // Tier preview always uses bonus %; label "Locked" is handled in UI if !qualified
  if (totalBonus >= 70) return { id: 'diamond', label: 'Diamond', color: '#67e8f9' };
  if (totalBonus >= 45) return { id: 'gold', label: 'Gold', color: '#ffd700' };
  if (totalBonus >= 20) return { id: 'silver', label: 'Silver', color: '#c0c0c0' };
  if (qualified || totalBonus > 0) return { id: 'bronze', label: 'Bronze', color: '#cd7f32' };
  return { id: 'none', label: 'Not qualified', color: '#666' };
}

/**
 * Load airdrop inputs for a player id from Supabase.
 */
export async function fetchAirdropInputs(supabase, playerId, dbPlayerIdCol = 'telegram_id') {
  if (!playerId) return null;

  const { data: row, error } = await supabase
    .from('players')
    .select(
      'username, lifetime_taps, max_unlocked_level, current_streak, has_made_purchase, completed_tasks, wallet_address, referred_by',
    )
    .eq(dbPlayerIdCol, String(playerId))
    .maybeSingle();

  if (error || !row) {
    console.warn('fetchAirdropInputs', error?.message);
    return null;
  }

  const { data: friends, error: fErr } = await supabase
    .from('players')
    .select('lifetime_taps, max_unlocked_level')
    .eq('referred_by', String(playerId));

  let friendsTaps1000 = 0;
  let friendsL5 = 0;
  if (!fErr && Array.isArray(friends)) {
    for (const f of friends) {
      if (Number(f.lifetime_taps) >= 1000) friendsTaps1000 += 1;
      if (Number(f.max_unlocked_level) >= L5_MAX_UNLOCKED) friendsL5 += 1;
    }
  }

  const completedTasks = Array.isArray(row.completed_tasks) ? row.completed_tasks : [];

  return {
    username: row.username,
    lifetimeTaps: Number(row.lifetime_taps) || 0,
    maxUnlockedLevel: Number(row.max_unlocked_level) || 0,
    streak: Number(row.current_streak) || 0,
    // Tasks “Make an In-App Purchase”: claim appears when has_made_purchase
    hasIap: !!row.has_made_purchase || completedTasks.includes('first_purchase'),
    completedTasks,
    walletAddress: row.wallet_address || null,
    friendsTaps1000,
    friendsL5,
  };
}
