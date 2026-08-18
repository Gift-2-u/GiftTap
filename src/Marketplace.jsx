import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { DB_PLAYER_ID } from './playerIdentity';
import { Connection, PublicKey, Keypair, Transaction, SystemProgram, ComputeBudgetProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { keypairFromMnemonic } from './solanaWallet';
import {
  mintLocksmithWave1,
  LOCKSMITH_WAVE1,
  minSolForLocksmithMint,
  getWalletSolBalance,
  assertWalletCanMintLocksmith,
  publicKeyFromSecret,
} from './mintLocksmith';
import {
  FATE_CM,
  mintFateWave1,
  minSolForFateMint,
  assertWalletCanMintFate,
  isFateMintLive,
  loadFateCmConfig,
} from './mintFate';
import { fateDescription } from './fate';
import { ShopGlyph } from './shopIcons';
import {
  applyWeeklyBoostBuy,
  getUtcWeekId,
  mergeInventoryWeekly,
  mergeInventoriesPreferConsumed,
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
  openMysteryGift,
  badgeCatalogForBackpack,
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
import {
  hasSecureSession,
  ensureSecureSession,
  secureShopBuy,
  secureMysteryOpen,
  secureBackpackActivate,
  securePremiumGrant,
} from './secureApi';
import WalletNftSection from './WalletNftSection';
import { listGiftNfts } from './locksmith';

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

const Marketplace = ({ balance, setBalance, stats, setStats, setEnergy, player, tgUser, playerWallet, decryptedPhrase, initialTab, onInitialTabConsumed }) => {
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

  // Custom Pop-up State
  const [txStatus, setTxStatus] = useState({ show: false, loading: false, message: '', success: false });

  // Initialize local inventory from stats so the UI updates instantly
  const [localInventory, setLocalInventory] = useState(stats?.inventory || {});
  /** Backpack categories: boost | badges | nft */
  const [backpackCat, setBackpackCat] = useState('boost');
  const [walletNftCount, setWalletNftCount] = useState(0);
  const [walletNftRefresh, setWalletNftRefresh] = useState(0);
  const [mysteryBusy, setMysteryBusy] = useState(false);
  // NEW: Track daily usage from the database stats
  const [dailyUsage, setDailyUsage] = useState(stats?.daily_usage || {});

  /** Game wallet SOL — gate NFT mints (Locksmith + Fate) */
  const [walletSol, setWalletSol] = useState(null);
  const [walletSolLoading, setWalletSolLoading] = useState(false);
  const [fateCmReady, setFateCmReady] = useState(false);
  const minMintSol = minSolForLocksmithMint();
  const walletUnlocked = Boolean(decryptedPhrase);
  const canAffordLocksmithMint =
    walletUnlocked &&
    walletSol != null &&
    Number.isFinite(walletSol) &&
    walletSol >= minMintSol;

  const canAffordFate = (rarityKey) => {
    if (!walletUnlocked || walletSol == null || !Number.isFinite(walletSol)) return false;
    return walletSol >= minSolForFateMint(rarityKey);
  };

  useEffect(() => {
    let cancelled = false;
    loadFateCmConfig().then(() => {
      if (!cancelled) setFateCmReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);


  // Count on-chain GiftLocksmith NFTs for backpack badge + NFT tab
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
    if (stats?.inventory) {
      // Prefer lower shop counts so a lagging parent inventory (battery:1)
      // cannot resurrect a charge that was just USE'd (local 0).
      // Buys still work: after buy both sides rise together via setStats.
      setLocalInventory((prev) =>
        mergeInventoriesPreferConsumed(
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

  // Refresh SOL when player opens NFTs tab (or wallet address changes)
  useEffect(() => {
    if (activeTab !== 'nft') return;
    const addr = playerWallet && String(playerWallet).trim();
    if (!addr || addr.length < 32) {
      setWalletSol(null);
      return;
    }
    let cancelled = false;
    setWalletSolLoading(true);
    getWalletSolBalance(addr)
      .then((sol) => {
        if (!cancelled) setWalletSol(sol);
      })
      .catch(() => {
        if (!cancelled) setWalletSol(null);
      })
      .finally(() => {
        if (!cancelled) setWalletSolLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, playerWallet]);

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
      name: '60-Second Frenzy',
      desc: '2x Payout per energy',
      duration: '60 Seconds',
      cost: 700,
      iconFrom: '#ff6b35',
      iconTo: '#7c1d12',
      iconRing: 'rgba(255,107,53,0.45)',
      iconGlow: 'rgba(255,107,53,0.25)',
    },
    {
      id: 'battery',
      name: 'Expanded Battery',
      desc: '+1,000 Max Energy',
      duration: 'Until UTC midnight',
      cost: 750,
      iconFrom: '#4ade80',
      iconTo: '#14532d',
      iconRing: 'rgba(74,222,128,0.4)',
      iconGlow: 'rgba(74,222,128,0.2)',
    },
    {
      id: 'heavy',
      name: 'Heavy Hands',
      desc: '2x Efficiency (Drains 2x, Pays 2x)',
      duration: 'Until UTC midnight',
      cost: 750,
      iconUrl: '/shop/heavy-hands.svg',
      iconFrom: '#3f1f1a',
      iconTo: '#1a0f0c',
      iconRing: 'rgba(234,90,71,0.45)',
      iconGlow: 'rgba(234,90,71,0.2)',
    },
    {
      id: 'refill',
      name: 'Instant Refill',
      desc: 'Fills energy to max',
      duration: 'Instant',
      cost: 300,
      iconFrom: '#facc15',
      iconTo: '#854d0e',
      iconRing: 'rgba(250,204,21,0.45)',
      iconGlow: 'rgba(250,204,21,0.25)',
    },
  ];

  /** SOL boosts only — not NFTs */
  const premiumListings = [
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
      boost: '+2,000 daily energy boost (3,000 total)',
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
      boost: '+5,000 daily energy boost (6,000 total)',
      duration: '7 Days',
      price: 0.03,
      currency: 'SOL',
      iconFrom: '#38bdf8',
      iconTo: '#0c4a6e',
      iconRing: 'rgba(56,189,248,0.5)',
      iconGlow: 'rgba(14,165,233,0.3)',
    },
    {
      id: 'crate',
      name: 'The Vault Drop',
      type: 'Misc',
      rarity: 'Legendary',
      boost: '+50,000 Shards',
      duration: 'Instant',
      price: 0.05,
      currency: 'SOL',
      iconUrl: '/shop/G2Ushard.png',
      iconFrom: '#2a2030',
      iconTo: '#121018',
      iconRing: 'rgba(251,191,36,0.5)',
      iconGlow: 'rgba(255,215,0,0.25)',
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
      id: 'shard_badge',
      name: 'Shard Badge',
      type: 'Misc',
      rarity: 'Rare',
      boost: 'Equip on Fate NFT socket',
      perks: [
        'Sockets into Fate badge hole',
        'Shows on Fate instantly (in-game)',
        'Trade on Badge market (P2P SOL)',
        '1 free badge per unequipped unit',
      ],
      attributes: [
        { trait_type: 'Type', value: 'Shard Badge' },
        { trait_type: 'Utility', value: 'Fate socket' },
        { trait_type: 'Slot', value: '1 per Fate' },
        { trait_type: 'Trade', value: 'Badge market' },
      ],
      description:
        'Shard Badge fills the Fate socket. Not a weekly season prize — buy here or trade with players. Equip from Pack → NFT on a Fate you own.',
      duration: 'Permanent · equip / unequip anytime',
      price: 0.02,
      currency: 'SOL',
      iconUrl: '/shop/G2Ushard.png',
      imageUrl: '/shop/G2Ushard.png',
      iconFrom: '#422006',
      iconTo: '#1c1917',
      iconRing: 'rgba(251,191,36,0.55)',
      iconGlow: 'rgba(251,191,36,0.3)',
      isShardBadge: true,
    },
];

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
        '1 Fate per wallet (equip one)',
        'Chance of jackpot multi on tap G2Ushards',
        'Rarity border + Shard Badge socket (1)',
        live
          ? `Wave 1 live · ${c.priceSol} SOL`
          : 'Wave 1 candy machine — mint opens when live',
      ],
      attributes: [
        { trait_type: 'Collection', value: 'Gift2u Elves' },
        { trait_type: 'Class', value: 'Fate' },
        { trait_type: 'Role', value: 'Luck' },
        { trait_type: 'Generation', value: 'Gen 1' },
        { trait_type: 'Rarity', value: c.label },
        { trait_type: 'Type', value: 'Utility' },
        { trait_type: 'Utility', value: 'Tap jackpot (G2Ushards)' },
        { trait_type: 'Badge Slot', value: '1' },
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

  const nftListings = [
    {
      id: 'locksmith',
      name: 'GiftLocksmith',
      type: 'NFT',
      rarity: 'Rare',
      collection: 'Gift2u Elves',
      boost: 'Unlocks Shard Swap (G2Ushards → G2U) with better fees',
      perks: [
        'Unlocks Shard Swap immediately (skip Level 5 + Swap Badge)',
        '4% fee in G2U vs 10% free path',
        'Higher daily swap cap',
        'Vault better APY (coming soon)',
      ],
      attributes: [
        { trait_type: 'Collection', value: 'Gift2u Elves' },
        { trait_type: 'Class', value: 'GiftLocksmith' },
        { trait_type: 'Generation', value: 'Gen 1' },
        { trait_type: 'Rarity', value: 'Rare' },
        { trait_type: 'Wave', value: '1 of 3' },
        { trait_type: 'Utility', value: 'Shard Swap + Vault' },
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
  ];

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
        setLocalInventory(newInventory);
        if (setStats) {
          setStats((prev) => ({
            ...prev,
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
        return;
      }

      // Legacy client write (until full cutover / if no session JWT)
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
  const handleLocksmithMint = async () => {
    // Block before any status that looks like a live mint — no SOL = no network call
    if (!decryptedPhrase) {
      setTxStatus({
        show: true,
        loading: false,
        message: '❌ Unlock your game wallet first (Menu / wallet settings).',
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
      setWalletSol(sol);

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
        setWalletSol(after);
      } catch {
        /* ignore */
      }

      setTxStatus({
        show: true,
        loading: false,
        message: `✅ GiftLocksmith minted!\nAsset: ${result.asset.slice(0, 8)}…\nOpen Pack → NFT to see it.`,
        success: true,
      });
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
          setWalletSol(sol);
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
        message: '❌ Unlock your game wallet first (Menu / wallet settings).',
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
        setWalletSol(await getWalletSolBalance(signerAddress));
      } catch {
        /* ignore */
      }
      setTxStatus({
        show: true,
        loading: false,
        message: `✅ Fate ${label} minted!\nAsset: ${result.asset.slice(0, 8)}…\nOpen Pack → NFT to see it.`,
        success: true,
      });
      setWalletNftRefresh((n) => n + 1);
    } catch (err) {
      console.error('Fate mint error', err);
      try {
        const addr =
          (decryptedPhrase && publicKeyFromSecret(decryptedPhrase)) || playerWallet;
        if (addr) setWalletSol(await getWalletSolBalance(String(addr)));
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

  const handlePremiumBuy = async (item) => {
    if (item?.isFateMint || String(item?.id || '').startsWith('fate_')) {
      return handleFateMint(item.fateRarity || 'common');
    }
    if (item?.isNftMint || item?.id === 'locksmith') {
      return handleLocksmithMint();
    }


    // Open the pop-up immediately in a loading state
    setTxStatus({ show: true, loading: true, message: `Initiating purchase for ${item.name}...`, success: false });

    try {
      // 1. Get Secret Key (Now pulling securely from React State, not local storage)
      const storedSecret = decryptedPhrase;
      if (!storedSecret) {
        throw new Error("Secret key not found. Please unlock your wallet in settings.");
      }

      // 2. Setup Connection & Keypair
      const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=538f6c8f-c773-46a2-939c-6d48c75b2226", 'confirmed');
      
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
        setLocalInventory(newInventory);
        if (setStats) {
          setStats({
            ...stats,
            inventory: newInventory,
            has_made_purchase: true,
          });
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

      setTxStatus({ show: true, loading: false, message: `✅ Success! ${item.name} purchased. Check your Tasks to claim your reward!`, success: true });
      setTimeout(() => setTxStatus(prev => ({ ...prev, show: false })), 3000);

    } catch (err) {
      console.error("Purchase Error:", err);
      setTxStatus({ show: true, loading: false, message: `❌ Error: ${err.message}`, success: false });
    }
  };

  // --- 3. USING ITEMS FROM THE BACKPACK (Starts the Clock) ---
  const handleUseItem = async (item) => {
    if (!localInventory[item.id] || localInventory[item.id] <= 0) return;

    // NEW: Check if this item has already been used today UTC
    const todayStr = getTodayUTCString();
    if (dailyUsage[item.id] === todayStr && item.id !== 'refill' && item.id !== 'crate') {
      setTxStatus({ show: true, loading: false, message: `❌ You have already used a ${item.name} today. Wait until UTC midnight.`, success: false });
      setTimeout(() => setTxStatus(prev => ({ ...prev, show: false })), 3000);
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
        const data = await secureBackpackActivate(item.id);
        const weekId = getUtcWeekId();
        const prevQty = Math.max(0, Math.floor(Number(localInventory[item.id]) || 0));
        let inv = { ...(data.inventory || {}) };
        // Force consume: explicit 0 so later merges cannot resurrect via missing-key
        const serverQty = Math.max(0, Math.floor(Number(inv[item.id]) || 0));
        let nextQty = serverQty;
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
        // Always force-consume this charge in UI (even if server lag)
        authInv[item.id] = 0;
        delete authInv[item.id];
        authInv = applyShopQtyAuthority(authInv, {
          ...authInv,
          [item.id]: 0,
        });

        const todayUse = getTodayUTCString();
        const nextDailyUsage = {
          ...(data.daily_usage || dailyUsage || {}),
          ...(item.id !== 'refill' && item.id !== 'crate'
            ? { [item.id]: todayUse }
            : {}),
        };
        authInv.daily_usage = nextDailyUsage;

        setLocalInventory({ ...authInv });
        setDailyUsage(nextDailyUsage);
        if (data.shard_balance != null) setBalance(Number(data.shard_balance));
        if (item.id === 'refill' || data.last_energy != null) {
          const en =
            data.last_energy != null ? Number(data.last_energy) : 500;
          if (setEnergy) setEnergy(Math.min(500, Math.max(0, en)));
        }
        if (setStats) {
          setStats((prev) => {
            // Prefer consumed over any stale parent inventory
            let next = mergeInventoriesPreferConsumed(
              prev?.inventory || {},
              authInv,
              weekId,
            );
            next = applyShopQtyAuthority(next, authInv);
            next.daily_usage = nextDailyUsage;
            return {
              ...prev,
              ...data.updates,
              last_energy:
                data.last_energy != null
                  ? Number(data.last_energy)
                  : prev.last_energy,
              inventory: next,
              daily_usage: nextDailyUsage,
            };
          });
        }

        // Re-fetch ground truth; still force this item consumed if server lagged
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
            // Prefer the lower of local-consumed vs server (ghost owned fix)
            cleaned = mergeInventoriesPreferConsumed(authInv, cleaned, weekId);
            cleaned[item.id] = 0;
            delete cleaned[item.id];
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
                inventory: mergeInventoriesPreferConsumed(
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
            item.id === 'refill'
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
    if (item.id === 'frenzy') dbUpdates.frenzy_expires = new Date(now + 60 * 1000).toISOString();
   
    // Battery and Heavy Hands expire at end of current UTC day
    if (item.id === 'battery') dbUpdates.energy_boost_expires = midnightUtcTonight.toISOString();
    if (item.id === 'heavy') dbUpdates.efficiency_expires = midnightUtcTonight.toISOString();
    if (item.id === 'refill') {
      dbUpdates.last_energy = 500; // ENERGY_CAP battery pool
      if (setEnergy) setEnergy(500);
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
    if (item.id === 'crate') {
      dbUpdates.shard_balance = balance + 50000;
      setBalance(prev => prev + 50000); // Instant, no timer needed
    }
    if (item.id === 'x2_boost') {
      dbUpdates.premium_multiplier = 2;
      dbUpdates.premium_multiplier_expires = sevenDayExpireUtc.toISOString();
    }
    if (item.id === 'x3_boost') {
      dbUpdates.premium_multiplier = 3;
      dbUpdates.premium_multiplier_expires = sevenDayExpireUtc.toISOString();
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
          inventory: mergeInventoriesPreferConsumed(
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


  // --- Mystery Gift: burn badges for weighted prize ---
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
    setTxStatus({ show: true, loading: true, message: 'Opening Mystery Gift...', success: false });
    try {
      if (hasSecureSession()) {
        const data = await secureMysteryOpen(tier);
        const inv = data.inventory || {};
        if (data.shard_balance != null) setBalance(Number(data.shard_balance));
        setLocalInventory(inv);
        if (setStats) {
          setStats((prev) => ({
            ...prev,
            inventory: applyServerInventoryAuthority(
              prev?.inventory || {},
              inv,
              getUtcWeekId(),
            ),
          }));
        }
        setTxStatus({
          show: true,
          loading: false,
          message: `🎁 Mystery Gift: ${data.reward?.label || 'opened'}`,
          success: true,
        });
        setTimeout(() => setTxStatus((p) => ({ ...p, show: false })), 3500);
        return;
      }

      const bal = Number(balance) || 0;
      const baseInv = buildFullInventory({});
      const result = openMysteryGift(baseInv, tier, bal);
      if (result.error) throw new Error(result.error);
      let inv = result.inv;
      let nextBal = bal;
      if (result.balanceDelta) {
        nextBal = Math.round((bal + Number(result.balanceDelta)) * 1000) / 1000;
      }
      const updates = {
        inventory: inv,
        last_updated: new Date().toISOString(),
      };
      if (result.balanceDelta) updates.shard_balance = nextBal;
      const { error } = await supabase
        .from('players')
        .update(updates)
        .eq(DB_PLAYER_ID, String(user.id));
      if (error) throw error;
      if (result.balanceDelta) setBalance(nextBal);
      setLocalInventory(inv);
      if (setStats) {
        setStats((prev) => ({
          ...prev,
          inventory: applyServerInventoryAuthority(
            prev?.inventory || {},
            inv,
            getUtcWeekId(),
          ),
        }));
      }
      setTxStatus({
        show: true,
        loading: false,
        message: `🎁 Mystery Gift: ${result.reward?.label || 'opened'}`,
        success: true,
      });
      setTimeout(() => setTxStatus((p) => ({ ...p, show: false })), 3500);
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

  // --- BACKPACK: shop boosts + badges (not wall/swap metadata keys) ---
  const SHOP_ITEM_IDS = new Set(allItems.map((i) => i.id));
  const BADGE_IDS = new Set(BADGE_ITEM_IDS);
  const backpackBoostItems = allItems.filter((item) => Number(localInventory[item.id]) > 0);
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
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100050 }}>
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
                const isDisabled = isActive || !canAfford;

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
                      <span style={{ color: '#888', fontSize: '9px' }}>⏱️ {item.duration}</span>
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
                            : canAfford
                              ? '#4ade80'
                              : '#333',
                          color: isActive ? '#fff' : canAfford ? '#000' : '#666',
                          border: 'none',
                          padding: '6px 0',
                          borderRadius: '6px',
                          fontWeight: 'bold',
                          fontSize: '12px',
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isActive ? 'Active' : canAfford ? 'Buy' : 'Need shards'}
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
            {/* Phone: 4/row · Desktop: 6/row */}
            <div
              className="grid grid-cols-4 md:grid-cols-6"
              style={{ gap: 6 }}
            >
              {nftListings.map((item) => (
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
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
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
                    const isUsedToday = dailyUsage[item.id] === currentTodayStr;
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
                  onInventoryChange={(inv) => {
                    setLocalInventory(inv);
                    if (typeof setStats === 'function') {
                      setStats((prev) => ({ ...(prev || {}), inventory: inv }));
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
                    Burn badges to open. One open = one burn cost (pick a tier).
                    Odds shown below. Website gift can use the same rules later.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {Object.keys(MYSTERY_BOX_COSTS).map((tier) => {
                      const meta = BADGE_TIERS[tier];
                      const need = MYSTERY_BOX_COSTS[tier];
                      const have = badgeCounts[tier] || 0;
                      const ok = have >= need;
                      return (
                        <button
                          key={tier}
                          type="button"
                          disabled={!ok || mysteryBusy}
                          onClick={() => handleOpenMystery(tier)}
                          style={{
                            background: ok ? '#1c1e22' : '#111',
                            border: `1px solid ${ok ? meta.color : '#333'}`,
                            borderRadius: 12,
                            padding: 10,
                            color: ok ? '#fff' : '#555',
                            cursor: ok && !mysteryBusy ? 'pointer' : 'not-allowed',
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            opacity: ok ? 1 : 0.55,
                          }}
                        >
                          {meta.image ? (
                            <img
                              src={meta.image}
                              alt={meta.name}
                              width={40}
                              height={40}
                              style={{
                                width: 40,
                                height: 40,
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
                            <div style={{ fontWeight: 'bold', fontSize: 12, color: meta.color }}>
                              Burn {need} {meta.name.replace(' Badge', '')}
                            </div>
                            <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                              You have {have}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 10, fontSize: 10, color: '#666', lineHeight: 1.45 }}>
                    <strong style={{ color: '#888' }}>Odds by badge burned</strong>
                    {' '}(Game Guide → Mystery Gift)
                    <div style={{ marginTop: 6, overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, color: '#aaa' }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', padding: '2px 4px', color: '#888' }}>Prize</th>
                            <th style={{ padding: '2px 4px', color: '#cd7f32' }}>🥉#4–10</th>
                            <th style={{ padding: '2px 4px', color: '#c0c0c0' }}>🥈#3</th>
                            <th style={{ padding: '2px 4px', color: '#ffd700' }}>🥇#2</th>
                            <th style={{ padding: '2px 4px', color: '#67e8f9' }}>💎#1</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            ['Exclusive NFT', 1, 2, 5, 12],
                            ['Bonus G2U Tokens', 10, 20, 35, 50],
                            ['Premium Boost', 14, 23, 30, 28],
                            ['Free Boost', 35, 30, 20, 10],
                            ['G2Ushards (Bulk)', 40, 25, 10, 0],
                          ].map((row) => (
                            <tr key={row[0]}>
                              <td style={{ padding: '2px 4px', textAlign: 'left' }}>{row[0]}</td>
                              {row.slice(1).map((p, i) => (
                                <td key={i} style={{ padding: '2px 4px', textAlign: 'center' }}>
                                  {p}%
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
                  Shard Badge (Fate socket)
                </div>
                <p style={{ color: '#666', fontSize: 11, margin: '0 0 8px', lineHeight: 1.35 }}>
                  Equip on Fate from Pack → NFT. Buy in Shop (SOL) or trade below.
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
                        Owned ×{getShardBadgeCount(localInventory)} · free ×
                        {getFreeShardBadgeCount(localInventory)} (not on Fate)
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
                    <p style={{ fontSize: 12, margin: 0 }}>No Shard Badge yet.</p>
                    <p style={{ fontSize: 11, color: '#666', margin: '4px 0 0' }}>
                      Buy in Premium / Shop or from Badge market.
                    </p>
                  </div>
                )}

                <div style={{ color: '#ffd700', fontWeight: 'bold', fontSize: 13, marginTop: 4 }}>
                  Weekly season badges
                </div>
                <p style={{ color: '#666', fontSize: 11, margin: '0 0 4px', lineHeight: 1.35 }}>
                  From Ranks → Weekly (top 10 eligible · ≥1,050). Sell in Badge market below.
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
                      Finish top 10 eligible on Ranks → Weekly (≥1,050 score) to win one.
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
                  inventory={localInventory}
                  onInventoryChange={(inv) => {
                    setLocalInventory(inv);
                    if (setStats) {
                      setStats((prev) => ({ ...prev, inventory: inv }));
                    }
                  }}
                  notify={(msg) => window.alert?.(msg)}
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

      {/* --- NFT detail popup (large image + mint) --- */}
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
              padding: 14,
              borderRadius: 16,
              border: '2px solid #9945FF',
              width: '100%',
              maxWidth: 420,
              maxHeight: 'min(94vh, 720px)',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
            }}
          >
            {/* Square art — room left for attributes */}
            <div
              style={{
                width: '100%',
                maxWidth: 280,
                aspectRatio: '1',
                margin: '0 auto 8px',
                borderRadius: 12,
                overflow: 'hidden',
                background: '#111',
                border: '1px solid #333',
                flexShrink: 0,
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
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                nftDetail.image
              )}
            </div>
            <div style={{ textAlign: 'center', marginBottom: 6, flexShrink: 0 }}>
              <div style={{ color: '#a78bfa', fontSize: 11, fontWeight: 'bold' }}>
                {nftDetail.collection} · {nftDetail.rarity}
              </div>
              <h3
                style={{
                  color: '#ffd700',
                  margin: '2px 0 4px',
                  fontSize: 17,
                  lineHeight: 1.25,
                }}
              >
                {nftDetail.name}
              </h3>
              {/* Description only — no separate boost/perks (already covered for Fate) */}
              {nftDetail.description ? (
                <p
                  style={{
                    color: '#aaa',
                    fontSize: 10,
                    margin: '4px 0 0',
                    lineHeight: 1.4,
                    textAlign: 'left',
                  }}
                >
                  {nftDetail.description}
                </p>
              ) : nftDetail.boost ? (
                <p
                  style={{
                    color: '#14F195',
                    fontSize: 11,
                    margin: 0,
                    lineHeight: 1.35,
                  }}
                >
                  🔓 {nftDetail.boost}
                </p>
              ) : null}
            </div>

            {/* Attributes — primary info under description */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                textAlign: 'left',
                background: '#111',
                borderRadius: 10,
                border: '1px solid #333',
                padding: '10px 10px',
                marginBottom: 8,
              }}
            >
              <div style={{ color: '#888', fontSize: 10, fontWeight: 'bold', marginBottom: 8 }}>
                ATTRIBUTES
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 6,
                }}
              >
                {(nftDetail.attributes || []).map((a) => (
                  <div
                    key={`${a.trait_type}-${a.value}`}
                    style={{
                      background: '#1a1a1a',
                      borderRadius: 8,
                      padding: '6px 8px',
                      minWidth: 0,
                    }}
                  >
                    <div style={{ color: '#777', fontSize: 9, lineHeight: 1.25 }}>{a.trait_type}</div>
                    <div
                      style={{
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 'bold',
                        lineHeight: 1.3,
                        wordBreak: 'break-word',
                      }}
                    >
                      {a.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer always visible — price + actions */}
            <div style={{ flexShrink: 0 }}>
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
                    {nftDetail.isFateMint && !nftDetail.mintLive ? ' · CM soon' : ''}
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
                    if (nftDetail.isFateMint && !nftDetail.mintLive) return true;
                    return false;
                  })()}
                  onClick={() => {
                    if (nftDetail.isNftMint) {
                      if (walletSolLoading) return;
                      if (!walletUnlocked) {
                        setTxStatus({
                          show: true,
                          loading: false,
                          message: 'Unlock your game wallet first (Menu / wallet settings).',
                          success: false,
                        });
                        return;
                      }
                      if (nftDetail.isFateMint && !nftDetail.mintLive) {
                        setTxStatus({
                          show: true,
                          loading: false,
                          message: 'Mint opens when the candy machine is live. Check back soon.',
                          success: false,
                        });
                        return;
                      }
                      const afford = nftDetail.isFateMint
                        ? canAffordFate(nftDetail.fateRarity || 'common')
                        : canAffordLocksmithMint;
                      if (!afford) {
                        const need = nftDetail.isFateMint
                          ? minSolForFateMint(nftDetail.fateRarity || 'common')
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
                      if (nftDetail.isFateMint && !nftDetail.mintLive) return '#444';
                      return 'linear-gradient(90deg, #9945FF, #14F195)';
                    })(),
                    color: (() => {
                      if (!nftDetail.isNftMint) return '#000';
                      if (nftDetail.isFateMint && !nftDetail.mintLive) return '#888';
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
                        ? 'Unlock wallet'
                        : nftDetail.isFateMint && !nftDetail.mintLive
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
              {itemToBuy.isFateMint || String(itemToBuy.id || '').startsWith('fate_') ? (
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
              ) : itemToBuy.isNftMint || itemToBuy.id === 'locksmith' ? (
                <>
                  Mint <strong>{itemToBuy.name}</strong> for{' '}
                  <strong style={{ color: '#14F195' }}>{itemToBuy.price} SOL</strong>?
                  <br />
                  <span style={{ fontSize: 12, color: '#14F195', fontWeight: 'bold', display: 'block', marginTop: 10 }}>
                    Unlocks Shard Swap (G2Ushards → G2U)
                  </span>
                  <span style={{ fontSize: 11, color: '#888', display: 'block', marginTop: 6, lineHeight: 1.4 }}>
                    Instant access (skip Level 5 + Swap Badge) · 4% fee vs 10% free · higher daily cap · Wave 1 · max{' '}
                    {LOCKSMITH_WAVE1.maxPerWallet}/wallet
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
                {itemToBuy.isFateMint || String(itemToBuy.id || '').startsWith('fate_')
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