import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { DB_PLAYER_ID } from './playerIdentity';
import { Connection, PublicKey, Keypair, Transaction, SystemProgram, ComputeBudgetProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { keypairFromMnemonic } from './solanaWallet';
import { MINT_ADDRESS } from './config';
import {
  mintLocksmithWave1,
  LOCKSMITH_WAVE1,
  minSolForLocksmithMint,
  getWalletSolBalance,
  assertWalletCanMintLocksmith,
  publicKeyFromSecret,
} from './mintLocksmith';
import {
  STAR_WAVE1,
  mintStarWave1,
  minSolForStarMint,
  assertWalletCanMintStar,
  isStarMintLive,
  loadStarCmConfig,
} from './mintStar';
import {
  FATE_CM,
  mintFateWave1,
  minSolForFateMint,
  assertWalletCanMintFate,
  isFateMintLive,
  loadFateCmConfig,
} from './mintFate';
import { fateDescription } from './fate';
import {
  ECHO_CM,
  mintEchoWave1,
  minSolForEchoMint,
  assertWalletCanMintEcho,
  isEchoMintLive,
  loadEchoCmConfig,
} from './mintEcho';
import { echoDescription, ECHO_MULTI } from './echo';
import { RPC_URL } from './rpc';
import {
  RUSH_CM,
  mintRushWave1,
  minSolForRushMint,
  assertWalletCanMintRush,
  isRushMintLive,
  loadRushCmConfig,
} from './mintRush';
import { rushDescription, RUSH_DAILY_LIMIT } from './rush';
import {
  SHADOW_CM,
  mintShadowWave1,
  minSolForShadowMint,
  assertWalletCanMintShadow,
  isShadowMintLive,
  loadShadowCmConfig,
} from './mintShadow';
import { shadowDescription, SHADOW_HOURS } from './shadow';
import { ShopGlyph } from './shopIcons';
import {
  applyWeeklyBoostBuy,
  getUtcWeekId,
  mergeInventoryWeekly,
  applyServerInventoryAuthority,
  applyShopQtyAuthority,
  hydrateWeeklyClaimsFromLedger,
  applyTaskLimitBoostToInventory,
} from './weeklyQuestLogic';
import {
  BADGE_TIERS,
  MYSTERY_BOX_COSTS,
  BADGE_ITEM_IDS,
  getBadgeCounts,
  canOpenMysteryWith,
  MYSTERY_ODDS_BY_TIER,
  badgeCatalogForBackpack,
  BADGE_SHARD_SHOP,
  BADGE_SHOP_DAY_CAP,
  BADGE_SHOP_WEEK_CAP,
} from './weeklyBadges';
import {
  SHARD_BADGE,
  getShardBadgeCount,
  getFreeShardBadgeCount,
  shardBadgeCatalogEntry,
} from './shardBadge';
import WeeklyBadgePanel from './WeeklyBadgePanel';
import BadgeMarket from './BadgeMarket';
import NftMarket from './NftMarket';
import { filterAndSortNfts } from './nftMarketFilters';
import NftFilterBar from './NftFilterBar';
import {
  hasSecureSession,
  ensureSecureSession,
  secureShopBuy,
  secureMysteryOpen,
  secureBackpackActivate,
  securePremiumGrant,
  secureEchoActivate,
  secureFateActivate,
  secureRushActivate,
  secureShadowActivate,
} from './secureApi';
import WalletNftSection from './WalletNftSection';
import { listGiftNfts, invalidateGiftNftListCache } from './locksmith';
import { invalidateOwnershipSyncThrottle } from './nftOwnershipSync';
import { isTokenLaunched } from './tokenLaunch';

/**
 * Backpack writes: keep everything the player already has; only write keys
 * present on `addition` (the purchase / NFT activate fields). Never wipe badges/boosts.
 */
function addToBackpackInventory(prev, addition) {
  const out =
    prev && typeof prev === 'object' && !Array.isArray(prev) ? { ...prev } : {};
  if (!addition || typeof addition !== 'object' || Array.isArray(addition)) {
    return out;
  }
  for (const key of Object.keys(addition)) {
    const val = addition[key];
    if (val === undefined) continue;
    if (
      (key === 'elf_levels' || key === 'star_levels' || key === 'fate_equip') &&
      val &&
      typeof val === 'object' &&
      !Array.isArray(val)
    ) {
      out[key] = {
        ...(out[key] && typeof out[key] === 'object' ? out[key] : {}),
        ...val,
      };
      continue;
    }
    out[key] = val;
  }
  return out;
}

/** Professional icon tile — custom SVG / image or built-in glyph */
function ShopItemIcon({ item, size = 52, variant = 'row' }) {
  const from = item.iconFrom || '#333';
  const to = item.iconTo || '#111';
  const ring = item.iconRing || 'rgba(255,255,255,0.12)';
  const isWide = variant === 'card';
  // Custom PNGs (e.g. G2Ushard) need more room than line glyphs to read clearly
  const glyphSize = item.iconUrl
    ? isWide
      ? 64
      : Math.round(size * 0.78)
    : isWide
      ? 44
      : Math.round(size * 0.62);

  return (
    <div
      style={{
        width: isWide ? '100%' : size,
        height: isWide ? 88 : size,
        minWidth: isWide ? undefined : size,
        borderRadius: isWide ? 12 : 14,
        background: `linear-gradient(145deg, ${from} 0%, ${to} 100%)`,
        border: `1px solid ${ring}`,
        boxShadow: `0 4px 14px ${item.iconGlow || 'rgba(0,0,0,0.35)'}, inset 0 1px 0 rgba(255,255,255,0.12)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
      }}
      aria-hidden
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.14) 0%, transparent 45%)',
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.35))' }}>
        {item.iconUrl ? (
          <img
            src={item.iconUrl}
            alt=""
            width={glyphSize}
            height={glyphSize}
            style={{ display: 'block', objectFit: 'contain' }}
          />
        ) : (
          <ShopGlyph itemId={item.id} size={glyphSize} />
        )}
      </div>
    </div>
  );
}

const Marketplace = ({ balance, setBalance, stats, setStats, setEnergy, bumpEnergyEpoch, flushPendingTaps, player, tgUser, playerWallet, decryptedPhrase, initialTab, onInitialTabConsumed, maxUnlockedLevel = 4, onChainBalanceChange = null }) => {
  const user = player || tgUser;
  // Shop hub first — show ALL options (Free / Premium / NFT / Backpack) before any list
  const [activeTab, setActiveTab] = useState(initialTab || 'home');

  // Deep-link from daily-limit CTA (Expanded Battery under Free / upgrades)
  useEffect(() => {
    if (!initialTab) return;
    setActiveTab(initialTab);
    if (typeof onInitialTabConsumed === 'function') onInitialTabConsumed();
  }, [initialTab, onInitialTabConsumed]);
  const [marketFilter, setMarketFilter] = useState('All');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [itemToBuy, setItemToBuy] = useState(null);
  /** NFT marketplace: grid card click → detail popup */
  const [nftDetail, setNftDetail] = useState(null);
  /** Mint catalog filters — rarity / role / level / sort */
  const [nftRarityFilter, setNftRarityFilter] = useState('all');
  const [nftRoleFilter, setNftRoleFilter] = useState('all');
  const [nftLevelFilter, setNftLevelFilter] = useState('all');
  const [nftSort, setNftSort] = useState('default');

  // Custom Pop-up State
  const [txStatus, setTxStatus] = useState({ show: false, loading: false, message: '', success: false });

  // Initialize local inventory from stats so the UI updates instantly
  const [localInventory, setLocalInventory] = useState(stats?.inventory || {});
  /** Backpack categories: boost | badges | nft */
  const [backpackCat, setBackpackCat] = useState('boost');
  const [walletNftCount, setWalletNftCount] = useState(0);
  const [walletNftRefresh, setWalletNftRefresh] = useState(0);
  const [mysteryBusy, setMysteryBusy] = useState(false);
  /** { label, dest, prizeId, tier } after a successful open */
  const [mysteryReveal, setMysteryReveal] = useState(null);
  // NEW: Track daily usage from the database stats
  const [dailyUsage, setDailyUsage] = useState(stats?.daily_usage || {});

  /** Game wallet SOL — gate NFT mints (Locksmith + Fate) */
  const [walletSol, setWalletSol] = useState(null);
  const [walletSolLoading, setWalletSolLoading] = useState(false);
  const [fateCmReady, setFateCmReady] = useState(false);
  const [echoCmReady, setEchoCmReady] = useState(false);
  const [starCmReady, setStarCmReady] = useState(false);
  const [rushCmReady, setRushCmReady] = useState(false);
  const [shadowCmReady, setShadowCmReady] = useState(false);
  const minMintSol = minSolForLocksmithMint();
  // Unlocked after normal username+password login (phrase passed from GiftTap)
  const walletUnlocked = Boolean(
    decryptedPhrase && String(decryptedPhrase).trim().length > 0,
  );
  const canAffordStarMint =
    Number.isFinite(walletSol) && walletSol >= minSolForStarMint();
  const canAffordLocksmithMint =
    walletUnlocked &&
    walletSol != null &&
    Number.isFinite(walletSol) &&
    walletSol >= minMintSol;

  const canAffordFate = (rarityKey) => {
    if (!walletUnlocked || walletSol == null || !Number.isFinite(walletSol)) return false;
    return walletSol >= minSolForFateMint(rarityKey);
  };
  const canAffordEcho = (rarityKey) => {
    if (!walletUnlocked || walletSol == null || !Number.isFinite(walletSol)) return false;
    return walletSol >= minSolForEchoMint(rarityKey);
  };
  const canAffordRush = (rarityKey) => {
    if (!walletUnlocked || walletSol == null || !Number.isFinite(walletSol)) return false;
    return walletSol >= minSolForRushMint(rarityKey);
  };
  const canAffordShadow = (rarityKey) => {
    if (!walletUnlocked || walletSol == null || !Number.isFinite(walletSol)) return false;
    return walletSol >= minSolForShadowMint(rarityKey);
  };

  useEffect(() => {
    let cancelled = false;
    loadFateCmConfig().then(() => {
      if (!cancelled) setFateCmReady(true);
    });
    loadEchoCmConfig().then(() => {
      if (!cancelled) setEchoCmReady(true);
    });
    loadStarCmConfig().then(() => {
      if (!cancelled) setStarCmReady(true);
    });
    loadRushCmConfig().then(() => {
      if (!cancelled) setRushCmReady(true);
    });
    loadShadowCmConfig().then(() => {
      if (!cancelled) setShadowCmReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);


  // Count on-chain Gift2u NFTs for backpack badge + NFT tab (original behavior)
  useEffect(() => {
    const addr = playerWallet && String(playerWallet).trim();
    if (!addr || addr.length < 32) {
      setWalletNftCount(0);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await listGiftNfts(addr);
        if (!cancelled) setWalletNftCount(Array.isArray(list) ? list.length : 0);
      } catch (e) {
        console.warn('backpack nft count', e?.message || e);
        if (!cancelled) setWalletNftCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playerWallet, activeTab, backpackCat, walletNftRefresh]);

  useEffect(() => {
    if (stats?.inventory && typeof stats.inventory === 'object') {
      // Never apply an empty {} snapshot — that deletes badge_diamond / badge_gold via authority
      if (Object.keys(stats.inventory).length === 0) return;
      setLocalInventory((prev) =>
        applyServerInventoryAuthority(
          prev || {},
          stats.inventory,
          getUtcWeekId(),
        ),
      );
    }
    const fromStats = stats?.daily_usage;
    const fromInv =
      stats?.inventory?.daily_usage &&
      typeof stats.inventory.daily_usage === 'object'
        ? stats.inventory.daily_usage
        : null;
    if (fromStats || fromInv) {
      setDailyUsage((prev) => ({
        ...(prev || {}),
        ...(fromInv || {}),
        ...(fromStats || {}),
      }));
    }
  }, [stats?.inventory, stats?.daily_usage]);

  // Parent callback via ref so NFT SOL refresh effect does not re-fire every render
  const onChainBalanceChangeRef = React.useRef(onChainBalanceChange);
  React.useEffect(() => {
    onChainBalanceChangeRef.current = onChainBalanceChange;
  }, [onChainBalanceChange]);

  const applyWalletSol = React.useCallback((sol, pushParent = true) => {
    const n = Number(sol);
    if (!Number.isFinite(n)) return;
    setWalletSol((prev) => (prev === n ? prev : n));
    if (pushParent && typeof onChainBalanceChangeRef.current === 'function') {
      onChainBalanceChangeRef.current({ sol: n });
    }
  }, []);

  // Refresh SOL when player opens NFTs tab (stable deps — no flash / no null wipe)
  useEffect(() => {
    if (activeTab !== 'nft') return;
    const addr = playerWallet && String(playerWallet).trim();
    if (!addr || addr.length < 32) return;
    let cancelled = false;
    getWalletSolBalance(addr)
      .then((sol) => {
        if (!cancelled) {
          applyWalletSol(sol, false);
          setWalletSolLoading(false);
        }
      })
      .catch(() => {
        /* keep last known SOL — do not flash 0.0000 */
        if (!cancelled) setWalletSolLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, playerWallet, applyWalletSol]);

  // Premium tab: local SOL gate only
  useEffect(() => {
    if (activeTab !== 'premium') return;
    const addr = playerWallet && String(playerWallet).trim();
    if (!addr || addr.length < 32) return;
    let cancelled = false;
    getWalletSolBalance(addr)
      .then((sol) => {
        if (!cancelled) applyWalletSol(sol, false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeTab, playerWallet, applyWalletSol]);

  // NEW: Helper to get the current date in UTC format (YYYY-MM-DD)
  // This ensures everyone resets at the exact same global moment.
  const getTodayUTCString = () => {
    const now = new Date();
    return now.toISOString().split('T')[0]; 
  };

  /**
   * End of a UTC calendar day (23:59:59.999 UTC).
   * @param {number} daysFromToday 0 = today UTC, 1 = tomorrow UTC, etc.
   * Used so Expanded Battery / Heavy Hands / bot / contracts all align
   * with "wait until UTC midnight" daily usage — not the player's local TZ.
   */
  const getEndOfUtcDay = (daysFromToday = 0) => {
    const now = new Date();
    return new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + daysFromToday,
      23, 59, 59, 999,
    ));
  };


  /**
   * Never replace inventory with shop-local state alone.
   * Shop localInventory often lacks task_limit_boost / weekly ledgers — that wiped +100 daily-limit rewards.
   */
  const buildFullInventory = (patch = {}) => {
    const weekId = getUtcWeekId();
    const parent = stats?.inventory || {};
    const local = localInventory || {};
    let inv = mergeInventoryWeekly(parent, local, weekId);
    inv = mergeInventoryWeekly(inv, patch, weekId);
    // Explicitly keep daily-limit boost if patch omitted it
    const pBoost = parent.task_limit_boost;
    const iBoost = inv.task_limit_boost;
    const now = Date.now();
    const pAmt =
      pBoost?.expires && new Date(pBoost.expires).getTime() > now
        ? Number(pBoost.amount) || 0
        : 0;
    const iAmt =
      iBoost?.expires && new Date(iBoost.expires).getTime() > now
        ? Number(iBoost.amount) || 0
        : 0;
    if (pAmt > iAmt) inv.task_limit_boost = pBoost;
    inv = hydrateWeeklyClaimsFromLedger(inv, weekId);
    return inv;
  };

  // --- ITEM DEFINITIONS (icon + gradient for ShopItemIcon) ---
  const shardListings = [
    {
      id: 'frenzy',
      name: '30-Second Frenzy',
      desc: '2x Payout per energy',
      duration: '30 Seconds',
      cost: 500,
      iconFrom: '#ff6b35',
      iconTo: '#7c1d12',
      iconRing: 'rgba(255,107,53,0.45)',
      iconGlow: 'rgba(255,107,53,0.25)',
    },
    {
      id: 'battery',
      name: '+500 Daily Energy ',
      desc: 'Update your Max Daily limit by 500',
      duration: 'Until UTC midnight',
      cost: 400,
      iconFrom: '#60a5fa',
      iconTo: '#1e3a8a',
      iconRing: 'rgba(96,165,250,0.45)',
      iconGlow: 'rgba(59,130,246,0.25)',
    },
    // Heavy Hands removed from shop (replace later). Leftover inventory charges stay inert.
    {
      id: 'refill',
      name: 'Battery Refill',
      desc: 'Fills 500 to your Battery · 1× free / UTC day after launch',
      duration: 'Instant',
      cost: 300,
      iconFrom: '#4ade80',
      iconTo: '#14532d',
      iconRing: 'rgba(74,222,128,0.4)',
      iconGlow: 'rgba(74,222,128,0.2)',
    },
    {
      id: 'badge_bronze',
      name: BADGE_SHARD_SHOP.badge_bronze.name,
      desc: 'For Mystery Gift · 1/day · 3/week',
      duration: 'Keep in Backpack',
      cost: BADGE_SHARD_SHOP.badge_bronze.cost,
      isBadgeShop: true,
      iconUrl: BADGE_TIERS.bronze.image,
      iconFrom: '#cd7f32',
      iconTo: '#5c3a1a',
      iconRing: 'rgba(205,127,50,0.5)',
      iconGlow: 'rgba(205,127,50,0.25)',
    },
    {
      id: 'badge_silver',
      name: BADGE_SHARD_SHOP.badge_silver.name,
      desc: 'For Mystery Gift · 1/day · 3/week',
      duration: 'Keep in Backpack',
      cost: BADGE_SHARD_SHOP.badge_silver.cost,
      isBadgeShop: true,
      iconUrl: BADGE_TIERS.silver.image,
      iconFrom: '#c0c0c0',
      iconTo: '#4a4a4a',
      iconRing: 'rgba(192,192,192,0.5)',
      iconGlow: 'rgba(192,192,192,0.25)',
    },
  ];

  /** After launch (or VITE_G2U_PREMIUM=true): Premium priced in $G2U (on-chain to master). */
  const G2U_PREMIUM =
    String(import.meta.env.VITE_G2U_PREMIUM || '').toLowerCase() === 'true' ||
    String(import.meta.env.VITE_G2U_PREMIUM || '') === '1' ||
    isTokenLaunched();
  /** LP rate: 20 SOL / 100M G2U = 5M G2U per SOL — keep in sync with premium-grant G2U_PER_SOL */
  const G2U_PER_SOL = Number(import.meta.env.VITE_G2U_PER_SOL) || 5_000_000;

  /** Premium boosts — SOL pre-launch, $G2U when flag on (not NFTs) */
  const premiumListingsRaw = [
    {
      id: 'bot',
      name: 'Weekend Bot',
      type: 'Misc',
      rarity: 'Epic',
      boost: 'Auto-tap max limits',
      duration: '3 Days',
      price: 0.01,
      currency: 'SOL',
      iconFrom: '#a78bfa',
      iconTo: '#4c1d95',
      iconRing: 'rgba(167,139,250,0.5)',
      iconGlow: 'rgba(153,69,255,0.3)',
    },
    {
      id: 'grinder',
      name: '+2K Daily Energy',
      type: 'Power',
      rarity: 'Rare',
      boost: '+2,000 daily max energy (3,000 total)',
      duration: '7 Days',
      price: 0.01,
      currency: 'SOL',
      iconFrom: '#60a5fa',
      iconTo: '#1e3a8a',
      iconRing: 'rgba(96,165,250,0.45)',
      iconGlow: 'rgba(59,130,246,0.25)',
    },
    {
      id: 'whale',
      name: '+5K Daily Energy',
      type: 'Power',
      rarity: 'Legendary',
      boost: '+5,000 daily max energy (6,000 total)',
      duration: '7 Days',
      price: 0.03,
      currency: 'SOL',
      iconFrom: '#38bdf8',
      iconTo: '#0c4a6e',
      iconRing: 'rgba(56,189,248,0.5)',
      iconGlow: 'rgba(14,165,233,0.3)',
    },
    {
      id: 'x2_boost',
      name: 'Double Power',
      type: 'Power',
      rarity: 'Epic',
      boost: '2x Shards',
      duration: '7 Days',
      price: 0.02,
      currency: 'SOL',
      iconFrom: '#fb7185',
      iconTo: '#9f1239',
      iconRing: 'rgba(251,113,133,0.45)',
      iconGlow: 'rgba(244,63,94,0.25)',
    },
    {
      id: 'x3_boost',
      name: 'Triple Power',
      type: 'Power',
      rarity: 'Legendary',
      boost: '3x Shards',
      duration: '7 Days',
      price: 0.035,
      currency: 'SOL',
      iconFrom: '#c084fc',
      iconTo: '#5b21b6',
      iconRing: 'rgba(192,132,252,0.55)',
      iconGlow: 'rgba(168,85,247,0.35)',
    },
    {
      id: 'expanded_energy',
      name: 'Expanded Battery',
      type: 'Power',
      rarity: 'Epic',
      boost: 'Battery 500 → 1000 for 7 days',
      duration: '7 Days',
      price: 0.01,
      /** Fixed G2U price (was 0.01 × 5M = 50_000) */
      priceG2uFixed: 10_000,
      currency: 'SOL',
      iconFrom: '#4ade80',
      iconTo: '#166534',
      iconRing: 'rgba(74,222,128,0.5)',
      iconGlow: 'rgba(34,197,94,0.3)',
    },
    {
      id: 'refill_extra',
      name: 'Extra Battery Refill',
      type: 'Power',
      rarity: 'Rare',
      boost: 'Fills 500 to your Battery · use anytime (no free-day lock)',
      duration: 'Instant',
      price: 0.0002,
      currency: 'SOL',
      iconFrom: '#4ade80',
      iconTo: '#14532d',
      iconRing: 'rgba(74,222,128,0.5)',
      iconGlow: 'rgba(34,197,94,0.3)',
    },
    {
      id: 'frenzy_60',
      name: '60-Second Frenzy',
      type: 'Power',
      rarity: 'Epic',
      boost: '2× shards per energy for 60 seconds',
      duration: '60 Seconds · 1× / UTC day',
      price: 3500 / G2U_PER_SOL,
      priceG2uFixed: 3500,
      currency: 'SOL',
      iconFrom: '#ff6b35',
      iconTo: '#7c1d12',
      iconRing: 'rgba(255,107,53,0.55)',
      iconGlow: 'rgba(255,107,53,0.3)',
    },
    {
      id: 'daily_plus_1000',
      name: '+1000 Max Daily',
      type: 'Power',
      rarity: 'Epic',
      boost: '+1,000 max daily taps (not battery) until UTC midnight',
      duration: 'Until UTC midnight · 1× / UTC day',
      price: 3500 / G2U_PER_SOL,
      priceG2uFixed: 3500,
      currency: 'SOL',
      iconFrom: '#60a5fa',
      iconTo: '#1e3a8a',
      iconRing: 'rgba(96,165,250,0.55)',
      iconGlow: 'rgba(59,130,246,0.3)',
    },
  ];

  const premiumListings = premiumListingsRaw.map((item) => {
    if (!G2U_PREMIUM) return item;
    const priceG2u =
      item.priceG2uFixed != null
        ? Math.round(Number(item.priceG2uFixed))
        : Math.round(Number(item.price) * G2U_PER_SOL);
    return {
      ...item,
      price: priceG2u,
      currency: 'G2U',
      priceSol: item.price,
    };
  });

  /** Separate NFT marketplace (on-chain mints) */
  const fateListings = ['common', 'rare', 'epic', 'legendary'].map((key) => {
    const c = FATE_CM[key];
    const live = fateCmReady && isFateMintLive(key);
    return {
      id: `fate_${key}`,
      fateRarity: key,
      name: `Fate · ${c.label}`,
      type: 'NFT',
      rarity: c.label,
      collection: 'Gift2u Elves',
      boost: 'Luck jackpot multi on tap G2Ushards',
      perks: [
        'Own in wallet = attributes on (highest Fate if several)',
        'Chance of jackpot multi on tap G2Ushards',
        'Rarity border · Star socket in Backpack (outside art)',
        live
          ? `Wave 1 live · ${c.priceSol} SOL`
          : 'Wave 1 candy machine — mint opens when live',
      ],
      level: 1,
      attributes: [
        { trait_type: 'Level', value: '1' },
        { trait_type: 'Collection', value: 'Gift2u Elves' },
        { trait_type: 'Class', value: 'Fate' },
        { trait_type: 'Role', value: 'Luck' },
        { trait_type: 'Generation', value: 'Gen 1' },
        { trait_type: 'Rarity', value: c.label },
        { trait_type: 'Type', value: 'Utility' },
        { trait_type: 'Utility', value: 'Tap jackpot (G2Ushards)' },
        { trait_type: 'Wave', value: '1 of 3' },
        { trait_type: 'Max Supply', value: String(c.maxSupply) },
        { trait_type: 'Wave 1 supply', value: String(c.itemsAvailable) },
      ],
      description: fateDescription(key),
      duration: `Permanent · Gen 1 · Wave 1 · ${c.itemsAvailable.toLocaleString()} supply`,
      price: c.priceSol,
      currency: 'SOL',
      image: '🍀',
      // Prefer local art (locked socket). Irys URI still used for on-chain mints.
      imageUrl: c.imageUrl || c.imageUri,
      supply: c.itemsAvailable,
      maxPerWallet: c.maxPerWallet || 5,
      feeBufferSol: c.feeBufferSol || 0.02,
      isNftMint: true,
      isFateMint: true,
      mintLive: live,
    };
  });

  const echoListings = ['common', 'rare', 'epic', 'legendary'].map((key) => {
    const c = ECHO_CM[key];
    const live = echoCmReady && isEchoMintLive(key);
    const multiL1 = ECHO_MULTI[key]?.[0];
    const multiL5 = ECHO_MULTI[key]?.[4];
    return {
      id: `echo_${key}`,
      echoRarity: key,
      name: `Echo · ${c.label}`,
      type: 'NFT',
      rarity: c.label,
      collection: 'Gift2u Elves',
      boost: `Tap multi ${multiL1}× → ${multiL5}×`,
      perks: [
        'Own in wallet = attributes on (highest Echo if several)',
        `Always-on tap multiplier ${multiL1}×–${multiL5}×`,
        'Rarity border · Star socket in Backpack (outside art)',
        live
          ? `Wave 1 live · ${c.priceSol} SOL`
          : 'Wave 1 candy machine — mint opens when live',
      ],
      level: 1,
      attributes: [
        { trait_type: 'Level', value: '1' },
        { trait_type: 'Collection', value: 'Gift2u Elves' },
        { trait_type: 'Class', value: 'Echo' },
        { trait_type: 'Role', value: 'Power' },
        { trait_type: 'Generation', value: 'Gen 1' },
        { trait_type: 'Rarity', value: c.label },
        { trait_type: 'Type', value: 'Utility' },
        { trait_type: 'Utility', value: 'Tap multiplier (G2Ushards)' },
        { trait_type: 'Wave', value: '1 of 3' },
        { trait_type: 'Max Supply', value: String(c.maxSupply) },
        { trait_type: 'Wave 1 supply', value: String(c.itemsAvailable) },
      ],
      description: echoDescription(key),
      duration: `Permanent · Gen 1 · Wave 1 · ${Number(c.itemsAvailable).toLocaleString()} supply`,
      price: c.priceSol,
      currency: 'SOL',
      image: '⚡',
      imageUrl: c.imageUrl || c.imageUri,
      supply: c.itemsAvailable,
      maxPerWallet: c.maxPerWallet || 5,
      feeBufferSol: c.feeBufferSol || 0.02,
      isNftMint: true,
      isEchoMint: true,
      mintLive: live,
    };
  });

  const rushListings = ['common', 'rare', 'epic', 'legendary'].map((key) => {
    const c = RUSH_CM[key];
    const live = rushCmReady && isRushMintLive(key);
    const limL1 = RUSH_DAILY_LIMIT[key]?.[0];
    const limL5 = RUSH_DAILY_LIMIT[key]?.[4];
    return {
      id: `rush_${key}`,
      rushRarity: key,
      name: `Rush · ${c.label}`,
      type: 'NFT',
      rarity: c.label,
      collection: 'Gift2u Elves',
      boost: `Daily cap ${Number(limL1).toLocaleString()} → ${Number(limL5).toLocaleString()}`,
      perks: [
        'Own in wallet = attributes on (highest Rush if several)',
        `Max daily taps ${Number(limL1).toLocaleString()}–${Number(limL5).toLocaleString()}`,
        'Expanded Battery & task boosts add on top',
        'Rarity border · Star socket in Backpack (outside art)',
        live
          ? `Wave 1 live · ${c.priceSol} SOL`
          : 'Wave 1 candy machine — mint opens when live',
      ],
      level: 1,
      attributes: [
        { trait_type: 'Level', value: '1' },
        { trait_type: 'Collection', value: 'Gift2u Elves' },
        { trait_type: 'Class', value: 'Rush' },
        { trait_type: 'Role', value: 'Energy' },
        { trait_type: 'Generation', value: 'Gen 1' },
        { trait_type: 'Rarity', value: c.label },
        { trait_type: 'Type', value: 'Utility' },
        { trait_type: 'Utility', value: 'Max daily taps' },
        { trait_type: 'Wave', value: '1 of 3' },
        { trait_type: 'Max Supply', value: String(c.maxSupply) },
        { trait_type: 'Wave 1 supply', value: String(c.itemsAvailable) },
      ],
      description: rushDescription(key),
      duration: `Permanent · Gen 1 · Wave 1 · ${Number(c.itemsAvailable).toLocaleString()} supply`,
      price: c.priceSol,
      currency: 'SOL',
      image: '🔋',
      imageUrl: c.imageUrl || c.imageUri,
      supply: c.itemsAvailable,
      maxPerWallet: c.maxPerWallet || 5,
      feeBufferSol: c.feeBufferSol || 0.02,
      isNftMint: true,
      isRushMint: true,
      mintLive: live,
    };
  });

  const shadowListings = ['common', 'rare', 'epic', 'legendary'].map((key) => {
    const c = SHADOW_CM[key];
    const live = shadowCmReady && isShadowMintLive(key);
    const h1 = SHADOW_HOURS[key]?.[0];
    const h5 = SHADOW_HOURS[key]?.[4];
    return {
      id: `shadow_${key}`,
      shadowRarity: key,
      name: `Shadow · ${c.label}`,
      type: 'NFT',
      rarity: c.label,
      collection: 'Gift2u Elves',
      boost: `${h1}h → ${h5}h daily claim (base cap)`,
      perks: [
        'Own in wallet = attributes on (highest Shadow if several)',
        `${h1}–${h5} hours of base daily cap (Rush or 1,000)`,
        'Claim once per UTC day · boosts not included',
        'Rarity border · Star socket in Backpack (outside art)',
        live
          ? `Wave 1 live · ${c.priceSol} SOL`
          : 'Wave 1 candy machine — mint opens when live',
      ],
      level: 1,
      attributes: [
        { trait_type: 'Level', value: '1' },
        { trait_type: 'Collection', value: 'Gift2u Elves' },
        { trait_type: 'Class', value: 'Shadow' },
        { trait_type: 'Role', value: 'Night' },
        { trait_type: 'Generation', value: 'Gen 1' },
        { trait_type: 'Rarity', value: c.label },
        { trait_type: 'Type', value: 'Utility' },
        { trait_type: 'Utility', value: 'Daily claim share of base daily cap' },
        { trait_type: 'Wave', value: '1 of 3' },
        { trait_type: 'Max Supply', value: String(c.maxSupply) },
        { trait_type: 'Wave 1 supply', value: String(c.itemsAvailable) },
      ],
      description: shadowDescription(key),
      duration: `Permanent · Gen 1 · Wave 1 · ${Number(c.itemsAvailable).toLocaleString()} supply`,
      price: c.priceSol,
      currency: 'SOL',
      image: '🌑',
      // Prefer local art (locked socket). Irys URI still used for on-chain mints.
      imageUrl: c.imageUrl || c.imageUri,
      supply: c.itemsAvailable,
      maxPerWallet: c.maxPerWallet || 5,
      feeBufferSol: c.feeBufferSol || 0.02,
      isNftMint: true,
      isShadowMint: true,
      mintLive: live,
    };
  });

  const starLive = starCmReady && isStarMintLive();
  const nftListings = [
    ...(starLive
      ? [
          {
            id: 'star_badge',
            name: 'Star Badge',
            type: 'NFT',
            rarity: 'Special',
            collection: 'Gift2u Elves',
            boost: '',
            perks: [],
            level: 1,
            attributes: [
              { trait_type: 'Level', value: '1' },
              { trait_type: 'Collection', value: 'Gift2u Elves' },
              { trait_type: 'Class', value: 'Star Badge' },
              { trait_type: 'Generation', value: 'Gen 1' },
              { trait_type: 'Utility', value: 'Elf socket (external)' },
              { trait_type: 'Mint', value: `${STAR_WAVE1.priceSol} SOL` },
              {
                trait_type: 'Max / wallet',
                value: String(STAR_WAVE1.maxPerWallet),
              },
            ],
            duration: 'Permanent · open mint',
            price: STAR_WAVE1.priceSol,
            currency: 'SOL',
            image: '⭐',
            imageUrl: STAR_WAVE1.imageUri || STAR_WAVE1.imageUrl,
            supply: STAR_WAVE1.itemsAvailable,
            maxPerWallet: STAR_WAVE1.maxPerWallet,
            feeBufferSol: STAR_WAVE1.feeBufferSol,
            isNftMint: true,
            isStarMint: true,
            mintLive: true,
          },
        ]
      : []),
    {
      id: 'locksmith',
      name: 'GiftLocksmith',
      type: 'NFT',
      rarity: 'Rare',
      collection: 'Gift2u Elves',
      boost: 'Free wall climbs + Walk2u Common Shoe (early walls)',
      perks: [
        'L1: free climb → Level 5 + Common Walk2u Shoe',
        'L2 / L3: free → Level 10 / 20 + Common Shoe',
        'Higher levels unlock later walls as they open',
        'Opens the path to Walk2u',
      ],
      level: 1,
      attributes: [
        { trait_type: 'Level', value: '1' },
        { trait_type: 'Collection', value: 'Gift2u Elves' },
        { trait_type: 'Class', value: 'GiftLocksmith' },
        { trait_type: 'Generation', value: 'Gen 1' },
        { trait_type: 'Rarity', value: 'Rare' },
        { trait_type: 'Wave', value: '1 of 3' },
        { trait_type: 'Utility', value: 'Free walls · Walk2u shoe' },
        { trait_type: 'Max supply', value: String(LOCKSMITH_WAVE1.itemsAvailable) },
        { trait_type: 'Max / wallet', value: String(LOCKSMITH_WAVE1.maxPerWallet) },
      ],
      duration: 'Permanent · Gen 1 · Wave 1 of 3',
      price: LOCKSMITH_WAVE1.priceSol,
      currency: 'SOL',
      image: '🔑',
      imageUrl: LOCKSMITH_WAVE1.imageUri,
      supply: LOCKSMITH_WAVE1.itemsAvailable,
      maxPerWallet: LOCKSMITH_WAVE1.maxPerWallet,
      feeBufferSol: LOCKSMITH_WAVE1.feeBufferSol,
      isNftMint: true,
      isFateMint: false,
      mintLive: true,
    },
    ...fateListings,
    ...echoListings,
    ...rushListings,
    ...shadowListings,
  ];

  const filteredNftListings = filterAndSortNfts(nftListings, {
    rarity: nftRarityFilter,
    role: nftRoleFilter,
    level: nftLevelFilter,
    sort: nftSort,
  });

  const allItems = [...shardListings, ...premiumListings];
  const filteredListings = premiumListings.filter(item => marketFilter === 'All' || item.type === marketFilter);

  // --- 1. BUYING WITH SHARDS (Goes to Backpack) ---
  const handleShardBuy = async (item) => {
    const cost = Number(item.cost) || 0;
    const have = Number(balance) || 0;
    if (have < cost) {
      setTxStatus({ show: true, loading: false, message: "❌ Not enough Shards!", success: false });
      return;
    }

    setTxStatus({ show: true, loading: true, message: `Purchasing ${item.name}...`, success: false });

    try {
      try {
        await ensureSecureSession();
      } catch {
        /* ignore */
      }
      // Server buy when JWT present (client cannot mint refill into inventory under protect)
      if (hasSecureSession()) {
        const data = await secureShopBuy(item.id);
        const nextBalance = Number(data.shard_balance);
        const newInventory = data.inventory || {};
        setBalance(nextBalance);
        // Add purchased item into existing backpack — never replace whole inventory
        setLocalInventory((prev) => addToBackpackInventory(prev, newInventory));
        if (setStats) {
          setStats((prev) => ({
            ...prev,
            inventory: addToBackpackInventory(prev?.inventory || {}, newInventory),
          }));
        }
        setTxStatus({
          show: true,
          loading: false,
          message: `✅ ${item.name} added to Backpack! (−${cost.toLocaleString()} G2Ushards)`,
          success: true,
        });
        setTimeout(() => setTxStatus((prev) => ({ ...prev, show: false })), 2000);
        return;
      }

      // No JWT → do not legacy-write (esp. refill energy). Forces secure path.
      setTxStatus({
        show: true,
        loading: false,
        message: 'Session expired — log in again, then buy. (Keeps battery in sync.)',
        success: false,
      });
      return;

      // Legacy client write (disabled under hard security)
      const newInventory = buildFullInventory({
        [item.id]: (Number(localInventory[item.id]) || 0) + 1,
      });
      newInventory.weekly_quests = applyWeeklyBoostBuy(
        newInventory.weekly_quests || stats?.inventory?.weekly_quests,
        getUtcWeekId(),
      );
      const nextBalance = Math.max(0, Math.round((have - cost) * 1000) / 1000);

      const { error } = await supabase
        .from('players')
        .update({ shard_balance: nextBalance, inventory: newInventory })
        .eq(DB_PLAYER_ID, String(user.id));
      if (error) throw error;

      setBalance(nextBalance);
      setLocalInventory(newInventory);
      if (setStats) {
        setStats((prev) => ({
          ...prev,
          ...stats,
          inventory: applyServerInventoryAuthority(
            prev?.inventory || {},
            newInventory,
            getUtcWeekId(),
          ),
        }));
      }

      setTxStatus({
        show: true,
        loading: false,
        message: `✅ ${item.name} added to Backpack! (−${cost.toLocaleString()} G2Ushards)`,
        success: true,
      });
      setTimeout(() => setTxStatus((prev) => ({ ...prev, show: false })), 2000);
    } catch (err) {
      console.error('Purchase Error:', err?.message || err);
      setTxStatus({
        show: true,
        loading: false,
        message: `❌ ${err?.message || 'Failed to process purchase.'}`,
        success: false,
      });
    }
  };

  /** Mint GiftLocksmith Wave 1 from Core Candy Machine (0.25 SOL). */
  /** Mint Star Badge Wave 1 (0.10 SOL) — only when CM live. */
  const handleStarMint = async () => {
    if (!decryptedPhrase) {
      setTxStatus({
        show: true,
        loading: false,
        message: '❌ Game wallet key missing after login. Log out, log in once with your password, then mint.',
        success: false,
      });
      return;
    }
    if (!isStarMintLive()) {
      setTxStatus({
        show: true,
        loading: false,
        message: '❌ Star Badge mint is not live yet.',
        success: false,
      });
      return;
    }
    if (!canAffordStarMint) {
      const have =
        walletSol != null && Number.isFinite(walletSol)
          ? walletSol.toFixed(4)
          : 'unknown';
      setTxStatus({
        show: true,
        loading: false,
        message: `Not enough SOL. Need ${minSolForStarMint().toFixed(2)} SOL (mint + fees). You have ${have} SOL.`,
        success: false,
      });
      return;
    }

    setTxStatus({
      show: true,
      loading: true,
      message: 'Checking game wallet SOL balance…',
      success: false,
    });

    try {
      let signerAddress;
      try {
        signerAddress = publicKeyFromSecret(decryptedPhrase);
      } catch {
        signerAddress = playerWallet ? String(playerWallet) : null;
      }
      if (!signerAddress) throw new Error('No game wallet found on this account.');

      const { sol } = await assertWalletCanMintStar(signerAddress);
      applyWalletSol(sol);

      setTxStatus({
        show: true,
        loading: true,
        message: `Minting Star Badge for ${STAR_WAVE1.priceSol} SOL…`,
        success: false,
      });

      const result = await mintStarWave1(decryptedPhrase);

      try {
        const after = await getWalletSolBalance(signerAddress);
        applyWalletSol(after);
      } catch {
        /* ignore */
      }

      setTxStatus({
        show: true,
        loading: false,
        message: `✅ Star Badge minted!\nAsset: ${result.asset.slice(0, 8)}…\nOpen Backpack → NFT to socket it.`,
        success: true,
      });
      invalidateGiftNftListCache(playerWallet);
      invalidateOwnershipSyncThrottle(playerWallet);
      setWalletNftRefresh((n) => n + 1);
    } catch (err) {
      console.error('Star mint error', err);
      const msg = err?.message || String(err);
      try {
        const addr =
          (decryptedPhrase && publicKeyFromSecret(decryptedPhrase)) ||
          playerWallet;
        if (addr) {
          const sol = await getWalletSolBalance(String(addr));
          applyWalletSol(sol);
        }
      } catch {
        /* ignore */
      }
      setTxStatus({
        show: true,
        loading: false,
        message: `❌ Mint blocked: ${msg}`,
        success: false,
      });
    }
  };

  const handleLocksmithMint = async () => {
    // Block before any status that looks like a live mint — no SOL = no network call
    if (!decryptedPhrase) {
      setTxStatus({
        show: true,
        loading: false,
        message: '❌ Game wallet key missing after login. Log out, log in once with your password, then mint.',
        success: false,
      });
      return;
    }

    // UI gate: never open mint path if we already know balance is short
    if (!canAffordLocksmithMint) {
      const have =
        walletSol != null && Number.isFinite(walletSol)
          ? walletSol.toFixed(4)
          : 'unknown';
      setTxStatus({
        show: true,
        loading: false,
        message: `Not enough SOL. Need ${minMintSol.toFixed(2)} SOL (mint + fees). You have ${have} SOL — buy more SOL for your game wallet.`,
        success: false,
      });
      return;
    }

    setTxStatus({
      show: true,
      loading: true,
      message: 'Checking game wallet SOL balance…',
      success: false,
    });

    try {
      // Always check the SIGNING wallet (from unlocked phrase), not only playerWallet prop
      let signerAddress;
      try {
        signerAddress = publicKeyFromSecret(decryptedPhrase);
      } catch {
        signerAddress = playerWallet ? String(playerWallet) : null;
      }
      if (!signerAddress) {
        throw new Error('No game wallet found on this account.');
      }

      const { sol } = await assertWalletCanMintLocksmith(signerAddress);
      applyWalletSol(sol);

      setTxStatus({
        show: true,
        loading: true,
        message: `Minting GiftLocksmith for ${LOCKSMITH_WAVE1.priceSol} SOL…`,
        success: false,
      });

      // mintLocksmithWave1 re-checks balance on the real signer before any network submit
      const result = await mintLocksmithWave1(decryptedPhrase);

      // Refresh balance after successful mint
      try {
        const after = await getWalletSolBalance(signerAddress);
        applyWalletSol(after);
      } catch {
        /* ignore */
      }

      setTxStatus({
        show: true,
        loading: false,
        message: `✅ GiftLocksmith minted!\nAsset: ${result.asset.slice(0, 8)}…\nOpen Pack → NFT to see it.`,
        success: true,
      });
      invalidateGiftNftListCache(playerWallet);
      invalidateOwnershipSyncThrottle(playerWallet);
      setWalletNftRefresh((n) => n + 1);
    } catch (err) {
      console.error('Locksmith mint error', err);
      const msg = err?.message || String(err);
      // Refresh shown balance so UI stays honest after a fail
      try {
        const addr =
          (decryptedPhrase && publicKeyFromSecret(decryptedPhrase)) ||
          playerWallet;
        if (addr) {
          const sol = await getWalletSolBalance(String(addr));
          applyWalletSol(sol);
        }
      } catch {
        /* ignore */
      }
      setTxStatus({
        show: true,
        loading: false,
        message: `❌ Mint blocked: ${msg}`,
        success: false,
      });
    }
  };

  /** Mint Fate Wave 1 for a rarity (common|rare|epic|legendary). */
  const handleFateMint = async (rarityKey) => {
    const cfg = FATE_CM[rarityKey];
    const label = cfg?.label || rarityKey;
    if (!decryptedPhrase) {
      setTxStatus({
        show: true,
        loading: false,
        message: '❌ Game wallet key missing after login. Log out, log in once with your password, then mint.',
        success: false,
      });
      return;
    }
    if (!isFateMintLive(rarityKey)) {
      setTxStatus({
        show: true,
        loading: false,
        message: `Fate ${label} Wave 1 is listed but the candy machine is not live yet. Check back soon.`,
        success: false,
      });
      return;
    }
    if (!canAffordFate(rarityKey)) {
      const need = minSolForFateMint(rarityKey);
      const have =
        walletSol != null && Number.isFinite(walletSol)
          ? walletSol.toFixed(4)
          : 'unknown';
      setTxStatus({
        show: true,
        loading: false,
        message: `Not enough SOL. Need ${need.toFixed(2)} SOL for Fate ${label}. You have ${have} SOL — buy more SOL for your game wallet.`,
        success: false,
      });
      return;
    }

    setTxStatus({
      show: true,
      loading: true,
      message: `Checking game wallet SOL…`,
      success: false,
    });

    try {
      let signerAddress;
      try {
        signerAddress = publicKeyFromSecret(decryptedPhrase);
      } catch {
        signerAddress = playerWallet ? String(playerWallet) : null;
      }
      if (!signerAddress) throw new Error('No game wallet found on this account.');

      await assertWalletCanMintFate(signerAddress, rarityKey);
      setTxStatus({
        show: true,
        loading: true,
        message: `Minting Fate ${label} for ${cfg.priceSol} SOL…`,
        success: false,
      });
            const result = await mintFateWave1(decryptedPhrase, rarityKey);
      try {
        applyWalletSol(await getWalletSolBalance(signerAddress));
      } catch {
        /* ignore */
      }
      try {
        const act = await secureFateActivate({
          rarity: rarityKey,
          level: 1,
          assetId: result.asset,
        });
        if (act?.inventory) {
          setLocalInventory((prev) => addToBackpackInventory(prev, act.inventory));
          if (setStats) {
            setStats((prev) => ({
              ...prev,
              inventory: addToBackpackInventory(prev?.inventory || {}, act.inventory),
              ...(act.tap_power != null ? { tap_power: act.tap_power } : {}),
              ...(act.max_daily_limit != null
                ? { max_daily_limit: act.max_daily_limit }
                : {}),
            }));
          }
        }
      } catch (e) {
        console.warn('fate activate after mint', e?.message || e);
      }
      setTxStatus({
        show: true,
        loading: false,
        message: `✅ Fate ${label} minted!
Asset: ${String(result.asset).slice(0, 8)}…
Luck jackpot active · Pack → NFT to see it.`,
        success: true,
      });
      invalidateGiftNftListCache(playerWallet);
      invalidateOwnershipSyncThrottle(playerWallet);
      setWalletNftRefresh((n) => n + 1);
    } catch (err) {
      console.error('Fate mint error', err);
      try {
        const addr =
          (decryptedPhrase && publicKeyFromSecret(decryptedPhrase)) || playerWallet;
        if (addr) applyWalletSol(await getWalletSolBalance(String(addr)));
      } catch {
        /* ignore */
      }
      setTxStatus({
        show: true,
        loading: false,
        message: `❌ Mint blocked: ${err?.message || String(err)}`,
        success: false,
      });
    }
  };

  /** Mint Echo Wave 1 for a rarity (common|rare|epic|legendary). */
  const handleEchoMint = async (rarityKey) => {
    const cfg = ECHO_CM[rarityKey];
    const label = cfg?.label || rarityKey;
    if (!decryptedPhrase) {
      setTxStatus({
        show: true,
        loading: false,
        message: 'Game wallet key missing after login. Log out, log in once with your password, then mint.',
        success: false,
      });
      return;
    }
    if (!isEchoMintLive(rarityKey)) {
      setTxStatus({
        show: true,
        loading: false,
        message: `Echo ${label} Wave 1 is listed but the candy machine is not live yet. Check back soon.`,
        success: false,
      });
      return;
    }
    if (!canAffordEcho(rarityKey)) {
      const need = minSolForEchoMint(rarityKey);
      const have =
        walletSol != null && Number.isFinite(walletSol)
          ? walletSol.toFixed(4)
          : 'unknown';
      setTxStatus({
        show: true,
        loading: false,
        message: `Not enough SOL. Need ${need.toFixed(2)} SOL for Echo ${label}. You have ${have} SOL — buy more SOL for your game wallet.`,
        success: false,
      });
      return;
    }

    setTxStatus({
      show: true,
      loading: true,
      message: `Checking game wallet SOL…`,
      success: false,
    });

    try {
      let signerAddress;
      try {
        signerAddress = publicKeyFromSecret(decryptedPhrase);
      } catch {
        signerAddress = playerWallet ? String(playerWallet) : null;
      }
      if (!signerAddress) throw new Error('No game wallet found on this account.');
      await assertWalletCanMintEcho(signerAddress, rarityKey);
      setTxStatus({
        show: true,
        loading: true,
        message: `Minting Echo ${label} for ${cfg.priceSol} SOL…`,
        success: false,
      });
            const result = await mintEchoWave1(decryptedPhrase, rarityKey);
      try {
        const after = await getWalletSolBalance(signerAddress);
        applyWalletSol(after);
      } catch {
        /* ignore */
      }
      // Auto-activate Echo so tap multi applies immediately
      try {
        const act = await secureEchoActivate({
          rarity: rarityKey,
          level: 1,
          assetId: result.asset,
        });
        if (act?.inventory) {
          setLocalInventory((prev) => addToBackpackInventory(prev, act.inventory));
          if (setStats) {
            setStats((prev) => ({
              ...prev,
              inventory: addToBackpackInventory(prev?.inventory || {}, act.inventory),
              ...(act.tap_power != null ? { tap_power: act.tap_power } : {}),
              ...(act.max_daily_limit != null
                ? { max_daily_limit: act.max_daily_limit }
                : {}),
            }));
          }
        }
      } catch (e) {
        console.warn('echo activate after mint', e?.message || e);
      }
      setTxStatus({
        show: true,
        loading: false,
        message: `✅ Echo ${label} minted!
Asset: ${String(result.asset).slice(0, 8)}…
Tap multi active · Pack → NFT to see it.`,
        success: true,
      });
      invalidateGiftNftListCache(playerWallet);
      invalidateOwnershipSyncThrottle(playerWallet);
      setWalletNftRefresh((n) => n + 1);
    } catch (err) {
      console.error('Echo mint error', err);
      setTxStatus({
        show: true,
        loading: false,
        message: `❌ Mint blocked: ${err?.message || String(err)}`,
        success: false,
      });
    }
  };

  const handleRushMint = async (rarityKey) => {
    const cfg = RUSH_CM[rarityKey];
    const label = cfg?.label || rarityKey;
    if (!decryptedPhrase) {
      setTxStatus({
        show: true,
        loading: false,
        message:
          'Game wallet key missing after login. Log out, log in once with your password, then mint.',
        success: false,
      });
      return;
    }
    if (!isRushMintLive(rarityKey)) {
      setTxStatus({
        show: true,
        loading: false,
        message: `Rush ${label} Wave 1 is listed but the candy machine is not live yet. Check back soon.`,
        success: false,
      });
      return;
    }
    if (!canAffordRush(rarityKey)) {
      const need = minSolForRushMint(rarityKey);
      const have =
        walletSol != null && Number.isFinite(walletSol)
          ? walletSol.toFixed(4)
          : 'unknown';
      setTxStatus({
        show: true,
        loading: false,
        message: `Not enough SOL. Need ${need.toFixed(2)} SOL for Rush ${label}. You have ${have} SOL — buy more SOL for your game wallet.`,
        success: false,
      });
      return;
    }
    setTxStatus({ show: true, loading: true, message: 'Checking game wallet SOL…', success: false });
    try {
      let signerAddress;
      try {
        signerAddress = publicKeyFromSecret(decryptedPhrase);
      } catch {
        signerAddress = playerWallet ? String(playerWallet) : null;
      }
      if (!signerAddress) throw new Error('No game wallet found on this account.');
      await assertWalletCanMintRush(signerAddress, rarityKey);
      setTxStatus({
        show: true,
        loading: true,
        message: `Minting Rush ${label} for ${cfg.priceSol} SOL…`,
        success: false,
      });
      const result = await mintRushWave1(decryptedPhrase, rarityKey);
      try {
        const after = await getWalletSolBalance(signerAddress);
        applyWalletSol(after);
      } catch { /* ignore */ }
      try {
        const act = await secureRushActivate({
          rarity: rarityKey,
          level: 1,
          assetId: result.asset,
        });
        if (act?.inventory) {
          setLocalInventory((prev) => addToBackpackInventory(prev, act.inventory));
          if (setStats) {
            setStats((prev) => ({
              ...prev,
              inventory: addToBackpackInventory(prev?.inventory || {}, act.inventory),
              ...(act.tap_power != null ? { tap_power: act.tap_power } : {}),
              ...(act.max_daily_limit != null
                ? { max_daily_limit: act.max_daily_limit }
                : {}),
            }));
          }
        }
      } catch (e) {
        console.warn('rush activate after mint', e?.message || e);
      }
      setTxStatus({
        show: true,
        loading: false,
        message: `✅ Rush ${label} minted!
Asset: ${String(result.asset).slice(0, 8)}…
Daily cap active · Pack → NFT to see it.`,
        success: true,
      });
      invalidateGiftNftListCache(playerWallet);
      invalidateOwnershipSyncThrottle(playerWallet);
      setWalletNftRefresh((n) => n + 1);
    } catch (err) {
      console.error('Rush mint error', err);
      setTxStatus({
        show: true,
        loading: false,
        message: `❌ Mint blocked: ${err?.message || String(err)}`,
        success: false,
      });
    }
  };

  const handleShadowMint = async (rarityKey) => {
    const cfg = SHADOW_CM[rarityKey];
    const label = cfg?.label || rarityKey;
    if (!decryptedPhrase) {
      setTxStatus({
        show: true,
        loading: false,
        message: 'Game wallet key missing after login. Log out, log in once with your password, then mint.',
        success: false,
      });
      return;
    }
    if (!isShadowMintLive(rarityKey)) {
      setTxStatus({
        show: true,
        loading: false,
        message: `Shadow ${label} Wave 1 is listed but the candy machine is not live yet. Check back soon.`,
        success: false,
      });
      return;
    }
    if (!canAffordShadow(rarityKey)) {
      const need = minSolForShadowMint(rarityKey);
      const have =
        walletSol != null && Number.isFinite(walletSol)
          ? walletSol.toFixed(4)
          : 'unknown';
      setTxStatus({
        show: true,
        loading: false,
        message: `Not enough SOL. Need ${need.toFixed(2)} SOL for Shadow ${label}. You have ${have} SOL — buy more SOL for your game wallet.`,
        success: false,
      });
      return;
    }
    setTxStatus({ show: true, loading: true, message: 'Checking game wallet SOL…', success: false });
    try {
      let signerAddress;
      try {
        signerAddress = publicKeyFromSecret(decryptedPhrase);
      } catch {
        signerAddress = playerWallet ? String(playerWallet) : null;
      }
      if (!signerAddress) throw new Error('No game wallet found on this account.');
      await assertWalletCanMintShadow(signerAddress, rarityKey);
      setTxStatus({
        show: true,
        loading: true,
        message: `Minting Shadow ${label} for ${cfg.priceSol} SOL…`,
        success: false,
      });
      const result = await mintShadowWave1(decryptedPhrase, rarityKey);
      try {
        const after = await getWalletSolBalance(signerAddress);
        applyWalletSol(after);
      } catch { /* ignore */ }
      try {
        const act = await secureShadowActivate({
          rarity: rarityKey,
          level: 1,
          assetId: result.asset,
        });
        if (act?.inventory) {
          setLocalInventory((prev) => addToBackpackInventory(prev, act.inventory));
          if (setStats) {
            setStats((prev) => ({
              ...prev,
              inventory: addToBackpackInventory(prev?.inventory || {}, act.inventory),
              ...(act.tap_power != null ? { tap_power: act.tap_power } : {}),
              ...(act.max_daily_limit != null
                ? { max_daily_limit: act.max_daily_limit }
                : {}),
            }));
          }
        }
      } catch (e) {
        console.warn('shadow activate after mint', e?.message || e);
      }
      setTxStatus({
        show: true,
        loading: false,
        message: `✅ Shadow ${label} minted!
Asset: ${String(result.asset).slice(0, 8)}…
Daily claim active · Pack → NFT to see it.`,
        success: true,
      });
      invalidateGiftNftListCache(playerWallet);
      invalidateOwnershipSyncThrottle(playerWallet);
      setWalletNftRefresh((n) => n + 1);
    } catch (err) {
      console.error('Shadow mint error', err);
      setTxStatus({
        show: true,
        loading: false,
        message: `❌ Mint blocked: ${err?.message || String(err)}`,
        success: false,
      });
    }
  };

  const handlePremiumBuy = async (item) => {
    if (item?.isFateMint || String(item?.id || '').startsWith('fate_')) {
      return handleFateMint(item.fateRarity || 'common');
    }
    if (item?.isEchoMint || String(item?.id || '').startsWith('echo_')) {
      return handleEchoMint(item.echoRarity || 'common');
    }
    if (item?.isRushMint || String(item?.id || '').startsWith('rush_')) {
      return handleRushMint(item.rushRarity || 'common');
    }
    if (item?.isShadowMint || String(item?.id || '').startsWith('shadow_')) {
      return handleShadowMint(item.shadowRarity || 'common');
    }
    if (item?.isStarMint || item?.id === 'star_badge') {
      return handleStarMint();
    }
    if (item?.isNftMint || item?.id === 'locksmith') {
      return handleLocksmithMint();
    }


    // Open the pop-up immediately in a loading state
    setTxStatus({ show: true, loading: true, message: `Initiating purchase for ${item.name}...`, success: false });

    try {
      // Post-launch Premium: all $G2U buys are on-chain A→B (player → master), then grant.
      const payG2uOnChain =
        String(item.currency || '').toUpperCase() === 'G2U' ||
        (G2U_PREMIUM &&
          [
            'bot',
            'grinder',
            'whale',
            'crate',
            'x2_boost',
            'x3_boost',
            'expanded_energy',
            'refill_extra',
            'shard_badge',
          ].includes(String(item.id || '')));

      // 1. Get Secret Key (Now pulling securely from React State, not local storage)
      const storedSecret = decryptedPhrase;
      if (!storedSecret) {
        throw new Error("Secret key not found. Please unlock your wallet in settings.");
      }

      // 2. Setup Connection & Keypair
      const connection = new Connection(RPC_URL, 'confirmed');
      
      let playerKeypair;
      if (storedSecret.includes(" ")) {
        playerKeypair = keypairFromMnemonic(storedSecret.trim());
      } else {
        playerKeypair = Keypair.fromSecretKey(bs58.decode(storedSecret));
      }
      console.log("✅ Expected Wallet (Database):", playerWallet);
      console.log("❌ Derived Wallet (Transaction):", playerKeypair.publicKey.toString());

      // 3. Set Destination Wallets & Costs
      const masterWallet = new PublicKey("D4GufPTvp6tnzkaYGfombFLs48UjDANsxjMFJnSYz4Gh"); 
      const treasuryWallet = new PublicKey("8G7uEcPS6dwA5wW9bGoqi98EzBunF8trjbbFJkgkvBPm"); 

      // —— Premium $G2U: SPL transfer player → master, then Edge grant ——
      if (payG2uOnChain) {
        if (!hasSecureSession()) {
          throw new Error('Log in again to buy with $G2U (secure session required).');
        }
        if (
          playerWallet &&
          playerKeypair.publicKey.toBase58() !== String(playerWallet).trim()
        ) {
          throw new Error('Unlocked wallet does not match your game wallet');
        }
        const priceG2u = Math.max(1, Math.round(Number(item.price) || 0));
        const G2U_DECIMALS = 9;
        const amountRaw = BigInt(priceG2u) * 10n ** BigInt(G2U_DECIMALS);
        const fromAta = getAssociatedTokenAddressSync(
          MINT_ADDRESS,
          playerKeypair.publicKey,
        );
        const toAta = getAssociatedTokenAddressSync(MINT_ADDRESS, masterWallet);

        const solBal = await connection.getBalance(playerKeypair.publicKey);
        if (solBal < 5_000_000) {
          throw new Error(
            'Need a little SOL in your game wallet for the network fee (~0.005 SOL).',
          );
        }

        setTxStatus({
          show: true,
          loading: true,
          message: `🔗 Sending ${priceG2u.toLocaleString()} $G2U to master wallet…`,
          success: false,
        });

        const g2uTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
          createAssociatedTokenAccountIdempotentInstruction(
            playerKeypair.publicKey,
            toAta,
            masterWallet,
            MINT_ADDRESS,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
          ),
          createTransferCheckedInstruction(
            fromAta,
            MINT_ADDRESS,
            toAta,
            playerKeypair.publicKey,
            amountRaw,
            G2U_DECIMALS,
          ),
        );
        const latestG2u = await connection.getLatestBlockhash('confirmed');
        g2uTx.recentBlockhash = latestG2u.blockhash;
        g2uTx.feePayer = playerKeypair.publicKey;

        const g2uSig = await sendAndConfirmTransaction(connection, g2uTx, [
          playerKeypair,
        ]);

        const data = await securePremiumGrant(item.id, g2uSig, {
          currency: 'g2u',
        });
        const newInventory = data.inventory || {};
        setLocalInventory((prev) => addToBackpackInventory(prev, newInventory));
        if (setStats) {
          setStats((prev) => ({
            ...prev,
            inventory: addToBackpackInventory(
              prev?.inventory || {},
              newInventory,
            ),
            has_made_purchase: true,
          }));
        }
        if (typeof onChainBalanceChange === 'function') {
          try {
            await onChainBalanceChange();
          } catch {
            /* ignore */
          }
        }
        setTxStatus({
          show: true,
          loading: false,
          message: `✅ Sent ${priceG2u.toLocaleString()} $G2U → master. ${item.name} is in your Backpack!`,
          success: true,
        });
        setTimeout(() => setTxStatus((prev) => ({ ...prev, show: false })), 3000);
        return;
      }

      const itemPriceLamports = Math.floor(item.price * 1e9);
      const projectFeeLamports = Math.floor(0.0005 * 1e9); 
      const totalRequired = itemPriceLamports + projectFeeLamports + 1000000; 

      // 4. Check Balance
      const currentBalance = await connection.getBalance(playerKeypair.publicKey);
      if (currentBalance < totalRequired) {
        throw new Error(`Insufficient SOL. You need at least ${(totalRequired / 1e9).toFixed(4)} SOL to cover the item and network fees.`);
      }

      setTxStatus({ show: true, loading: true, message: `🔗 Confirming payment of ${item.price} SOL on Solana...`, success: false });

      // 5. Build Split Transaction
      const transaction = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }),
        SystemProgram.transfer({
          fromPubkey: playerKeypair.publicKey,
          toPubkey: masterWallet,
          lamports: itemPriceLamports,
        }),
        SystemProgram.transfer({
          fromPubkey: playerKeypair.publicKey,
          toPubkey: treasuryWallet,
          lamports: projectFeeLamports,
        })
      );

      const latestBlockhash = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = latestBlockhash.blockhash;
      transaction.feePayer = playerKeypair.publicKey;

      // 6. Send and Confirm
      const signature = await sendAndConfirmTransaction(connection, transaction, [playerKeypair]);

      // Hard security: server grants item after SOL payment signature
      if (hasSecureSession()) {
        const data = await securePremiumGrant(item.id, signature);
        const newInventory = data.inventory || {};
        setLocalInventory((prev) => addToBackpackInventory(prev, newInventory));
        if (setStats) {
          setStats((prev) => ({
            ...prev,
            inventory: addToBackpackInventory(prev?.inventory || {}, newInventory),
            has_made_purchase: true,
          }));
        }
        try {
          const after = await connection.getBalance(playerKeypair.publicKey);
          applyWalletSol(after / 1e9);
        } catch {
          await refreshWalletSol(playerKeypair.publicKey.toString());
        }
        setTxStatus({
          show: true,
          loading: false,
          message: `✅ Success! ${item.name} purchased. Check Backpack!`,
          success: true,
        });
        setTimeout(() => setTxStatus((prev) => ({ ...prev, show: false })), 3000);
        return;
      }

      // Legacy client grant
      const newInventory = { ...localInventory };
      newInventory[item.id] = (newInventory[item.id] || 0) + 1;
      newInventory.weekly_quests = applyWeeklyBoostBuy(
        newInventory.weekly_quests || stats?.inventory?.weekly_quests,
        getUtcWeekId(),
      );

      const { error: updateError } = await supabase.from('players')
        .update({ 
          inventory: newInventory,
          has_made_purchase: true,
        })
        .eq(DB_PLAYER_ID, String(user.id));
        
      if (updateError) throw updateError;

      setLocalInventory(newInventory);
      
      if (setStats) {
        setStats({ 
          ...stats, 
          inventory: newInventory,
          has_made_purchase: true,
        });
      }

      try {
        const after = await connection.getBalance(playerKeypair.publicKey);
        applyWalletSol(after / 1e9);
      } catch {
        await refreshWalletSol(playerKeypair.publicKey.toString());
      }

      setTxStatus({ show: true, loading: false, message: `✅ Success! ${item.name} purchased. Check your Tasks to claim your reward!`, success: true });
      setTimeout(() => setTxStatus(prev => ({ ...prev, show: false })), 3000);

    } catch (err) {
      console.error("Purchase Error:", err);
      try {
        await refreshWalletSol();
      } catch {
        /* ignore */
      }
      setTxStatus({ show: true, loading: false, message: `❌ Error: ${err.message}`, success: false });
    }
  };

  // --- 3. USING ITEMS FROM THE BACKPACK (Starts the Clock) ---
  const handleUseItem = async (item) => {
    if (!localInventory[item.id] || localInventory[item.id] <= 0) return;

    // NEW: Check if this item has already been used today UTC
    const todayStr = getTodayUTCString();
    // Free Battery Refill: 1× / UTC day after launch. Extra Battery Refill: no day lock.
    const afterLaunch = Date.now() >= Date.parse('2026-09-01T00:00:00Z');
    const isFreeRefill = item.id === 'refill';
    const isExtraRefill = item.id === 'refill_extra';
    const blockRefill =
      isFreeRefill && afterLaunch && dailyUsage.refill === todayStr;
    if (
      (dailyUsage[item.id] === todayStr &&
        !isFreeRefill &&
        !isExtraRefill &&
        item.id !== 'crate') ||
      blockRefill
    ) {
      setTxStatus({
        show: true,
        loading: false,
        message: blockRefill
          ? '❌ Battery Refill already used today (UTC). Use Extra Battery Refill from Premium, or wait until midnight UTC.'
          : `❌ You have already used a ${item.name} today. Wait until UTC midnight.`,
        success: false,
      });
      setTimeout(() => setTxStatus((prev) => ({ ...prev, show: false })), 3000);
      return;
    }

    setTxStatus({ show: true, loading: true, message: `Activating ${item.name}...`, success: false });

    // Prefer server activate (inventory + energy/buffs must match Supabase)
    try {
      await ensureSecureSession();
    } catch {
      /* ignore */
    }

    if (hasSecureSession()) {
      try {
        // Drain in-flight taps before Battery Refill so an old commit cannot
        // fight the new 500 bar (stuck-at-500 / stuck-at-390 desyncs).
        if (
          (item.id === 'refill' || item.id === 'refill_extra') &&
          typeof flushPendingTaps === 'function'
        ) {
          try {
            await flushPendingTaps();
          } catch {
            /* ignore */
          }
        }
        const data = await secureBackpackActivate(item.id);
        // Frenzy/Battery activate must invalidate in-flight flushes so a stale
        // no_energy (last_energy 0) cannot wipe the live battery bar.
        if (typeof bumpEnergyEpoch === 'function') bumpEnergyEpoch();
        const weekId = getUtcWeekId();
        const prevQty = Math.max(0, Math.floor(Number(localInventory[item.id]) || 0));
        let inv = { ...(data.inventory || {}) };
        // Decrement one charge (keep remaining stack). Do NOT force to 0 when qty > 1.
        const serverQty = Math.max(0, Math.floor(Number(inv[item.id]) || 0));
        let nextQty = serverQty;
        // If server lagged and still shows full stack, drop exactly one locally
        if (serverQty >= prevQty && prevQty > 0) nextQty = prevQty - 1;
        if (nextQty <= 0) {
          inv[item.id] = 0;
          delete inv[item.id];
        } else {
          inv[item.id] = nextQty;
        }

        let authInv = applyServerInventoryAuthority(
          stats?.inventory || localInventory || {},
          inv,
          weekId,
        );
        authInv = applyShopQtyAuthority(authInv, {
          ...authInv,
          [item.id]: nextQty > 0 ? nextQty : 0,
        });
        if (nextQty <= 0) {
          authInv[item.id] = 0;
          delete authInv[item.id];
        } else {
          authInv[item.id] = nextQty;
        }

        const todayUse = getTodayUTCString();
        // Free Battery Refill stamps day lock; Extra does not
        const nextDailyUsage = {
          ...(data.daily_usage || dailyUsage || {}),
          ...(item.id === 'refill' && afterLaunch
            ? { refill: todayUse }
            : item.id !== 'refill' &&
                item.id !== 'refill_extra' &&
                item.id !== 'crate'
              ? { [item.id]: todayUse }
              : {}),
        };
        authInv.daily_usage = nextDailyUsage;

        setLocalInventory({ ...authInv });
        setDailyUsage(nextDailyUsage);
        if (data.shard_balance != null) setBalance(Number(data.shard_balance));
        // Battery Refill / Extra — Frenzy must never touch the energy bar
        if ((item.id === 'refill' || item.id === 'refill_extra') && setEnergy) {
          const en =
            data.last_energy != null ? Number(data.last_energy) : 500;
          if (Number.isFinite(en)) {
            setEnergy(Math.min(500, Math.max(0, en)));
          }
        }
        if (setStats) {
          setStats((prev) => {
            // Post-activate inv is shop authority (keeps remaining charges after use)
            let next = applyServerInventoryAuthority(
              prev?.inventory || {},
              authInv,
              weekId,
            );
            next = applyShopQtyAuthority(next, authInv);
            next.daily_usage = nextDailyUsage;
            const merged = {
              ...prev,
              ...data.updates,
              last_energy:
                data.last_energy != null
                  ? Number(data.last_energy)
                  : prev.last_energy,
              inventory: next,
              daily_usage: nextDailyUsage,
            };
            // Ensure Frenzy timer is on the merged stats even if updates was partial
            if (
              (item.id === 'frenzy' || item.id === 'frenzy_60') &&
              data.updates?.frenzy_expires
            ) {
              merged.frenzy_expires = data.updates.frenzy_expires;
            }
            if (
              item.id === 'daily_plus_1000' &&
              data.updates?.max_daily_limit != null &&
              typeof onMaxDailyLimitChange === 'function'
            ) {
              onMaxDailyLimitChange(Number(data.updates.max_daily_limit));
            }
            return merged;
          });
        }

        // Re-fetch ground truth; clamp to post-use qty if server lagged
        try {
          const { data: row } = await supabase
            .from('players')
            .select(
              'inventory, daily_usage, last_energy, energy_boost_expires, frenzy_expires, efficiency_expires',
            )
            .eq(DB_PLAYER_ID, String(user.id))
            .maybeSingle();
          if (row?.inventory) {
            let cleaned = applyServerInventoryAuthority(
              authInv,
              row.inventory,
              weekId,
            );
            // Keep post-use qty (server or local nextQty) — never force-wipe stacks
            const syncedQty = Math.max(
              0,
              Math.floor(Number(cleaned[item.id]) || 0),
            );
            // If server still shows pre-use stack, clamp to what we just consumed to
            const clampQty = Math.min(syncedQty, nextQty);
            if (clampQty <= 0) {
              cleaned[item.id] = 0;
              delete cleaned[item.id];
            } else {
              cleaned[item.id] = clampQty;
            }
            const du = {
              ...(typeof row.daily_usage === 'object' && row.daily_usage
                ? row.daily_usage
                : {}),
              ...(typeof cleaned.daily_usage === 'object' && cleaned.daily_usage
                ? cleaned.daily_usage
                : {}),
              ...nextDailyUsage,
            };
            cleaned.daily_usage = du;
            setLocalInventory({ ...cleaned });
            setDailyUsage(du);
            if (setStats) {
              setStats((prev) => ({
                ...prev,
                inventory: applyServerInventoryAuthority(
                  prev?.inventory || {},
                  cleaned,
                  weekId,
                ),
                daily_usage: du,
                energy_boost_expires:
                  row.energy_boost_expires ?? prev.energy_boost_expires,
                frenzy_expires: row.frenzy_expires ?? prev.frenzy_expires,
                efficiency_expires:
                  row.efficiency_expires ?? prev.efficiency_expires,
                last_energy:
                  row.last_energy != null
                    ? Number(row.last_energy)
                    : prev.last_energy,
              }));
            }
            // If server still has the charge, push the consumed inventory via secure path
            // is already done by backpack-activate; if ghost remains, strip key client-side only.
          }
        } catch (syncErr) {
          console.warn('post-activate resync', syncErr);
        }

        setTxStatus({
          show: true,
          loading: false,
          message:
            item.id === 'refill' || item.id === 'refill_extra'
              ? '⚡ Battery refilled to 500/500!'
              : `⚡ ${item.name} is now ACTIVE!`,
          success: true,
        });
        setTimeout(() => setTxStatus((prev) => ({ ...prev, show: false })), 2000);
        return;
      } catch (secErr) {
        console.warn('secure activate failed', secErr?.message || secErr);
        // Resync backpack from Supabase — local UI often lies after failed buys
        try {
          const { data: row } = await supabase
            .from('players')
            .select('inventory, last_energy, daily_usage')
            .eq(DB_PLAYER_ID, String(user.id))
            .maybeSingle();
          if (row?.inventory) {
            setLocalInventory(row.inventory);
            if (setStats) {
              setStats((prev) => ({
                ...prev,
                inventory: applyServerInventoryAuthority(
                  prev?.inventory || {},
                  row.inventory,
                  getUtcWeekId(),
                ),
              }));
            }
          }
          if (row?.daily_usage) setDailyUsage(row.daily_usage);
        } catch {
          /* ignore */
        }
        setTxStatus({
          show: true,
          loading: false,
          message: `❌ ${secErr?.message || 'Failed to activate item.'}`,
          success: false,
        });
        return;
      }
    }

    // 1. Deduct from inventory — always merge parent inventory (preserve task_limit_boost!)
    const newInventory = buildFullInventory();
    const prevQty = Number(newInventory[item.id]) || 0;
    if (prevQty <= 1) {
      newInventory[item.id] = 0;
      delete newInventory[item.id];
    } else {
      newInventory[item.id] = prevQty - 1;
    }

    // NEW: Mark item as used today
    const newDailyUsage = { ...dailyUsage, [item.id]: todayStr };

    const now = Date.now();
    // Include daily_usage in the database update payload
    let dbUpdates = { inventory: newInventory, daily_usage: newDailyUsage };

    // End of *UTC* day (not local browser timezone)
    const midnightUtcTonight = getEndOfUtcDay(0);
    // Bot: 3 UTC calendar days (today + 2 more)
    const botExpireUtc = getEndOfUtcDay(2);
    // 7-day items: end of UTC day on the 7th calendar day (today + 6)
    const sevenDayExpireUtc = getEndOfUtcDay(6);

    // Shard Items
    if (item.id === 'frenzy') dbUpdates.frenzy_expires = new Date(now + 30 * 1000).toISOString();
   
    // Battery and Heavy Hands expire at end of current UTC day
    if (item.id === 'battery') dbUpdates.energy_boost_expires = midnightUtcTonight.toISOString();
    if (item.id === 'heavy') dbUpdates.efficiency_expires = midnightUtcTonight.toISOString();
    if (item.id === 'refill' || item.id === 'refill_extra') {
      // Never client-write last_energy — backpack-activate Edge owns the battery.
      throw new Error('Log in again to refill battery (secure session required).');
    }
   
    // Premium SOL Items
    if (item.id === 'bot') {
      dbUpdates.bot_expires = botExpireUtc.toISOString();
    }

    if (item.id === 'grinder') {
      dbUpdates.limit_boost_amount = 2000;
      dbUpdates.limit_boost_expires = sevenDayExpireUtc.toISOString();
    }
    if (item.id === 'whale') {
      dbUpdates.limit_boost_amount = 5000;
      dbUpdates.limit_boost_expires = sevenDayExpireUtc.toISOString();
    }
    if (item.id === 'x2_boost') {
      dbUpdates.premium_multiplier = 2;
      dbUpdates.premium_multiplier_expires = sevenDayExpireUtc.toISOString();
    }
    if (item.id === 'x3_boost') {
      dbUpdates.premium_multiplier = 3;
      dbUpdates.premium_multiplier_expires = sevenDayExpireUtc.toISOString();
    }
    if (item.id === 'expanded_energy') {
      newInventory.energy_cap_boost = {
        cap: 1000,
        expires: sevenDayExpireUtc.toISOString(),
      };
      dbUpdates.inventory = newInventory;
    }

    try {
      const { error } = await supabase.from('players').update(dbUpdates).eq(DB_PLAYER_ID, String(user.id));
      if (error) throw error;

      const weekIdL = getUtcWeekId();
      let authInvL = applyServerInventoryAuthority(
        stats?.inventory || {},
        newInventory,
        weekIdL,
      );
      const qL = Math.max(0, Math.floor(Number(newInventory[item.id]) || 0));
      if (qL <= 0) {
        authInvL[item.id] = 0;
        delete authInvL[item.id];
      } else {
        authInvL[item.id] = qL;
      }
      authInvL = applyShopQtyAuthority(authInvL, {
        ...authInvL,
        [item.id]: qL,
      });

      setLocalInventory({ ...authInvL });
      setDailyUsage(newDailyUsage);
      if (setStats) {
        setStats((prev) => ({
          ...prev,
          ...stats,
          ...dbUpdates,
          inventory: applyServerInventoryAuthority(
            prev?.inventory || {},
            authInvL,
            weekIdL,
          ),
        }));
      }

      setTxStatus({ show: true, loading: false, message: `⚡ ${item.name} is now ACTIVE!`, success: true });
      setTimeout(() => setTxStatus(prev => ({ ...prev, show: false })), 2000);

    } catch (err) {
      console.error("Activation Error:", err.message);
      setTxStatus({ show: true, loading: false, message: "❌ Failed to activate item.", success: false });
    }
  };


  // --- Mystery Gift: burn badges → server roll → auto-credit backpack / wallet ---
  const handleOpenMystery = async (tier) => {
    if (!user?.id) return;
    if (!canOpenMysteryWith(localInventory, tier)) {
      const need = MYSTERY_BOX_COSTS[tier];
      const name = BADGE_TIERS[tier]?.name || tier;
      setTxStatus({
        show: true,
        loading: false,
        message: `Need ${need} ${name}(s) to open Mystery Gift.`,
        success: false,
      });
      return;
    }
    setMysteryBusy(true);
    setMysteryReveal(null);
    setTxStatus({ show: true, loading: true, message: 'Opening Mystery Gift...', success: false });
    try {
      try {
        await ensureSecureSession();
      } catch {
        /* ignore */
      }
      if (!hasSecureSession()) {
        throw new Error('Log in again to open Mystery Gift (secure session required).');
      }
      const data = await secureMysteryOpen(tier);
      const inv = data.inventory || {};
      const weekId = getUtcWeekId();
      // Server snapshot wins for badge burns — empty prev so deleted badge keys stay gone
      const synced = applyServerInventoryAuthority({}, inv, weekId);
      if (data.shard_balance != null) setBalance(Number(data.shard_balance));
      setLocalInventory(synced);
      if (setStats) {
        setStats((prev) => ({
          ...prev,
          inventory: applyServerInventoryAuthority(
            prev?.inventory || {},
            inv,
            weekId,
          ),
          ...(data.gft_token_balance != null
            ? { gft_token_balance: Number(data.gft_token_balance) }
            : {}),
        }));
      }
      const reward = data.reward || {};
      const dest = reward.dest || data.dest || 'backpack';
      const minted = reward.type === 'nft_minted' && reward.asset;
      const destLine = minted
        ? `Minted on-chain → your game wallet / backpack (${String(reward.asset).slice(0, 8)}…)`
        : dest === 'wallet'
          ? 'Reserved for SPL $G2U to your game wallet (when Mystery wallet is live)'
          : dest === 'wallet_nft'
            ? 'Queued for mint — vault will mint to your game wallet when ready'
            : dest === 'balance'
              ? 'Added to your G2Ushards balance'
              : 'Added to Backpack — open Pack to activate';
      setTxStatus((p) => ({ ...p, show: false }));
      setMysteryReveal({
        tier,
        label: reward.label || 'Mystery prize',
        prizeId: reward.prizeId || '',
        dest: minted ? 'wallet_nft_minted' : dest,
        destLine,
        amount: reward.amount || data.balance_delta || data.g2u_delta || null,
        asset: reward.asset || null,
      });
    } catch (e) {
      console.error('mystery open', e);
      setTxStatus({
        show: true,
        loading: false,
        message: e?.message || 'Could not open Mystery Gift',
        success: false,
      });
    } finally {
      setMysteryBusy(false);
    }
  };

  // --- BACKPACK: boosts only here; badges live under Badges tab (not Boost) ---
  // Deduplicate by id — Instant Refill (etc.) appears in both Free + Premium catalogs
  // with the same inventory key; show one tile with Owned: N, not N duplicate icons.
  const BADGE_IDS = new Set(BADGE_ITEM_IDS);
  const backpackBoostItems = [];
  const seenBoostIds = new Set();
  for (const item of allItems) {
    if (item.isBadgeShop || BADGE_IDS.has(item.id)) continue;
    const qty = Number(localInventory[item.id]) || 0;
    if (qty <= 0) continue;
    if (seenBoostIds.has(item.id)) continue;
    seenBoostIds.add(item.id);
    backpackBoostItems.push(item);
  }
  const badgeCounts = getBadgeCounts(localInventory);
  const badgeTotal = Object.values(badgeCounts).reduce((a, b) => a + b, 0);
  const backpackItemCount =
    backpackBoostItems.reduce((t, i) => t + (Number(localInventory[i.id]) || 0), 0) +
    badgeTotal +
    walletNftCount;
  const backpackItems = backpackBoostItems; // legacy name for boosts
  const boostOwnedCount = backpackBoostItems.reduce(
    (t, i) => t + (Number(localInventory[i.id]) || 0),
    0,
  );
  const currentTodayStr = getTodayUTCString();

  return (
    <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', padding: '15px', paddingBottom: '120px', boxSizing: 'border-box' }}>
     
      {/* --- CUSTOM POP-UP MODAL --- */}
      {txStatus.show && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100110 }}>
          <div style={{ background: '#1c1e22', padding: '25px', borderRadius: '15px', border: txStatus.success ? '2px solid #4ade80' : '2px solid #ffd700', textAlign: 'center', width: '80%', maxWidth: '320px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
            <h3 style={{ color: '#fff', marginTop: 0, marginBottom: '15px' }}>
              {txStatus.loading ? '⚙️ Processing...' : txStatus.success ? '🎉 Complete!' : '⚠️ Notice'}
            </h3>
            <p style={{ color: '#ccc', fontSize: '13px', lineHeight: '1.4', marginBottom: '25px', wordBreak: 'break-word' }}>
              {txStatus.message}
            </p>
            {!txStatus.loading && (
              <button onClick={() => setTxStatus({ ...txStatus, show: false })} style={{ width: '100%', background: '#333', color: '#fff', border: '1px solid #555', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                Close
              </button>
            )}
          </div>
        </div>
      )}

      {mysteryReveal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.9)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 100060,
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'linear-gradient(165deg, #1a1520 0%, #0f172a 60%)',
              border: '2px solid #ffd700',
              borderRadius: 18,
              padding: '28px 22px',
              textAlign: 'center',
              width: '100%',
              maxWidth: 340,
              boxShadow: '0 0 40px rgba(255,215,0,0.25)',
              animation: 'mysteryPop 0.45s ease-out',
            }}
          >
            <div style={{ fontSize: 42, marginBottom: 8 }}>🎁</div>
            <h3 style={{ color: '#ffd700', margin: '0 0 8px', fontSize: 20 }}>
              You got…
            </h3>
            <p
              style={{
                color: '#fff',
                fontSize: 15,
                fontWeight: 'bold',
                lineHeight: 1.4,
                margin: '0 0 10px',
              }}
            >
              {mysteryReveal.label}
            </p>
            <p style={{ color: '#4ade80', fontSize: 12, margin: '0 0 18px', lineHeight: 1.4 }}>
              {mysteryReveal.destLine}
            </p>
            <p style={{ color: '#666', fontSize: 10, margin: '0 0 16px' }}>
              Burned {BADGE_TIERS[mysteryReveal.tier]?.name || mysteryReveal.tier} · odds for that
              tier applied
            </p>
            <button
              type="button"
              onClick={() => {
                setMysteryReveal(null);
                if (
                  mysteryReveal.dest === 'backpack' ||
                  mysteryReveal.prizeId === 'premium_boost' ||
                  mysteryReveal.prizeId === 'free_boost' ||
                  mysteryReveal.prizeId === 'exclusive_nft'
                ) {
                  setActiveTab('backpack');
                  setBackpackCat('boost');
                }
              }}
              style={{
                width: '100%',
                background: 'linear-gradient(90deg, #ffd700, #f59e0b)',
                color: '#000',
                border: 'none',
                padding: 14,
                borderRadius: 12,
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Nice!
            </button>
          </div>
          <style>{`
            @keyframes mysteryPop {
              from { transform: scale(0.85); opacity: 0; }
              to { transform: scale(1); opacity: 1; }
            }
          `}</style>
        </div>
      )}

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '15px' }}>
        <h2 style={{ color: '#ffd700', fontSize: '24px', margin: '0 0 5px 0' }}>Gift Shop</h2>
        <div
          style={{
            color: '#888',
            fontSize: '14px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <img
            src="/shop/G2Ushard.png"
            alt=""
            width={36}
            height={36}
            style={{ display: 'block', objectFit: 'contain', flexShrink: 0 }}
          />
          <span style={{ fontSize: 15 }}>{balance.toLocaleString()} G2Ushards</span>
        </div>
      </div>

      {/* Inside a section: back to hub so players never feel stuck in one aisle */}
      {activeTab !== 'home' && (
        <button
          type="button"
          onClick={() => setActiveTab('home')}
          style={{
            width: '100%',
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid #333',
            background: '#111',
            color: '#ffd700',
            fontWeight: 'bold',
            fontSize: 13,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          ← All shop options
        </button>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* --- HUB: Free / Premium / NFT / Backpack — same 2×2 squares as Premium --- */}
        {activeTab === 'home' && (
          <>
            <p style={{ color: '#888', fontSize: 12, margin: '0 0 12px', textAlign: 'center', lineHeight: 1.45 }}>
              Pick where you want to go — free boosts, SOL premium, NFTs, or your backpack.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {[
                {
                  id: 'upgrades',
                  title: 'Boost',
                  desc: 'Battery, frenzy, refill…',
                  badge: 'G2Ushards',
                  word: 'FREE',
                  border: '#4ade80',
                  titleColor: '#4ade80',
                  iconFrom: '#4ade80',
                  iconTo: '#14532d',
                },
                {
                  id: 'market',
                  title: 'Boost',
                  desc: 'Bot, Energy, Power...',
                  badge: 'SOL',
                  word: 'PREMIUM',
                  border: '#fbef43',
                  titleColor: '#fbef43',
                  iconFrom: '#fbef43',
                  iconTo: '#854d0e',
                },
                {
                  id: 'nft',
                  title: 'Marketplace',
                  desc: 'Gift2u Elves collection',
                  badge: 'On-chain',
                  word: 'NFT',
                  border: '#9945FF',
                  titleColor: '#c4b5fd',
                  iconFrom: '#c084fc',
                  iconTo: '#5b21b6',
                },
                {
                  id: 'inventory',
                  title: 'Backpack',
                  desc:
                    backpackItemCount > 0
                      ? `${backpackItemCount} item${backpackItemCount === 1 ? '' : 's'} owned`
                      : 'Purchased Items',
                  badge: backpackItemCount > 0 ? `${backpackItemCount}` : 'Empty',
                  emoji: '🎒',
                  border: '#a78bfa',
                  titleColor: '#e9d5ff',
                  iconFrom: '#a78bfa',
                  iconTo: '#4c1d95',
                },
              ].map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setActiveTab(card.id)}
                  style={{
                    background: '#111',
                    border: `1px solid ${card.border}`,
                    borderRadius: '12px',
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: 88,
                      marginBottom: 10,
                      borderRadius: 12,
                      background: `linear-gradient(145deg, ${card.iconFrom} 0%, ${card.iconTo} 100%)`,
                      border: `1px solid ${card.border}`,
                      boxShadow: `0 4px 14px ${card.border}55, inset 0 1px 0 rgba(255,255,255,0.12)`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: card.emoji ? 40 : 22,
                      fontWeight: card.emoji ? 'normal' : 900,
                      letterSpacing: card.emoji ? 0 : '0.06em',
                      color: '#000',
                      textShadow: card.emoji ? 'none' : '0 1px 0 rgba(255,255,255,0.2)',
                    }}
                  >
                    {card.emoji || card.word}
                  </div>

                  <div
                    style={{
                      color: '#fff',
                      fontWeight: 'bold',
                      fontSize: '13px',
                      width: '100%',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {card.title}
                  </div>
                  <div
                    style={{
                      color: card.titleColor,
                      fontSize: '11px',
                      marginTop: '2px',
                      fontWeight: 'bold',
                      lineHeight: 1.35,
                      minHeight: 32,
                    }}
                  >
                    {card.desc}
                  </div>

                  <div
                    style={{
                      width: '100%',
                      marginTop: '10px',
                      borderTop: '1px solid #222',
                      paddingTop: '10px',
                    }}
                  >
                    <div
                      style={{
                        color: card.titleColor,
                        fontSize: '12px',
                        fontWeight: 'bold',
                        marginBottom: '6px',
                      }}
                    >
                      {card.badge}
                    </div>
                    <div
                      style={{
                        width: '100%',
                        background: card.border,
                        color: '#000',
                        border: 'none',
                        padding: '6px 0',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        fontSize: '12px',
                      }}
                    >
                      Open
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
       
        {/* --- Free: SHARD SHOP (same square grid as Premium) --- */}
        {activeTab === 'upgrades' && (
          <>
            <p style={{ color: '#666', fontSize: 11, margin: '0 0 12px', textAlign: 'center' }}>
              Free · pay with G2Ushards · then use items from Backpack
            </p>
            <p
              style={{
                color: '#888',
                fontSize: 10,
                margin: '0 0 12px',
                textAlign: 'center',
                lineHeight: 1.4,
              }}
            >
              Bronze / Silver badges: in-game shards only · max {BADGE_SHOP_DAY_CAP}/day ·{' '}
              {BADGE_SHOP_WEEK_CAP}/week · Gold / Diamond from Weekly ranks
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {shardListings.map((item) => {
                let isActive = false;
                const now = new Date();
                if (item.id === 'battery' && stats.energy_boost_expires) {
                  isActive = now < new Date(stats.energy_boost_expires);
                } else if (item.id === 'frenzy' && stats.frenzy_expires) {
                  isActive = now < new Date(stats.frenzy_expires);
                } else if (item.id === 'heavy' && stats.efficiency_expires) {
                  isActive = now < new Date(stats.efficiency_expires);
                }

                const canAfford = balance >= item.cost;
                const badgeQuota = (() => {
                  if (!item.isBadgeShop) return null;
                  const raw = localInventory?.badge_shop || stats?.inventory?.badge_shop || {};
                  const today = new Date().toISOString().slice(0, 10);
                  const weekId = getUtcWeekId();
                  let dayQty = Math.max(0, Math.floor(Number(raw.dayQty) || 0));
                  let weekQty = Math.max(0, Math.floor(Number(raw.weekQty) || 0));
                  if (String(raw.day || '') !== today) dayQty = 0;
                  if (String(raw.weekId || '') !== weekId) weekQty = 0;
                  const dayLeft = Math.max(0, BADGE_SHOP_DAY_CAP - dayQty);
                  const weekLeft = Math.max(0, BADGE_SHOP_WEEK_CAP - weekQty);
                  return { dayLeft, weekLeft, blocked: dayLeft <= 0 || weekLeft <= 0 };
                })();
                const isDisabled =
                  isActive || !canAfford || !!(badgeQuota && badgeQuota.blocked);

                return (
                  <div
                    key={item.id}
                    style={{
                      background: '#111',
                      border: isActive
                        ? '1px solid #4ade80'
                        : canAfford
                          ? '1px solid #333'
                          : '1px solid #222',
                      borderRadius: '12px',
                      padding: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      textAlign: 'center',
                      opacity: !canAfford && !isActive ? 0.75 : 1,
                    }}
                  >
                    <div style={{ width: '100%', marginBottom: 10 }}>
                      <ShopItemIcon item={item} variant="card" />
                    </div>

                    <div
                      style={{
                        color: '#fff',
                        fontWeight: 'bold',
                        fontSize: '13px',
                        width: '100%',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.name}
                    </div>
                    <div
                      style={{
                        color: '#4ade80',
                        fontSize: '11px',
                        marginTop: '2px',
                        fontWeight: 'bold',
                        lineHeight: 1.35,
                      }}
                    >
                      {item.desc}
                      <br />
                      <span style={{ color: '#888', fontSize: '9px' }}>
                        {badgeQuota
                          ? `Left today ${badgeQuota.dayLeft} · week ${badgeQuota.weekLeft}`
                          : `⏱️ ${item.duration}`}
                      </span>
                    </div>

                    <div
                      style={{
                        width: '100%',
                        marginTop: '10px',
                        borderTop: '1px solid #222',
                        paddingTop: '10px',
                      }}
                    >
                      <div
                        style={{
                          color: '#ffd700',
                          fontSize: '13px',
                          fontWeight: 'bold',
                          marginBottom: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                        }}
                      >
                        <img
                          src="/shop/G2Ushard.png"
                          alt=""
                          width={16}
                          height={16}
                          style={{ objectFit: 'contain' }}
                        />
                        {Number(item.cost).toLocaleString()}
                      </div>
                      <button
                        type="button"
                        disabled={isDisabled}
                        onClick={() => {
                          if (isDisabled) return;
                          setItemToBuy(item);
                          setShowConfirmModal(true);
                        }}
                        style={{
                          width: '100%',
                          background: isActive
                            ? '#555'
                            : canAfford && !(badgeQuota && badgeQuota.blocked)
                              ? '#4ade80'
                              : '#333',
                          color:
                            isActive
                              ? '#fff'
                              : canAfford && !(badgeQuota && badgeQuota.blocked)
                                ? '#000'
                                : '#666',
                          border: 'none',
                          padding: '6px 0',
                          borderRadius: '6px',
                          fontWeight: 'bold',
                          fontSize: '12px',
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isActive
                          ? 'Active'
                          : badgeQuota && badgeQuota.dayLeft <= 0
                            ? 'Day limit'
                            : badgeQuota && badgeQuota.weekLeft <= 0
                              ? 'Week limit'
                              : canAfford
                                ? 'Buy'
                                : 'Need shards'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* --- TAB 2: PREMIUM SOL BOOSTS (not NFTs) --- */}
        {activeTab === 'market' && (
          <>
            <p style={{ color: '#666', fontSize: 11, margin: '0 0 12px', textAlign: 'center' }}>
              Premium · pay with SOL · stronger boosts
            </p>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '15px', overflowX: 'auto', paddingBottom: '5px' }}>
              {['All', 'Power', 'Misc'].map(filter => (
                <button
                  key={filter}
                  onClick={() => setMarketFilter(filter)}
                  style={{
                    padding: '6px 16px', borderRadius: '20px', border: '1px solid #333', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap',
                    background: marketFilter === filter ? '#fff' : '#111', color: marketFilter === filter ? '#000' : '#888'
                  }}>
                  {filter}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {filteredListings.map((item) => (
                <div key={item.id} style={{ background: '#111', border: item.rarity === 'Legendary' ? '1px solid #ffd700' : item.rarity === 'Epic' ? '1px solid #9945FF' : '1px solid #333', borderRadius: '12px', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                 
                  <div style={{ width: '100%', marginBottom: 10 }}>
                    <ShopItemIcon item={item} variant="card" />
                  </div>
                 
                  <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '13px', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.name}
                  </div>
                  <div style={{ color: item.rarity === 'Legendary' ? '#ffd700' : '#4ade80', fontSize: '11px', marginTop: '2px', fontWeight: 'bold' }}>
                    {item.boost} <br/> <span style={{color: '#888', fontSize: '9px'}}>⏱️ {item.duration}</span>
                  </div>

                  <div style={{ width: '100%', marginTop: '10px', borderTop: '1px solid #222', paddingTop: '10px' }}>
                    <div style={{ color: '#14F195', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>
                      {item.price} {item.currency}
                    </div>
                    <button
                      onClick={() => {
                        setItemToBuy(item);
                        setShowConfirmModal(true);
                      }}
                      style={{ width: '100%', background: '#9945FF', color: '#fff', border: 'none', padding: '6px 0', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
                    >
                      Buy
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* --- NFT MARKETPLACE: square grid (image + name + price); details on click --- */}
        {activeTab === 'nft' && (
          <>
            <p style={{ color: '#666', fontSize: 10, margin: '0 0 8px', textAlign: 'center' }}>
              NFT Marketplace · tap for details
            </p>
            <NftFilterBar
              rarity={nftRarityFilter}
              role={nftRoleFilter}
              level={nftLevelFilter}
              sort={nftSort}
              resultCount={filteredNftListings.length}
              totalCount={nftListings.length}
              onChange={(patch) => {
                if (patch.rarity != null) setNftRarityFilter(patch.rarity);
                if (patch.role != null) setNftRoleFilter(patch.role);
                if (patch.level != null) setNftLevelFilter(patch.level);
                if (patch.sort != null) setNftSort(patch.sort);
              }}
            />
            {/* Phone: 4/row · Desktop: 6/row */}
            <div
              className="grid grid-cols-4 md:grid-cols-6"
              style={{ gap: 6 }}
            >
              {filteredNftListings.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setNftDetail(item)}
                  style={{
                    background: '#111',
                    border:
                      item.rarity === 'Legendary'
                        ? '1px solid #ffd700'
                        : item.rarity === 'Epic'
                          ? '1px solid #a855f7'
                          : item.rarity === 'Rare'
                            ? '1px solid #3b82f6'
                            : item.rarity === 'Common'
                              ? '1px solid #a1a1aa'
                              : '1px solid #2a2a2a',
                    borderRadius: 8,
                    padding: 4,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    cursor: 'pointer',
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      marginBottom: 3,
                      borderRadius: 5,
                      overflow: 'hidden',
                      background: '#1a1525',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 16,
                    }}
                  >
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        loading="lazy"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit:
                            item.isStarMint || item.id === 'star_badge'
                              ? 'contain'
                              : 'cover',
                          objectPosition: 'center',
                          background: '#0a0a0a',
                        }}
                      />
                    ) : (
                      item.image
                    )}
                  </div>
                  <div
                    style={{
                      color: '#fff',
                      fontWeight: 'bold',
                      fontSize: 11,
                      width: '100%',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      lineHeight: 1.15,
                    }}
                  >
                    {item.name}
                  </div>
                  <div
                    style={{
                      color: '#c084fc',
                      fontSize: 9,
                      fontWeight: 'bold',
                      marginTop: 1,
                      lineHeight: 1.1,
                    }}
                  >
                    L{Number(item.level) || 1}
                  </div>
                  <div
                    style={{
                      color: '#14F195',
                      fontSize: 10,
                      fontWeight: 'bold',
                      marginTop: 1,
                      lineHeight: 1.15,
                    }}
                  >
                    {item.price} {item.currency}
                  </div>
                </button>
              ))}
            </div>
            {filteredNftListings.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  color: '#666',
                  fontSize: 12,
                  padding: '16px 8px',
                }}
              >
                No NFTs match these filters.
              </div>
            ) : null}
            <p style={{ color: '#555', fontSize: 9, textAlign: 'center', margin: '8px 0 0' }}>
              Mint new above · trade owned NFTs below
            </p>
            <NftMarket
              decryptedPhrase={decryptedPhrase}
              playerWallet={playerWallet}
              onStatus={setTxStatus}
              onNftChange={() => setWalletNftRefresh((n) => n + 1)}
            />
          </>
        )}

        {/* --- TAB 3: BACKPACK — Boost / Badges / NFT --- */}
        {activeTab === 'inventory' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                {
                  id: 'boost',
                  label: boostOwnedCount > 0 ? `Boost (${boostOwnedCount})` : 'Boost',
                  color: '#4ade80',
                },
                {
                  id: 'badges',
                  label: badgeTotal > 0 ? `Badges (${badgeTotal})` : 'Badges',
                  color: '#ffd700',
                },
                {
                  id: 'nft',
                  label: walletNftCount > 0 ? `NFT (${walletNftCount})` : 'NFT',
                  color: '#c084fc',
                },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setBackpackCat(tab.id)}
                  style={{
                    flex: 1,
                    padding: '10px 6px',
                    borderRadius: 10,
                    border:
                      backpackCat === tab.id
                        ? `2px solid ${tab.color}`
                        : '1px solid #333',
                    background:
                      backpackCat === tab.id
                        ? 'rgba(255,255,255,0.06)'
                        : '#1c1e22',
                    color: backpackCat === tab.id ? tab.color : '#888',
                    fontWeight: 'bold',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* BOOSTS */}
            {backpackCat === 'boost' && (
              <>
                {backpackItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '36px 16px', color: '#888' }}>
                    <div style={{ fontSize: 40, marginBottom: 10 }}>⚡</div>
                    <h3 style={{ color: '#fff', margin: '0 0 8px' }}>No boosts yet</h3>
                    <p style={{ fontSize: 12, margin: 0 }}>
                      Buy free or premium boosts, then activate them here.
                    </p>
                  </div>
                ) : (
                  backpackItems.map((item) => {
                    // Free Battery Refill: 1×/day. Extra Battery Refill: never day-locked.
                    const isUsedToday =
                      item.id === 'refill_extra'
                        ? false
                        : item.id === 'refill'
                          ? dailyUsage.refill === currentTodayStr
                          : dailyUsage[item.id] === currentTodayStr;
                    return (
                      <div
                        key={item.id}
                        style={{
                          background: '#1c1e22',
                          borderRadius: 15,
                          padding: '12px 15px',
                          border: '1px solid #4ade80',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        <ShopItemIcon item={item} size={48} variant="row" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h3 style={{ margin: '0 0 4px', color: '#fff', fontSize: 15 }}>
                            {item.name}
                          </h3>
                          <span style={{ color: '#888', fontSize: 11, fontWeight: 'bold' }}>
                            Owned: {localInventory[item.id]}
                          </span>
                          {isUsedToday && (
                            <div style={{ color: '#ff4444', fontSize: 10, marginTop: 4 }}>
                              Used today (UTC)
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={isUsedToday}
                          style={{
                            background: isUsedToday ? '#444' : '#4ade80',
                            color: isUsedToday ? '#888' : '#000',
                            border: 'none',
                            padding: '10px 16px',
                            borderRadius: 10,
                            fontWeight: 'bold',
                            cursor: isUsedToday ? 'not-allowed' : 'pointer',
                          }}
                          onClick={() => handleUseItem(item)}
                        >
                          {isUsedToday ? 'LIMIT' : 'USE'}
                        </button>
                      </div>
                    );
                  })
                )}
              </>
            )}

            {/* BADGES + MYSTERY GIFT */}
            {backpackCat === 'badges' && (
              <>
                <WeeklyBadgePanel
                  playerId={
                    user?.id ||
                    user?.telegram_id ||
                    stats?.telegram_id ||
                    stats?.player_id ||
                    null
                  }
                  inventory={localInventory}
                  onInventoryChange={(inv, playerPatch) => {
                    setLocalInventory((prev) => addToBackpackInventory(prev, inv));
                    if (typeof setStats === 'function') {
                      setStats((prev) => ({
                        ...(prev || {}),
                        inventory: addToBackpackInventory(prev?.inventory || {}, inv),
                        ...(playerPatch && typeof playerPatch === 'object'
                          ? {
                              ...(playerPatch.shard_balance != null
                                ? { shard_balance: playerPatch.shard_balance }
                                : {}),
                              ...(playerPatch.season_shards != null
                                ? { season_shards: playerPatch.season_shards }
                                : {}),
                              ...(playerPatch.daily_taps != null
                                ? { daily_taps: playerPatch.daily_taps }
                                : {}),
                              ...(playerPatch.lifetime_taps != null
                                ? { lifetime_taps: playerPatch.lifetime_taps }
                                : {}),
                            }
                          : {}),
                      }));
                    }
                  }}
                />
                <div
                  style={{
                    background: 'linear-gradient(145deg, rgba(255,215,0,0.12), #0f172a)',
                    border: '2px solid #ffd700',
                    borderRadius: 14,
                    padding: 14,
                  }}
                >
                  <div style={{ color: '#ffd700', fontWeight: 'bold', fontSize: 15 }}>
                    🎁 Mystery Gift
                  </div>
                  <p style={{ color: '#aaa', fontSize: 11, margin: '6px 0 10px', lineHeight: 1.4 }}>
                    These badges only send you to <strong style={{ color: '#ffd700' }}>gift2u.fun</strong>.
                    Open the Mystery Gift by tapping the <strong style={{ color: '#ffd700' }}>big gift</strong> on the home page.
                  </p>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 8,
                      marginBottom: 10,
                    }}
                  >
                    {Object.keys(MYSTERY_BOX_COSTS).map((tier) => {
                      const meta = BADGE_TIERS[tier];
                      const need = MYSTERY_BOX_COSTS[tier];
                      const have = badgeCounts[tier] || 0;
                      const ok = have >= need;
                      return (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => {
                            // Never open/reward here — home page; player taps the big gift
                            window.location.assign('/');
                          }}
                          style={{
                            background: ok ? '#1c1e22' : '#111',
                            border: `1px solid ${ok ? meta.color : '#333'}`,
                            borderRadius: 12,
                            padding: 10,
                            color: ok ? '#fff' : '#555',
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            opacity: ok ? 1 : 0.55,
                            cursor: 'pointer',
                            width: '100%',
                          }}
                        >
                          {meta.image ? (
                            <img
                              src={meta.image}
                              alt={meta.name}
                              width={36}
                              height={36}
                              style={{
                                width: 36,
                                height: 36,
                                objectFit: 'contain',
                                borderRadius: 8,
                                flexShrink: 0,
                                background: '#000',
                              }}
                            />
                          ) : (
                            <div style={{ fontSize: 18 }}>{meta.emoji}</div>
                          )}
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 'bold',
                                fontSize: 11,
                                color: meta.color,
                              }}
                            >
                              Need {need} · have {have}
                            </div>
                            <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>
                              Go home · tap the gift
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 10, fontSize: 10, color: '#666', lineHeight: 1.45 }}>
                    <strong style={{ color: '#888' }}>Odds by badge burned</strong>
                    {' '}(same % the server uses)
                    <div style={{ marginTop: 6, overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, color: '#aaa' }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', padding: '2px 4px', color: '#888' }}>Prize</th>
                            <th style={{ padding: '2px 4px', color: '#cd7f32' }}>🥉</th>
                            <th style={{ padding: '2px 4px', color: '#c0c0c0' }}>🥈</th>
                            <th style={{ padding: '2px 4px', color: '#ffd700' }}>🥇</th>
                            <th style={{ padding: '2px 4px', color: '#67e8f9' }}>💎</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            ['exclusive_nft', 'Exclusive NFT → Backpack'],
                            ['bonus_g2u', 'Bonus G2U → Wallet'],
                            ['premium_boost', 'Premium Boost → Backpack'],
                            ['free_boost', 'Free Boost → Backpack'],
                            ['shards_bulk', 'G2Ushards bulk → Balance'],
                          ].map(([prizeId, label]) => (
                            <tr key={prizeId}>
                              <td style={{ padding: '2px 4px', textAlign: 'left' }}>{label}</td>
                              {['bronze', 'silver', 'gold', 'diamond'].map((t) => (
                                <td key={t} style={{ padding: '2px 4px', textAlign: 'center' }}>
                                  {(MYSTERY_ODDS_BY_TIER[t]?.[prizeId] ?? 0)}%
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div style={{ color: '#fbbf24', fontWeight: 'bold', fontSize: 13, marginTop: 4 }}>
                  Star Badge
                </div>
                <p style={{ color: '#666', fontSize: 11, margin: '0 0 8px', lineHeight: 1.35 }}>
                  Equip → NFT. Win in Mystery Gift or trade below.
                </p>
                {getShardBadgeCount(localInventory) > 0 ? (
                  <div
                    style={{
                      background: '#1c1e22',
                      borderRadius: 14,
                      padding: '12px 14px',
                      border: '1px solid #fbbf24',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      marginBottom: 12,
                    }}
                  >
                    <img
                      src={SHARD_BADGE.image}
                      alt={SHARD_BADGE.name}
                      width={56}
                      height={56}
                      style={{
                        width: 56,
                        height: 56,
                        objectFit: 'contain',
                        borderRadius: 10,
                        flexShrink: 0,
                        background: '#000',
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>
                        {SHARD_BADGE.name}
                      </div>
                      <div style={{ color: '#888', fontSize: 11 }}>
                        Owned ×{getShardBadgeCount(localInventory)} · ×
                        {getFreeShardBadgeCount(localInventory)}
                      </div>
                    </div>
                    <div style={{ color: '#fbbf24', fontWeight: 'bold', fontSize: 18 }}>
                      ×{getShardBadgeCount(localInventory)}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '14px 12px',
                      color: '#888',
                      border: '1px dashed #444',
                      borderRadius: 12,
                      marginBottom: 12,
                    }}
                  >
                    <img
                      src={SHARD_BADGE.image}
                      alt=""
                      width={40}
                      height={40}
                      style={{ opacity: 0.4, marginBottom: 6 }}
                    />
                    <p style={{ fontSize: 12, margin: 0 }}>No Badge yet.</p>
                    <p style={{ fontSize: 11, color: '#666', margin: '4px 0 0' }}>
                      Buy from Badge market or win in Mystery Gift.
                    </p>
                  </div>
                )}

                <div style={{ color: '#ffd700', fontWeight: 'bold', fontSize: 13, marginTop: 4 }}>
                  Weekly season badges
                </div>
                <p style={{ color: '#666', fontSize: 11, margin: '0 0 4px', lineHeight: 1.35 }}>
                  From Ranks → Weekly (eligible ≥1,050 — every eligible player wins a badge). Sell in Badge market below.
                </p>
                {badgeTotal === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 12px', color: '#888' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: 8,
                        marginBottom: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      {badgeCatalogForBackpack().map((b) => (
                        <img
                          key={b.id}
                          src={b.image}
                          alt={b.name}
                          width={48}
                          height={48}
                          style={{
                            width: 48,
                            height: 48,
                            objectFit: 'contain',
                            opacity: 0.35,
                            borderRadius: 8,
                          }}
                        />
                      ))}
                    </div>
                    <p style={{ fontSize: 12, margin: 0 }}>No badges yet.</p>
                    <p style={{ fontSize: 11, color: '#666', margin: '6px 0 0' }}>
                      Reach ≥1,400 on Ranks → Weekly to win a badge (from W36: top 5% Diamond · next 10% Gold · next 15% Silver · rest Bronze).
                    </p>
                  </div>
                ) : (
                  badgeCatalogForBackpack().map((b) => {
                    const qty = Number(localInventory[b.id]) || 0;
                    if (qty <= 0) return null;
                    return (
                      <div
                        key={b.id}
                        style={{
                          background: '#1c1e22',
                          borderRadius: 14,
                          padding: '12px 14px',
                          border: `1px solid ${b.color}`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        {b.image ? (
                          <img
                            src={b.image}
                            alt={b.name}
                            width={56}
                            height={56}
                            style={{
                              width: 56,
                              height: 56,
                              objectFit: 'contain',
                              borderRadius: 10,
                              flexShrink: 0,
                              background: '#000',
                            }}
                          />
                        ) : (
                          <div style={{ fontSize: 28 }}>{b.emoji}</div>
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>
                            {b.name}
                          </div>
                          <div style={{ color: '#888', fontSize: 11 }}>{b.desc}</div>
                        </div>
                        <div style={{ color: b.color, fontWeight: 'bold', fontSize: 18 }}>
                          ×{qty}
                        </div>
                      </div>
                    );
                  })
                )}

                <div style={{ marginTop: 8 }}>
                  <BadgeMarket
                    inventory={localInventory}
                    balance={balance}
                    setBalance={setBalance}
                    setStats={setStats}
                    setLocalInventory={setLocalInventory}
                    decryptedPhrase={decryptedPhrase}
                    playerWallet={playerWallet}
                    onStatus={setTxStatus}
                  />
                </div>
              </>
            )}

            {/* NFT (on-chain in game wallet — same scan as Wallet hub) */}
            {backpackCat === 'nft' && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 10,
                    gap: 8,
                  }}
                >
                  <div>
                    <div style={{ color: '#c084fc', fontWeight: 'bold', fontSize: 14 }}>
                      Your NFTs
                    </div>
                    <div style={{ color: '#666', fontSize: 11, marginTop: 2 }}>
                      {walletNftCount > 0
                        ? `${walletNftCount} Gift2u Elves NFT(s) on this game wallet`
                        : 'On-chain in your game wallet (not consumable charges)'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWalletNftRefresh((n) => n + 1)}
                    style={{
                      background: '#222',
                      border: '1px solid #444',
                      color: '#c084fc',
                      borderRadius: 10,
                      padding: '8px 10px',
                      fontSize: 11,
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    Refresh
                  </button>
                </div>
                {playerWallet ? (
                  <WalletNftSection
                  walletAddress={playerWallet}
                  walletSecret={decryptedPhrase || ''}
                  refreshKey={walletNftRefresh}
                  gameplayMode
                  maxUnlockedLevel={Number(maxUnlockedLevel) || Number(stats?.max_unlocked_level) || Number(player?.max_unlocked_level) || 4}
                  inventory={localInventory}
                  gftTokenBalance={Number(stats?.gft_token_balance) || 0}
                  onGftBalanceChange={(gft) => {
                    const n = Number(gft);
                    if (!Number.isFinite(n)) return;
                    if (setStats) {
                      setStats((prev) => ({
                        ...prev,
                        gft_token_balance: n,
                      }));
                    }
                    // Push into parent wallet HUD (GiftTap balances.G2U)
                    if (typeof onChainBalanceChangeRef.current === 'function') {
                      onChainBalanceChangeRef.current({ g2u: n });
                    }
                  }}
                  onChainBalanceChange={(info) => {
                    applyWalletSol(info?.sol);
                    const g2u = Number(info?.g2u);
                    if (Number.isFinite(g2u)) {
                      if (setStats) {
                        setStats((prev) => ({
                          ...prev,
                          gft_token_balance: g2u,
                        }));
                      }
                      if (typeof onChainBalanceChangeRef.current === 'function') {
                        onChainBalanceChangeRef.current({
                          g2u,
                          ...(Number.isFinite(Number(info?.sol))
                            ? { sol: Number(info.sol) }
                            : {}),
                        });
                      }
                    } else if (
                      info &&
                      typeof info === 'object' &&
                      !('sol' in info) &&
                      typeof onChainBalanceChangeRef.current === 'function'
                    ) {
                      onChainBalanceChangeRef.current(info);
                    }
                  }}
                  onInventoryChange={(inv, playerPatch) => {
                    // NFT sync: add NFT fields only — keep badges/boosts already in backpack
                    setLocalInventory((prev) => addToBackpackInventory(prev, inv));
                    if (setStats) {
                      setStats((prev) => ({
                        ...prev,
                        inventory: addToBackpackInventory(prev?.inventory || {}, inv),
                        ...(playerPatch && typeof playerPatch === 'object'
                          ? {
                              ...(playerPatch.shard_balance != null
                                ? { shard_balance: playerPatch.shard_balance }
                                : {}),
                              ...(playerPatch.season_shards != null
                                ? { season_shards: playerPatch.season_shards }
                                : {}),
                              ...(playerPatch.daily_taps != null
                                ? { daily_taps: playerPatch.daily_taps }
                                : {}),
                              ...(playerPatch.lifetime_taps != null
                                ? { lifetime_taps: playerPatch.lifetime_taps }
                                : {}),
                              ...(playerPatch.tap_power != null
                                ? { tap_power: playerPatch.tap_power }
                                : {}),
                              ...(playerPatch.max_daily_limit != null
                                ? { max_daily_limit: playerPatch.max_daily_limit }
                                : {}),
                            }
                          : {}),
                      }));
                    }
                  }}
                  notify={(msg, okOrOpts) => {
                    const ok =
                      typeof okOrOpts === 'boolean'
                        ? okOrOpts
                        : okOrOpts?.success !== false;
                    const m = String(msg || '');
                    setTxStatus({
                      show: true,
                      loading: !!okOrOpts?.loading,
                      message: m,
                      success: !!ok,
                    });
                  }}
                  onOpenShopNfts={() => setActiveTab('nft')}
                  onSellNft={() => setActiveTab('nft')}
                />
                ) : (
                  <div style={{ textAlign: 'center', padding: '28px 16px', color: '#888' }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>🔑</div>
                    <p style={{ fontSize: 12 }}>No game wallet yet. Finish account setup first.</p>
                  </div>
                )}
                <NftMarket
                  decryptedPhrase={decryptedPhrase}
                  playerWallet={playerWallet}
                  onStatus={setTxStatus}
                  onNftChange={() => setWalletNftRefresh((n) => n + 1)}
                />
                <button
                  type="button"
                  onClick={() => setActiveTab('nft')}
                  style={{
                    width: '100%',
                    marginTop: 12,
                    background: 'linear-gradient(90deg, #9945FF, #14F195)',
                    color: '#000',
                    border: 'none',
                    padding: '12px 18px',
                    borderRadius: 12,
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  Open NFT shop
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* --- NFT detail popup (image + level + attributes + mint) --- */}
      {nftDetail && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.92)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10000,
            padding: 10,
            boxSizing: 'border-box',
          }}
          onClick={() => setNftDetail(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1c1e22',
              padding: 12,
              borderRadius: 16,
              border: '2px solid #9945FF',
              width: '100%',
              maxWidth: 400,
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
              overflow: 'hidden',
            }}
          >
            {/* Art — capped so attributes + buttons always fit */}
            <div
              style={{
                width: '100%',
                maxWidth: 220,
                maxHeight: '32vh',
                aspectRatio: '1',
                margin: '0 auto 8px',
                borderRadius: 12,
                overflow: 'hidden',
                background: '#111',
                border: '1px solid #333',
                flexShrink: 0,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 40,
              }}
            >
              {nftDetail.imageUrl ? (
                <img
                  src={nftDetail.imageUrl}
                  alt={nftDetail.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit:
                      nftDetail.isStarMint || nftDetail.id === 'star_badge'
                        ? 'contain'
                        : 'cover',
                    objectPosition: 'center',
                    background: '#0a0a0a',
                  }}
                />
              ) : (
                nftDetail.image
              )}
              <div
                style={{
                  position: 'absolute',
                  top: 6,
                  left: 6,
                  background: 'rgba(0,0,0,0.75)',
                  color: '#c084fc',
                  fontWeight: 'bold',
                  fontSize: 11,
                  padding: '3px 8px',
                  borderRadius: 8,
                  border: '1px solid #a855f7',
                }}
              >
                L{Number(nftDetail.level) || 1}
              </div>
            </div>
            <div style={{ textAlign: 'center', marginBottom: 6, flexShrink: 0 }}>
              <div style={{ color: '#a78bfa', fontSize: 11, fontWeight: 'bold' }}>
                {nftDetail.collection} · {nftDetail.rarity} · L
                {Number(nftDetail.level) || 1}
              </div>
              <h3
                style={{
                  color: '#ffd700',
                  margin: '2px 0 0',
                  fontSize: 16,
                  lineHeight: 1.25,
                }}
              >
                {nftDetail.name}
              </h3>
              {nftDetail.boost ? (
                <p
                  style={{
                    color: '#14F195',
                    fontSize: 11,
                    margin: '4px 0 0',
                    lineHeight: 1.35,
                  }}
                >
                  {nftDetail.boost}
                </p>
              ) : null}
            </div>

            {/* Shop detail — same language as Backpack/Wallet (no on-chain attributes list) */}
            {nftDetail.isFateMint ||
            nftDetail.isEchoMint ||
            nftDetail.isRushMint ||
            nftDetail.isShadowMint ||
            nftDetail.isStarMint ||
            nftDetail.id === 'star_badge' ||
            nftDetail.isNftMint ||
            nftDetail.id === 'locksmith' ? (
              <div
                style={{
                  flex: '1 1 auto',
                  overflowY: 'auto',
                  marginBottom: 8,
                  minHeight: 0,
                }}
              >
                {nftDetail.isStarMint || nftDetail.id === 'star_badge' ? (
                  <div
                    style={{
                      marginBottom: 10,
                      padding: 12,
                      borderRadius: 12,
                      border: '1px solid #333',
                      background: '#0e0f14',
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        color: '#888',
                        fontSize: 10,
                        textTransform: 'uppercase',
                      }}
                    >
                      Level
                    </div>
                    <div
                      style={{ color: '#c084fc', fontWeight: 'bold', fontSize: 22 }}
                    >
                      L{Number(nftDetail.level) || 1}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      marginBottom: 10,
                      padding: 12,
                      borderRadius: 12,
                      border: '1px solid #333',
                      background: '#0e0f14',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    {nftDetail.isFateMint ||
                    nftDetail.isEchoMint ||
                    nftDetail.isRushMint ||
                    nftDetail.isShadowMint ? (
                      <span
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: '50%',
                          flexShrink: 0,
                          display: 'grid',
                          placeItems: 'center',
                          border: '2px solid #555',
                          background: '#16161c',
                          boxShadow: 'inset 0 0 0 6px #0a0a0e',
                          fontSize: 22,
                        }}
                      />
                    ) : (
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span
                          style={{
                            display: 'block',
                            color: '#888',
                            fontSize: 10,
                            textTransform: 'uppercase',
                            marginBottom: 2,
                          }}
                        >
                          Walls cleared
                        </span>
                        <span
                          style={{
                            display: 'block',
                            color: '#888',
                            fontSize: 12,
                            fontWeight: 'bold',
                            lineHeight: 1.4,
                          }}
                        >
                          — · next Wall-5
                        </span>
                      </span>
                    )}
                    {(nftDetail.isFateMint ||
                      nftDetail.isEchoMint ||
                      nftDetail.isRushMint ||
                      nftDetail.isShadowMint) && <span style={{ flex: 1 }} />}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div
                        style={{
                          color: '#888',
                          fontSize: 10,
                          textTransform: 'uppercase',
                        }}
                      >
                        Level
                      </div>
                      <div
                        style={{
                          color: '#c084fc',
                          fontWeight: 'bold',
                          fontSize: 18,
                        }}
                      >
                        L{Number(nftDetail.level) || 1}
                      </div>
                    </div>
                  </div>
                )}

                {nftDetail.isFateMint ||
                nftDetail.isEchoMint ||
                nftDetail.isRushMint ||
                nftDetail.isShadowMint ? (
                  <div
                    style={{
                      marginBottom: 8,
                      padding: 12,
                      borderRadius: 12,
                      border: '1px solid #333',
                      background: '#0e0f14',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ color: '#ddd', fontSize: 12, fontWeight: 'bold' }}>
                        Durability
                      </span>
                      <span style={{ color: '#4ade80', fontSize: 13, fontWeight: 'bold' }}>
                        100%
                      </span>
                    </div>
                    <div
                      style={{
                        height: 8,
                        borderRadius: 999,
                        background: '#1a1d24',
                        overflow: 'hidden',
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          background: 'linear-gradient(90deg, #16a34a, #4ade80)',
                        }}
                      />
                    </div>
                    <div style={{ color: '#666', fontSize: 10, lineHeight: 1.35 }}>
                      Starts at 100% when owned · drains 1% / 1,000 taps · off at 0% ·
                      reload with $G2U in Wallet / Backpack (1,000 G2U = 1%)
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Footer pinned — Close + Mint always on screen */}
            <div style={{ flexShrink: 0, paddingTop: 2 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: 4,
                }}
              >
                <span style={{ color: '#14F195', fontWeight: 'bold', fontSize: 16 }}>
                  {nftDetail.price} {nftDetail.currency}
                </span>
                {nftDetail.isNftMint && (
                  <span style={{ color: '#555', fontSize: 9 }}>
                    +~{nftDetail.feeBufferSol ?? LOCKSMITH_WAVE1.feeBufferSol} fees
                    {(nftDetail.isFateMint || nftDetail.isEchoMint || nftDetail.isRushMint || nftDetail.isShadowMint || nftDetail.isStarMint) && !nftDetail.mintLive
                      ? ' · CM soon'
                      : ''}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 9, color: '#777', marginBottom: 8, lineHeight: 1.3 }}>
                {walletSolLoading
                  ? 'Checking SOL…'
                  : walletSol == null
                    ? 'Could not read SOL'
                    : `Game wallet · ${Number(walletSol || 0).toFixed(4)} SOL`}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setNftDetail(null)}
                  style={{
                    flex: 1,
                    padding: 10,
                    background: '#333',
                    color: '#fff',
                    borderRadius: 10,
                    border: 'none',
                    fontWeight: 'bold',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={(() => {
                    if (!nftDetail.isNftMint) return false;
                    if (walletSolLoading) return true;
                    if (!walletUnlocked) return false;
                    if (
                      (nftDetail.isFateMint || nftDetail.isEchoMint || nftDetail.isRushMint || nftDetail.isShadowMint || nftDetail.isStarMint) &&
                      !nftDetail.mintLive
                    )
                      return true;
                    return false;
                  })()}
                  onClick={() => {
                    if (nftDetail.isNftMint) {
                      if (walletSolLoading) return;
                      if (!walletUnlocked) {
                        setTxStatus({
                          show: true,
                          loading: false,
                          message:
                            'Game wallet key missing after login. Log out, log in once with your password, then mint.',
                          success: false,
                        });
                        return;
                      }
                      if (
                        (nftDetail.isFateMint || nftDetail.isEchoMint || nftDetail.isRushMint || nftDetail.isShadowMint || nftDetail.isStarMint) &&
                        !nftDetail.mintLive
                      ) {
                        setTxStatus({
                          show: true,
                          loading: false,
                          message: 'Mint opens when the candy machine is live. Check back soon.',
                          success: false,
                        });
                        return;
                      }
                      const afford = nftDetail.isShadowMint
                        ? canAffordShadow(nftDetail.shadowRarity || 'common')
                        : nftDetail.isRushMint
                        ? canAffordRush(nftDetail.rushRarity || 'common')
                        : nftDetail.isEchoMint
                          ? canAffordEcho(nftDetail.echoRarity || 'common')
                          : nftDetail.isFateMint
                            ? canAffordFate(nftDetail.fateRarity || 'common')
                            : nftDetail.isStarMint
                              ? canAffordStarMint
                              : canAffordLocksmithMint;
                      if (!afford) {
                        const need = nftDetail.isShadowMint
                          ? minSolForShadowMint(nftDetail.shadowRarity || 'common')
                          : nftDetail.isRushMint
                          ? minSolForRushMint(nftDetail.rushRarity || 'common')
                          : nftDetail.isEchoMint
                            ? minSolForEchoMint(nftDetail.echoRarity || 'common')
                            : nftDetail.isFateMint
                              ? minSolForFateMint(nftDetail.fateRarity || 'common')
                              : nftDetail.isStarMint
                                ? minSolForStarMint()
                                : minMintSol;
                        const have =
                          walletSol != null && Number.isFinite(walletSol)
                            ? walletSol.toFixed(4)
                            : '0';
                        setNftDetail(null);
                        setTxStatus({
                          show: true,
                          loading: false,
                          message: `Not enough SOL. Need ${need.toFixed(2)} SOL · you have ${have} SOL. Buy more SOL for your game wallet.`,
                          success: false,
                        });
                        return;
                      }
                      setNftDetail(null);
                      setItemToBuy(nftDetail);
                      setShowConfirmModal(true);
                      return;
                    }
                    setNftDetail(null);
                    setItemToBuy(nftDetail);
                    setShowConfirmModal(true);
                  }}
                  style={{
                    flex: 1.2,
                    padding: 10,
                    background: (() => {
                      if (!nftDetail.isNftMint)
                        return 'linear-gradient(90deg, #9945FF, #14F195)';
                      if (
                        (nftDetail.isFateMint || nftDetail.isEchoMint || nftDetail.isRushMint || nftDetail.isShadowMint || nftDetail.isStarMint) &&
                        !nftDetail.mintLive
                      )
                        return '#444';
                      return 'linear-gradient(90deg, #9945FF, #14F195)';
                    })(),
                    color: (() => {
                      if (!nftDetail.isNftMint) return '#000';
                      if (
                        (nftDetail.isFateMint || nftDetail.isEchoMint || nftDetail.isRushMint || nftDetail.isShadowMint || nftDetail.isStarMint) &&
                        !nftDetail.mintLive
                      )
                        return '#888';
                      return '#000';
                    })(),
                    borderRadius: 10,
                    border: 'none',
                    fontWeight: 'bold',
                    fontSize: 13,
                    cursor: 'pointer',
                    opacity: walletSolLoading && nftDetail.isNftMint ? 0.7 : 1,
                  }}
                >
                  {nftDetail.isNftMint
                    ? walletSolLoading
                      ? '…'
                      : !walletUnlocked
                        ? 'Buy'
                        : (nftDetail.isFateMint || nftDetail.isEchoMint || nftDetail.isRushMint || nftDetail.isShadowMint || nftDetail.isStarMint) &&
                            !nftDetail.mintLive
                          ? 'Soon'
                          : 'Mint'
                    : 'Buy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- Confirm purchase / mint --- */}
      {showConfirmModal && itemToBuy && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}>
          <div style={{ background: '#1c1e22', padding: '25px', borderRadius: '15px', border: '2px solid #ffd700', textAlign: 'center', width: '80%', maxWidth: '320px' }}>
            <h3 style={{ color: '#fff', marginTop: 0 }}>Confirm Purchase?</h3>
            <p style={{ color: '#ccc', fontSize: '14px' }}>
              {itemToBuy.isShadowMint || String(itemToBuy.id || '').startsWith('shadow_') ? (
                <>
                  Mint <strong>{itemToBuy.name}</strong> for{' '}
                  <strong style={{ color: '#14F195' }}>{itemToBuy.price} SOL</strong>?
                  <br />
                  <span style={{ fontSize: 12, color: '#a78bfa', fontWeight: 'bold', display: 'block', marginTop: 10 }}>
                    Daily claim (share of base daily cap)
                  </span>
                  <span style={{ fontSize: 11, color: '#888', display: 'block', marginTop: 6, lineHeight: 1.4 }}>
                    {itemToBuy.description || shadowDescription(itemToBuy.shadowRarity || 'common')}
                    <br />
                    Wave 1 · Gift2u Elves · 5% royalties · max {itemToBuy.maxPerWallet || 5}/wallet
                    {!itemToBuy.mintLive ? ' · candy machine not live yet' : ''}
                  </span>
                </>
              ) : itemToBuy.isRushMint || String(itemToBuy.id || '').startsWith('rush_') ? (
                <>
                  Mint <strong>{itemToBuy.name}</strong> for{' '}
                  <strong style={{ color: '#14F195' }}>{itemToBuy.price} SOL</strong>?
                  <br />
                  <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 'bold', display: 'block', marginTop: 10 }}>
                    Raises max daily taps (Energy)
                  </span>
                  <span style={{ fontSize: 11, color: '#888', display: 'block', marginTop: 6, lineHeight: 1.4 }}>
                    {itemToBuy.description || rushDescription(itemToBuy.rushRarity || 'common')}
                    <br />
                    Wave 1 · Gift2u Elves · 5% royalties · max {itemToBuy.maxPerWallet || 5}/wallet
                    {!itemToBuy.mintLive ? ' · candy machine not live yet' : ''}
                  </span>
                </>
              ) : itemToBuy.isEchoMint || String(itemToBuy.id || '').startsWith('echo_') ? (

                <>
                  Mint <strong>{itemToBuy.name}</strong> for{' '}
                  <strong style={{ color: '#14F195' }}>{itemToBuy.price} SOL</strong>?
                  <br />
                  <span style={{ fontSize: 12, color: '#67e8f9', fontWeight: 'bold', display: 'block', marginTop: 10 }}>
                    Always-on tap multiplier (G2Ushards)
                  </span>
                  <span style={{ fontSize: 11, color: '#888', display: 'block', marginTop: 6, lineHeight: 1.4 }}>
                    {itemToBuy.description || echoDescription(itemToBuy.echoRarity || 'common')}
                    <br />
                    Wave 1 · Gift2u Elves · 5% royalties · max {itemToBuy.maxPerWallet || 5}/wallet
                    {!itemToBuy.mintLive ? ' · candy machine not live yet' : ''}
                  </span>
                </>
              ) : itemToBuy.isFateMint || String(itemToBuy.id || '').startsWith('fate_') ? (
                <>
                  Mint <strong>{itemToBuy.name}</strong> for{' '}
                  <strong style={{ color: '#14F195' }}>{itemToBuy.price} SOL</strong>?
                  <br />
                  <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 'bold', display: 'block', marginTop: 10 }}>
                    Luck jackpot multi on tap G2Ushards
                  </span>
                  <span style={{ fontSize: 11, color: '#888', display: 'block', marginTop: 6, lineHeight: 1.4 }}>
                    {itemToBuy.description || fateDescription(itemToBuy.fateRarity || 'common')}
                    <br />
                    Wave 1 · Gift2u Elves · 5% royalties · max {itemToBuy.maxPerWallet || 5}/wallet
                    {!itemToBuy.mintLive ? ' · candy machine not live yet' : ''}
                  </span>
                </>
              ) : itemToBuy.isStarMint || itemToBuy.id === 'star_badge' ? (
                <>
                  Mint <strong>{itemToBuy.name}</strong> for{' '}
                  <strong style={{ color: '#14F195' }}>{itemToBuy.price} SOL</strong>?
                </>
              ) : itemToBuy.isNftMint || itemToBuy.id === 'locksmith' ? (
                <>
                  Mint <strong>{itemToBuy.name}</strong> for{' '}
                  <strong style={{ color: '#14F195' }}>{itemToBuy.price} SOL</strong>?
                  <br />
                  <span style={{ fontSize: 12, color: '#14F195', fontWeight: 'bold', display: 'block', marginTop: 10 }}>
                    Free wall climbs + Walk2u shoes
                  </span>
                  <span style={{ fontSize: 11, color: '#888', display: 'block', marginTop: 6, lineHeight: 1.4 }}>
                    Wave 1 · Gift2u Elves · max {LOCKSMITH_WAVE1.maxPerWallet}/wallet
                  </span>
                </>
              ) : (
                <>Do you want to buy <strong>{itemToBuy.name}</strong>?</>
              )}
            </p>
           
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => setShowConfirmModal(false)}
                style={{ flex: 1, padding: '12px', background: '#333', color: '#fff', borderRadius: '10px', border: 'none', fontWeight: 'bold' }}
              >
                Cancel
              </button>
              <button
                disabled={(() => {
                  if (itemToBuy.isShadowMint || String(itemToBuy.id || '').startsWith('shadow_')) {
                    return (
                      !itemToBuy.mintLive ||
                      !canAffordShadow(itemToBuy.shadowRarity || 'common')
                    );
                  }
                  if (itemToBuy.isRushMint || String(itemToBuy.id || '').startsWith('rush_')) {
                    return (
                      !itemToBuy.mintLive ||
                      !canAffordRush(itemToBuy.rushRarity || 'common')
                    );
                  }
                  if (itemToBuy.isEchoMint || String(itemToBuy.id || '').startsWith('echo_')) {
                    return (
                      !itemToBuy.mintLive ||
                      !canAffordEcho(itemToBuy.echoRarity || 'common')
                    );
                  }
                  if (itemToBuy.isFateMint || String(itemToBuy.id || '').startsWith('fate_')) {
                    return (
                      !itemToBuy.mintLive ||
                      !canAffordFate(itemToBuy.fateRarity || 'common')
                    );
                  }
                  if (itemToBuy.isNftMint || itemToBuy.id === 'locksmith') {
                    return !canAffordLocksmithMint;
                  }
                  return false;
                })()}
                onClick={() => {
                  if (itemToBuy.isShadowMint || String(itemToBuy.id || '').startsWith('shadow_')) {
                    if (
                      !itemToBuy.mintLive ||
                      !canAffordShadow(itemToBuy.shadowRarity || 'common')
                    )
                      return;
                    setShowConfirmModal(false);
                    handleShadowMint(itemToBuy.shadowRarity || 'common');
                    return;
                  }
                  if (itemToBuy.isRushMint || String(itemToBuy.id || '').startsWith('rush_')) {
                    if (
                      !itemToBuy.mintLive ||
                      !canAffordRush(itemToBuy.rushRarity || 'common')
                    )
                      return;
                    setShowConfirmModal(false);
                    handleRushMint(itemToBuy.rushRarity || 'common');
                    return;
                  }
                  if (itemToBuy.isEchoMint || String(itemToBuy.id || '').startsWith('echo_')) {
                    if (
                      !itemToBuy.mintLive ||
                      !canAffordEcho(itemToBuy.echoRarity || 'common')
                    )
                      return;
                    setShowConfirmModal(false);
                    handleEchoMint(itemToBuy.echoRarity || 'common');
                    return;
                  }
                  if (itemToBuy.isFateMint || String(itemToBuy.id || '').startsWith('fate_')) {
                    if (
                      !itemToBuy.mintLive ||
                      !canAffordFate(itemToBuy.fateRarity || 'common')
                    )
                      return;
                    setShowConfirmModal(false);
                    handleFateMint(itemToBuy.fateRarity || 'common');
                    return;
                  }
                  if (
                    (itemToBuy.isNftMint || itemToBuy.id === 'locksmith') &&
                    !canAffordLocksmithMint
                  ) {
                    return;
                  }
                  setShowConfirmModal(false);
                  if (itemToBuy.isNftMint || itemToBuy.id === 'locksmith') {
                    handleLocksmithMint();
                  } else if (itemToBuy.price) {
                    handlePremiumBuy(itemToBuy);
                  } else {
                    handleShardBuy(itemToBuy);
                  }
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: (() => {
                    if (itemToBuy.isShadowMint || String(itemToBuy.id || '').startsWith('shadow_')) {
                      return !itemToBuy.mintLive ||
                        !canAffordShadow(itemToBuy.shadowRarity || 'common')
                        ? '#444'
                        : '#4ade80';
                    }
                    if (itemToBuy.isRushMint || String(itemToBuy.id || '').startsWith('rush_')) {
                      return !itemToBuy.mintLive ||
                        !canAffordRush(itemToBuy.rushRarity || 'common')
                        ? '#444'
                        : '#4ade80';
                    }
                    if (itemToBuy.isEchoMint || String(itemToBuy.id || '').startsWith('echo_')) {
                      return !itemToBuy.mintLive ||
                        !canAffordEcho(itemToBuy.echoRarity || 'common')
                        ? '#444'
                        : '#4ade80';
                    }
                    if (itemToBuy.isFateMint || String(itemToBuy.id || '').startsWith('fate_')) {
                      return !itemToBuy.mintLive ||
                        !canAffordFate(itemToBuy.fateRarity || 'common')
                        ? '#444'
                        : '#4ade80';
                    }
                    if (
                      (itemToBuy.isNftMint || itemToBuy.id === 'locksmith') &&
                      !canAffordLocksmithMint
                    )
                      return '#444';
                    return '#4ade80';
                  })(),
                  color: '#000',
                  borderRadius: '10px',
                  border: 'none',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                {itemToBuy.isShadowMint || String(itemToBuy.id || '').startsWith('shadow_')
                  ? !itemToBuy.mintLive
                    ? 'Mint soon'
                    : canAffordShadow(itemToBuy.shadowRarity || 'common')
                      ? `Mint Shadow ${itemToBuy.rarity || ''}`
                      : 'Need more SOL'
                  : itemToBuy.isRushMint || String(itemToBuy.id || '').startsWith('rush_')
                  ? !itemToBuy.mintLive
                    ? 'Mint soon'
                    : canAffordRush(itemToBuy.rushRarity || 'common')
                      ? `Mint Rush ${itemToBuy.rarity || ''}`
                      : 'Need more SOL'
                  : itemToBuy.isEchoMint || String(itemToBuy.id || '').startsWith('echo_')
                    ? !itemToBuy.mintLive
                      ? 'Mint soon'
                      : canAffordEcho(itemToBuy.echoRarity || 'common')
                        ? `Mint Echo ${itemToBuy.rarity || ''}`
                        : 'Need more SOL'
                  : itemToBuy.isFateMint || String(itemToBuy.id || '').startsWith('fate_')
                    ? !itemToBuy.mintLive
                      ? 'Mint soon'
                      : canAffordFate(itemToBuy.fateRarity || 'common')
                        ? `Mint Fate ${itemToBuy.rarity || ''}`
                        : 'Need more SOL'
                    : itemToBuy.isNftMint
                      ? canAffordLocksmithMint
                        ? 'Mint GiftLocksmith'
                        : 'Need more SOL'
                      : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Marketplace;