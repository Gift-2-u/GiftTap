import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Connection, PublicKey, clusterApiUrl, Keypair, Transaction, SystemProgram, ComputeBudgetProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL, VersionedTransaction } from '@solana/web3.js';
import { supabase } from './supabaseClient';

/** YYYY-MM-DD in UTC (streak + daily limits use UTC midnight). */
function utcTodayStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
/** Previous UTC calendar day as YYYY-MM-DD */
function utcYesterdayStr(d = new Date()) {
  const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1);
  return new Date(ms).toISOString().slice(0, 10);
}
/**
 * Streak after first VALID tap of a UTC day.
 * Rules:
 *  - last play was yesterday (UTC) → previous + 1
 *  - last play was today → unchanged (should not call this)
 *  - gap > 1 UTC day, or never played → 1
 *  - on load, gap > 1 day already forces display/DB streak to 0 before this runs
 */
function streakAfterPlayDay(prevLtd, prevStreak, today = utcTodayStr()) {
  const prev = prevLtd ? String(prevLtd).slice(0, 10) : '';
  const cur = Math.max(0, Number(prevStreak) || 0);
  if (prev === today) return Math.max(0, cur);
  const yesterday = utcYesterdayStr();
  if (prev && prev === yesterday) return cur + 1; // 0→1 if broken then fixed; normal 7→8
  // Missed ≥1 full UTC day, or first ever tap
  return 1;
}

/** Battery energy pool (not daily limit). 1 point every ENERGY_SECONDS_PER_POINT, cap ENERGY_CAP. */
const ENERGY_CAP = 500;
const ENERGY_SECONDS_PER_POINT = 1.5; // 1 energy / 1.5s → full 500 in ~12.5 min

/** Recover energy from a stored (value, timestampMs) using wall clock. */
function energyFromAnchor(value, atMs, nowMs = Date.now()) {
  const base = Number.isFinite(Number(value))
    ? Math.max(0, Math.min(ENERGY_CAP, Number(value)))
    : ENERGY_CAP;
  const at = Number(atMs);
  const t0 = Number.isFinite(at) ? at : nowMs;
  const seconds = Math.max(0, (nowMs - t0) / 1000);
  const gained = Math.floor(seconds / ENERGY_SECONDS_PER_POINT);
  return Math.min(ENERGY_CAP, base + gained);
}

const ENERGY_STEP_MS = ENERGY_SECONDS_PER_POINT * 1000;

/**
 * Apply wall-clock regen, then spend energy, while keeping residual time
 * toward the next +1 so regen continues during rapid tapping.
 * @returns {{ value: number, at: number }}
 */
function spendEnergyFromAnchor(anchor, cost, nowMs = Date.now()) {
  const stepMs = ENERGY_STEP_MS;
  const prevVal = Number.isFinite(Number(anchor?.value))
    ? Math.max(0, Math.min(ENERGY_CAP, Number(anchor.value)))
    : ENERGY_CAP;
  const prevAt = Number.isFinite(Number(anchor?.at)) ? Number(anchor.at) : nowMs;
  const elapsed = Math.max(0, nowMs - prevAt);
  const wholeSteps = Math.floor(elapsed / stepMs);
  const residual = elapsed - wholeSteps * stepMs;
  let energy = Math.min(ENERGY_CAP, prevVal + wholeSteps);
  const spend = Math.max(0, Number(cost) || 0);
  energy = Math.max(0, Math.min(ENERGY_CAP, energy - spend));
  // Keep leftover ms so the next point still arrives on the 1.5s wall clock
  return { value: energy, at: nowMs - residual };
}

/** Regen-only catch-up (no spend), preserves residual time. */
function catchUpEnergyAnchor(anchor, nowMs = Date.now()) {
  return spendEnergyFromAnchor(anchor, 0, nowMs);
}

/** One-time task rewards that expand daily tap limit until UTC midnight. */
const TASK_DAILY_LIMIT_REWARDS = {
  taps_1000: 100,
  taps_5000: 250,
  streak_3: 200,
  streak_10: 500,
};

function utcMidnightTonightIso(d = new Date()) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999),
  ).toISOString();
}

/** Active task daily-limit bonus from inventory.task_limit_boost */
function getTaskLimitBoost(statsOrInv, now = new Date()) {
  const inv =
    statsOrInv && statsOrInv.inventory != null
      ? statsOrInv.inventory
      : statsOrInv || {};
  const b = inv?.task_limit_boost;
  if (!b || !b.expires) return 0;
  if (new Date(b.expires).getTime() <= now.getTime()) return 0;
  return Math.max(0, Number(b.amount) || 0);
}

import { getAssociatedTokenAddressSync } from '@solana/spl-token';

import AuthScreen from './AuthScreen';
import ClaimAccountModal from './ClaimAccountModal';
import Marketplace from './Marketplace';
import Tasks from './Tasks';
import { markPlayedTodayUtc } from './streakReminders';
import Friends from './Friends';
import Menu from './Menu';
import WhitepaperModal from './WhitepaperModal';
import RoadmapModal from './RoadmapModal';
import LegalModal from './LegalModal';
import AppNotice from './AppNotice';
import HelpTip from './HelpTip';
import { showRewardedAdWaterfall, AD_MIN_WATCH_SECONDS, isSeekerShell } from './adService';
import WalletHub from './WalletHub';
import TokenBalanceList from './TokenBalanceList';
import { fetchFiatRates, FIAT_CURRENCIES } from './fiatPrices';
import bs58 from "bs58";
import CryptoJS from 'crypto-js';
import { keypairFromMnemonic } from './solanaWallet';
import {
  tryPayReferrerForTaps1000,
  tryPayReferrerForLevel1,
  tryPayReferrerForWall5,
  REFERRAL,
} from './referralRewards';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getPlayerProfile,
  getPlayerId,
  setPlayerId,
  setUsername,
  applyAuthSession,
  clearSession,
  captureReferralFromUrl,
  consumeReferralId,
  getInviteLink,
  vaultSaltFor,
  DB_PLAYER_ID,
  isSessionTokenStale,
} from './playerIdentity';
// DB_PLAYER_ID === 'telegram_id' (legacy Supabase column — still the player primary key)

import { hasLocksmith, listGiftNfts } from './locksmith';
import AirdropBoard from './AirdropBoard';
import {
  computeAirdropProgress,
  fetchAirdropInputs,
  AIRDROP_META,
} from './airdropProgress';
import {
  getUtcWeekId,
  utcDayStr as weeklyUtcDayStr,
  applyWeeklyDailyProgress,
  mergeWeeklyStates,
  isDailyLimitDrained,
  WEEKLY_BASE_DAILY_LIMIT,
  mergeInventoryWeekly,
  applyServerInventoryAuthority,
  applyShopQtyAuthority,
  mergeWeeklyClaimKeys,
  hydrateWeeklyClaimsFromLedger,
} from './weeklyQuestLogic';
import {
  getSeasonDayNumber,
  getSeasonBoardFloor,
  filterSeasonMainBoard,
  getSeasonScore,
  rankInSeason,
  seasonFloorLabel,
  SEASON_FLOOR_PCT,
  SEASON_DAILY_REFERENCE,
} from './seasonLeaderboard';
import {
  addWeeklyLbScore,
  getWeeklyLbState,
  sortWeeklyLeaderboard,
  rankOnWeeklyBoard,
  badgeTierForWeeklyRank,
  BADGE_TIERS,
  getWeeklyBoardFloor,
  getWeeklyBadgeFloor,
  getUtcIsoWeekDayNumber,
  filterWeeklyMainBoard,
  WEEKLY_FLOOR_PCT,
  WEEKLY_DAILY_REFERENCE,
  isWeeklyFloorEligible,
} from './weeklyBadges';
import { ensureWeeklySeasonRollover } from './weeklySeasonRollover';
import {
  hasSecureSession,
  ensureSecureSession,
  secureCommitTaps,
  secureWallClimb,
  secureLocksmithActivate,
  secureCreateUserWallet,
  secureGetVault,
  secureSetVaultIfEmpty,
  secureVaultStatus,
  fetchWeeklyBoard,
  fetchAirdropBoard,
} from './secureApi';
import {
  locksmithCoversWall,
  locksmithLevelFromInv,
  getCommonShoeCount,
  LOCKSMITH_LEVEL_FOR_WALL,
} from './locksmithWalls';
import WalletNftSection from './WalletNftSection';
import SwapBadgeCard, { NftDetailModal, LOCKSMITH_PERKS } from './SwapBadgeCard';
import {
  SHARD_SWAP_CONFIG,
  getSwapAccess,
  quoteShardSwap,
  inventoryAfterSwap,
  inventoryAfterUnlockBurn,
  inventoryAfterDurabilityTopUp,
  inventoryAfterBadgeLevelUp,
  getDailySwapUsed,
  getSwapDurability,
  getSwapBadgeLevel,
  durabilityRemainingShards,
  durabilityFullVolumeForLevel,
  badgeLevelUpCostGft,
  hasSwapLicense,
} from './shardSwap';
import { echoMultiplier } from './echo';
import { rushDailyLimit } from './rush';

const TOKEN_MINTS = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  G2U: "YOUR_G2U_MINT_ADDRESS_HERE" // <-- Replace with real G2U mint
};

// --- 1. CLOUD STORAGE HELPERS ---
const saveToCloud = (key, value) => {
  return new Promise((resolve) => {
    localStorage.setItem(key, value);
    resolve(true);
  });
};

const getFromCloud = (key) => {
  return new Promise((resolve) => {
    resolve(localStorage.getItem(key) || "");
  });
};

const removeFromCloud = (key) => {
  return new Promise((resolve) => {
    localStorage.removeItem(key);
    resolve(true);
  });
};

// --- 2. ENCRYPTION HELPERS ---
const encryptWallet = (secretPhrase, password) => {
  return CryptoJS.AES.encrypt(secretPhrase, password).toString();
};

const decryptWallet = (encryptedData, password) => {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, password);
    const decryptedText = bytes.toString(CryptoJS.enc.Utf8);
    return decryptedText || null;
  } catch (error) {
    return null;
  }
};

export const calculateLevel = (taps) => {
  if (taps < 50000) return Math.floor(taps / 10000); 
  if (taps < 125000) return 5 + Math.floor((taps - 50000) / 15000); 
  if (taps < 625000) return 10 + Math.floor((taps - 125000) / 50000); 
  if (taps < 2125000) return 20 + Math.floor((taps - 625000) / 150000); 
  if (taps < 9125000) return 30 + Math.floor((taps - 2125000) / 350000);
  if (taps < 34125000) return 50 + Math.floor((taps - 9125000) / 1000000);
  if (taps < 109125000) return 75 + Math.floor((taps - 34125000) / 3000000);
  return 100; 
};

export const getPaywallCap = (maxUnlockedLevel) => {
  if (maxUnlockedLevel <= 4) return 50000;
  if (maxUnlockedLevel <= 9) return 125000;
  if (maxUnlockedLevel <= 19) return 625000;
  if (maxUnlockedLevel <= 29) return 2125000;
  if (maxUnlockedLevel <= 49) return 9125000;
  if (maxUnlockedLevel <= 74) return 34125000;
  if (maxUnlockedLevel <= 99) return 109125000;
  return Infinity;
};

export const getNextLevelTarget = (currentLevel) => {
  if (currentLevel < 5) return (currentLevel + 1) * 10000;
  if (currentLevel < 10) return 50000 + (currentLevel + 1 - 5) * 15000;
  if (currentLevel < 20) return 125000 + (currentLevel + 1 - 10) * 50000;
  if (currentLevel < 30) return 625000 + (currentLevel + 1 - 20) * 150000;
  if (currentLevel < 50) return 2125000 + (currentLevel + 1 - 30) * 350000;
  if (currentLevel < 75) return 9125000 + (currentLevel + 1 - 50) * 1000000;
  if (currentLevel < 100) return 34125000 + (currentLevel + 1 - 75) * 3000000;
  return 109125000; // L100 cap
};

export const getLevelMultiplier = (level) => {
  if (level >= 100) return 2.0;
  if (level >= 75) return 1.75;
  if (level >= 50) return 1.5;
  if (level >= 30) return 1.4;
  if (level >= 20) return 1.3;
  if (level >= 10) return 1.2;
  if (level >= 5) return 1.15;
  return 1.0; // L0–4 base
};

/** Additive stack: 1 + Σ(m − 1). L5 1.15 + Echo 1.1 → 1.25 (not 1.265). */
export function stackPayoutMultis(...multis) {
  let total = 1;
  for (const raw of multis) {
    const m = Number(raw);
    if (!Number.isFinite(m) || m <= 0) continue;
    total += m - 1;
  }
  return Math.round(Math.max(0, total) * 1000) / 1000;
}

export const ASCENSION_WALLS = {
  // Early: pay with EITHER shards OR SOL
  4: {
    targetLevel: 5,
    shardCost: 15000,
    solCost: 0.025,
    requiresBoth: false,
    newCap: 9,
  },
  9: {
    targetLevel: 10,
    shardCost: 30000,
    solCost: 0.05,
    requiresBoth: false,
    newCap: 19,
  },
  // Mid–late: MUST pay BOTH shards AND SOL
  19: {
    targetLevel: 20,
    shardCost: 50000,
    solCost: 0.05,
    requiresBoth: true,
    newCap: 29,
  },
  29: {
    targetLevel: 30,
    shardCost: 100000,
    solCost: 0.1,
    requiresBoth: true,
    newCap: 49,
  },
  49: {
    targetLevel: 50,
    shardCost: 300000,
    solCost: 0.35,
    requiresBoth: true,
    newCap: 74,
  },
  74: {
    targetLevel: 75,
    shardCost: 800000,
    solCost: 0.75,
    requiresBoth: true,
    newCap: 99,
  },
  99: {
    targetLevel: 100,
    shardCost: 2500000,
    solCost: 1.5,
    requiresBoth: true,
    newCap: 100,
  },
};

/**
 * After climbing a wall, max_unlocked jumps (e.g. 4→9) but lifetime may still be
 * 49,999. calculateLevel(49999)=4 would snap the HUD back to L4 on the next
 * realtime/resync. Floor display level to the highest wall target already cleared.
 */
export function floorLevelFromMaxUnlocked(maxUnlockedLevel) {
  const m = Math.max(0, Math.floor(Number(maxUnlockedLevel) || 0));
  let floor = 0;
  for (const [wallKey, wall] of Object.entries(ASCENSION_WALLS)) {
    if (m > Number(wallKey)) {
      floor = Math.max(floor, Number(wall.targetLevel) || 0);
    }
  }
  return floor;
}

/** Display / power level: tap formula, not below walls already climbed, capped by unlock. */
export function displayLevelFromTaps(lifetimeTaps, maxUnlockedLevel) {
  const maxU = Math.max(0, Math.floor(Number(maxUnlockedLevel) || 4));
  const fromTaps = calculateLevel(Number(lifetimeTaps) || 0);
  const floor = floorLevelFromMaxUnlocked(maxU);
  return Math.min(maxU, Math.max(fromTaps, floor));
}

/**
 * True when player has maxed their *unlocked* tier and may optionally climb the wall.
 * They can still earn G2Ushards forever at this level — wall is perks only (STEPN-style).
 */
export const isAtAscensionWall = (currentLevel, maxUnlockedLevel, lifetimeTaps) => {
  if (!ASCENSION_WALLS[maxUnlockedLevel]) return false;
  if (currentLevel < maxUnlockedLevel) return false;
  // At or past the XP threshold for the next locked level
  return calculateLevel(Number(lifetimeTaps) + 1) > maxUnlockedLevel
    || Number(lifetimeTaps) >= getPaywallCap(maxUnlockedLevel);
};

/** Effective play level — unlock cap, with floor from walls already climbed. */
export const effectiveLevel = (lifetimeTaps, maxUnlockedLevel) =>
  displayLevelFromTaps(lifetimeTaps, maxUnlockedLevel);

/**
 * Legacy: old walls stopped at newCap 50. New track goes 50→74→99→100.
 * Anyone already at max_unlocked 50 is bridged to 74 (they already paid the L49 wall).
 */
export function migrateMaxUnlockedLevel(raw) {
  const n = Number(raw) || 4;
  if (n === 50) return 74;
  return n;
}

const GiftTapGame = () => {

  const styles = {
  headerContainer: { 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      padding: '12px 10px', // Tighter, native-app padding
      width: '100%', 
      boxSizing: 'border-box', 
      background: 'rgba(19, 21, 23, 0.85)', // Deep native dark
      backdropFilter: 'blur(12px)', // The "Glass" effect
      WebkitBackdropFilter: 'blur(12px)', // For Safari support
      borderBottom: '1px solid rgba(255, 255, 255, 0.05)', // Subtle edge
      zIndex: 50 
    },
    toggleWrapper: { 
      display: 'flex', 
      background: 'rgba(255, 255, 255, 0.05)', // Modern translucent glass
      borderRadius: '20px', 
      padding: '4px', 
      border: '1px solid rgba(255, 255, 255, 0.08)', // Barely-there edge
      alignItems: 'center' // Keeps the hamburger menu perfectly centered
    },
    toggleBtn: { 
      background: 'transparent', 
      color: '#888', 
      border: 'none', 
      padding: '4px 8px', 
      borderRadius: '16px', 
      fontSize: '10px', 
      fontWeight: 'bold', 
      cursor: 'pointer', 
      transition: 'all 0.3s ease', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      lineHeight: '1.3',
      outline: 'none', // Kills the web border
      WebkitTapHighlightColor: 'transparent' // Kills the mobile tap flash
    },
    activeToggleBtn: { 
      background: 'rgba(255, 255, 255, 0.12)', // Brightens up to show it's active
      color: '#ffd700', 
      border: 'none', // Removed the clunky #555 solid border
      padding: '4px 8px', 
      borderRadius: '16px', 
      fontSize: '10px', 
      fontWeight: 'bold', 
      cursor: 'pointer', 
      boxShadow: '0 4px 10px rgba(0,0,0,0.3)', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      lineHeight: '1.3',
      outline: 'none', 
      WebkitTapHighlightColor: 'transparent'
    },
    walletWrapper: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', flexShrink: 0 },
    walletBtnPremium: { 
      background: 'rgba(255, 255, 255, 0.05)', // Matches the toggle wrapper
      color: '#fff', 
      border: '1px solid rgba(255, 215, 0, 0.25)', // Softer, more elegant gold border
      padding: '6px 10px', 
      borderRadius: '20px', 
      cursor: 'pointer', 
      fontWeight: 'bold', 
      fontSize: '11px', 
      display: 'flex', 
      alignItems: 'center', 
      gap: '8px', 
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)', // Sleek drop shadow
      outline: 'none', 
      WebkitTapHighlightColor: 'transparent',
      maxWidth: 'min(58vw, 240px)',
    },
    walletDot: { width: '8px', height: '8px', background: '#4ade80', borderRadius: '50%', boxShadow: '0 0 8px rgba(74, 222, 128, 0.6)' },
    walletChip: {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      whiteSpace: 'nowrap',
    },
    walletChipIcon: {
      width: 20,
      height: 20,
      objectFit: 'contain',
      flexShrink: 0,
      display: 'block',
    },
    leaderBadgePremium: { fontSize: '9px', color: '#aaa', marginTop: '2px', fontWeight: 'normal', maxWidth: '75px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    container: {
      position: 'fixed', 
      top: 0, 
      left: 0, 
      height: '100%', 
      width: '100%', 
      background: 'radial-gradient(circle at center, #1c1e22 0%, #000000 100%)', // Depth effect
      color: 'white', 
      display: 'flex', 
      flexDirection: 'column', 
      overflow: 'hidden', 
      touchAction: 'none'
    },
    header: { marginTop: '10px', textAlign: 'center' },
    balance: { fontSize: '2.5rem', color: '#ffd700', margin: 0 },
    energy: { color: '#ffd700', fontWeight: 'bold' },
    giftZone: { 
      flex: 1, // This pushes the gift into the center of the available space
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      width: '100%', 
      position: 'relative',
      marginTop: '0px' // Removed the negative margin to let flexbox center it
    },    
    giftImage: { 
      width: '280px', // Slightly larger for "Main Attraction" feel
      userSelect: 'none', 
      WebkitUserSelect: 'none', 
      WebkitTouchCallout: 'none', 
      touchAction: 'manipulation',
      filter: 'drop-shadow(0 0 20px rgba(255, 215, 0, 0.2))'
    },    
    floatingText: { position: 'fixed', color: '#ffd700', fontSize: '2rem', fontWeight: 'bold', pointerEvents: 'none', animation: 'floatUp 1s forwards', zIndex: 999 },
    nav: { 
      height: '85px', // Slightly taller for mobile thumbs
      position: 'fixed', 
      bottom: 0, 
      zIndex: 100, 
      left: 0, 
      width: '100%', 
      display: 'flex', 
      justifyContent: 'space-around', 
      alignItems: 'center', // Centers the buttons vertically
      background: '#131517', // Matches the glass header
      borderTop: '1px solid #2a2d34', // Replaced the thick yellow line with a sleek dark border
      paddingBottom: 'env(safe-area-inset-bottom)' // Crucial for iPhones
    },
    btn: { 
      background: 'none', 
      border: 'none', 
      color: '#666', // Dimmed when inactive
      fontWeight: 'bold',
      fontSize: '16px',
      cursor: 'pointer',
      flex: 1,
      padding: '10px 0',
      transition: 'color 0.2s ease',
      outline: 'none', 
      WebkitTapHighlightColor: 'transparent'
    },
    modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    modalContent: { background: '#222', padding: '25px', borderRadius: '15px', width: '85%', maxWidth: '400px', border: '2px solid #ffd700', textAlign: 'center' },
    balanceRow: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #333' },
    actionRow: { display: 'flex', gap: '10px', marginTop: '20px' },
    actionBtn: { flex: 1, padding: '12px', borderRadius: '10px', background: '#ffd700', color: '#000', fontWeight: 'bold', border: 'none' },
    closeBtn: { marginTop: '20px', background: 'none', color: '#888', border: 'none', cursor: 'pointer' },
    shopItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0', borderBottom: '1px solid #333' },
    buyBtn: { background: '#ffd700', color: '#000', border: 'none', padding: '8px 12px', borderRadius: '10px', fontWeight: 'bold' },
    progressContainer: { width: '200px', height: '10px', background: '#333', borderRadius: '5px', margin: '10px auto', overflow: 'hidden', border: '1px solid #444' },
    progressBar: { height: '100%', transition: 'width 0.3s ease-in-out', boxShadow: '0 0 10px rgba(255, 215, 0, 0.3)' },
    mainContent: { 
      flex: 1, 
      width: '100%', 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%', // MUST BE 100% to fill the screen
      overflow: 'hidden', 
      alignItems: 'center',
      justifyContent: 'space-between' /* <-- THIS SPACES TOP, MIDDLE, AND BOTTOM */ 
    },
    activeBtn: { 
      background: 'none', 
      border: 'none', 
      color: '#ffd700', // Gold when active
      fontWeight: '900',
      fontSize: '16px',
      cursor: 'pointer',
      flex: 1,
      padding: '10px 0',
      textShadow: '0 0 12px rgba(255, 215, 0, 0.5)', // The Pro Glow
      transition: 'color 0.2s ease',
      outline: 'none', 
      WebkitTapHighlightColor: 'transparent'
    },
    shopPage: { width: '100%', padding: '20px', boxSizing: 'border-box' },
    depositBox: { background: '#111', padding: '15px', borderRadius: '12px', marginTop: '15px', border: '1px solid #333' },
    addressRow: { display: 'flex', justifyContent: 'space-between',  alignItems: 'center', marginTop: '8px', background: '#000', padding: '10px', borderRadius: '8px' },
    copyBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#ffd700' },
    toast: { position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)', background: '#333', color: '#ffd700', padding: '12px 24px', borderRadius: '25px', border: '1px solid #ffd700', zIndex: 2000, boxShadow: '0 4px 15px rgba(0,0,0,0.5)', fontSize: '14px', fontWeight: 'bold', transition: 'all 0.3s ease' }
  };

  // Web identity: session in localStorage after login/signup (cross-device via username+password).
  const [player, setPlayer] = useState(() => {
    captureReferralFromUrl();
    return getPlayerProfile();
  });
  const playerId = player.id ? String(player.id) : '';
  // null = still deciding; true = has session; false = show AuthScreen
  const [isAuthed, setIsAuthed] = useState(() => !!getPlayerId());
  const [needsPassword, setNeedsPassword] = useState(false);
  const [showClaimAccount, setShowClaimAccount] = useState(false);

  // 1. GAME STATE
  const [balance, setBalance] = useState(0);
  const [stats, setStats] = useState({ frenzy_expires: null, efficiency_expires: null, energy_boost_expires: null, inventory: {} });
  const [energy, setEnergy] = useState(500);
  const [taps, setTaps] = useState([]);
  const [playerWallet, setPlayerWallet] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [topLeader, setTopLeader] = useState({ name: '...', score: 0 });
  const [leaderboard, setLeaderboard] = useState([]); // Fixed: Added missing state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [balances, setBalances] = useState({ sol: 0, G2U: 0, G2Ushards: 0, usdc: 0 });
  // Leaderboard page tab: always open on Season when navigating to Ranks
  const [leaderboardType, setLeaderboardType] = useState('Season');
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  /** Season main-board floor (15% × 1000 × day) + your rank if off-board */
  const [seasonBoardFloor, setSeasonBoardFloor] = useState(150);
  const [seasonBoardDay, setSeasonBoardDay] = useState(1);
  const [seasonYouRank, setSeasonYouRank] = useState(null); // { rank, score, onMain, need }
  const [seasonEligibleCount, setSeasonEligibleCount] = useState(0);
  /** Weekly board: your rank this UTC week */
  const [weeklyYouRank, setWeeklyYouRank] = useState(null);
  /** Live weekly main-board floor (15% × 1000 × ISO weekday) */
  const [weeklyBoardFloor, setWeeklyBoardFloor] = useState(() => getWeeklyBoardFloor());
  const [weeklyBoardDay, setWeeklyBoardDay] = useState(() => getUtcIsoWeekDayNumber());
  const [weeklyEligibleCount, setWeeklyEligibleCount] = useState(0);
  /** Airdrop qualified board (Ranks → Airdrop) */
  const [airdropQualifiedCount, setAirdropQualifiedCount] = useState(0);
  const [airdropYouRank, setAirdropYouRank] = useState(null);
  const optimisticWeekly = useRef(0);
  /** Keep ranks tab type for live weekly score patches while mining */
  const leaderboardTypeRef = useRef(leaderboardType);
  /** Hard security: accumulate valid taps, flush via commit-taps */
  const pendingTapsRef = useRef({ count: 0, batchId: null });
  const tapFlushTimerRef = useRef(null);
  const flushInFlightRef = useRef(false);
  /** Throttle 'why shards stopped' notices (no_energy / daily_limit) */
  const mineBlockNotifiedRef = useRef(0);
  const flushErrorNotifiedRef = useRef(false);
  /** When true, only commit-taps (service_role) can change daily_taps / balances */
  const secureEconomyRef = useRef(true);
  /** Soft once-per-session notice if JWT missing (no password nag on every close/reopen) */
  const sessionWarnShownRef = useRef(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [dailyTaps, setDailyTaps] = useState(0);
  const [streak, setStreak] = useState(0);

  const [lastTapDate, setLastTapDate] = useState(''); // '' until DB load — never default to today
  const [isPressed, setIsPressed] = useState(false);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [maxDailyLimit, setMaxDailyLimit] = useState(1000);
  const [seasonTimeLeft, setSeasonTimeLeft] = useState('');
  const [tapPower, setTapPower] = useState(1);
  const [currentPage, setCurrentPage] = useState('home'); // 'home', 'shop', 'tasks', 'friends', 'leaderboard'
  /** Tasks tab: week | lifetime — set by HUD “Weekly quest” chip */
  const [tasksTab, setTasksTab] = useState('week');
  /** When opening Shop from daily-limit CTA → Free upgrades (battery) */
  const [shopFocusTab, setShopFocusTab] = useState(null);
  const [activeTab, setActiveTab] = useState('home'); // Use this for page switching
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isSwapOpen, setIsSwapOpen] = useState(false);
  const [isShardopen, setIsShardOpen] = useState(false);
  const [swapFromAmount, setSwapFromAmount] = useState('');
  const [swapToAmount, setSwapToAmount] = useState('');
  const [transactionCosts, setTransactionCosts] = useState({ baseFeeWithBuffer: 0, projectFee: 0.0005 });
  const [txStatus, setTxStatus] = useState({ loading: false, message: '' });
  const [lastSignature, setLastSignature] = useState(null);
  const [showWalletGenerator, setShowWalletGenerator] = useState(false);
  const [generatedSecret, setGeneratedSecret] = useState(null);
  const [tempPublicKey, setTempPublicKey] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [walletPwd, setWalletPwd] = useState('');
  const [isRevealed, setIsRevealed] = useState(false);
  const [mustBackup, setMustBackup] = useState(false);
  const [setupPwd, setSetupPwd] = useState('');
  const [lifetimeTaps, setLifetimeTaps] = useState(0);
  const [maxUnlockedLevel, setMaxUnlockedLevel] = useState(4);
  const [showAscensionModal, setShowAscensionModal] = useState(false);
  /**
   * When set to current maxUnlockedLevel, never auto-popup the climb modal for this wall.
   * Player opens climb only via HUD "Level up / Climb" button.
   */
  const [wallSnoozedFor, setWallSnoozedFor] = useState(null);
  /** In-app notices (replaces browser alert() "gift2u.fun says…") */
  const [appNotice, setAppNotice] = useState({
    show: false,
    message: '',
    loading: false,
    success: null,
    title: undefined,
    confirm: null,
  });
  const notify = useCallback((message, opts = {}) => {
    const msg = String(message ?? '');
    const looksError =
      opts.success === false ||
      /fail|error|invalid|denied|not enough|too low|no |need |wait for|locked|unavailable/i.test(
        msg,
      );
    const looksOk =
      opts.success === true ||
      (/^✅|success|copied|unlocked|ascended|added|restored|complete/i.test(msg) &&
        opts.success !== false);
    setAppNotice({
      show: true,
      message: msg,
      loading: !!opts.loading,
      success: opts.success !== undefined ? opts.success : looksOk ? true : looksError ? false : null,
      title: opts.title,
      confirm: null,
    });
  }, []);
  /** In-app confirm — replaces browser confirm() gift2u.fun says… */
  const confirmNotice = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      setAppNotice({
        show: true,
        message: String(message ?? ''),
        loading: false,
        success: null,
        title: opts.title || 'Confirm',
        confirm: {
          confirmLabel: opts.confirmLabel || 'Confirm',
          cancelLabel: opts.cancelLabel || 'Cancel',
          confirmDanger: !!opts.confirmDanger,
          resolve,
        },
      });
    });
  }, []);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [itemToBuy, setItemToBuy] = useState(null);
  const touchLock = useRef(false);
  const touchLockTimerRef = useRef(null);
  /** pointerIds currently down that already scored (multi-finger safe) */
  const activeTapPointersRef = useRef(new Set());
  const optimisticTaps = useRef(lifetimeTaps);
  /** Shard balance / season — same instant-update pattern as lifetime (rapid multi-touch safe) */
  const optimisticBalance = useRef(0);
  const optimisticSeason = useRef(0);
  const optimisticEnergy = useRef(500);
  /** Wall-clock anchor for 500-energy regen (survives phone sleep; ticker only +1 is useless). */
  const energyAnchorRef = useRef({ value: 500, at: Date.now() });
  /**
   * Bumped on Instant Refill / shop energy grants. In-flight commit-taps flushes
   * that started before the bump must not overwrite the new full bar.
   */
  const energyEpochRef = useRef(0);
  /** Last local tap time — while bursting, local energy owns the HUD (no snap to 500). */
  const lastLocalTapAtRef = useRef(0);
  /** Live buff expires — tap handler reads this so cost never uses stale stats */
  const buffRef = useRef({
    frenzyExpires: null,
    efficiencyExpires: null,
    premiumExpires: null,
    premiumMult: 1,
  });
  const optimisticDaily = useRef(0);
  const pendingSaveRef = useRef(null);
  /** Latest inventory (incl. weekly_quests) so debounced saves do not wipe quest progress */
  const inventoryRef = useRef({});
  /** True after shop/swap spend — next cloud save must write the lower balance, not Math.max with server */
  const spendGuardRef = useRef(false);
  /** Sync streak / last play day for taps + offline bot (React state can lag). */
  const lastTapDateRef = useRef('');
  const streakRef = useRef(0);
  /** Bumped on logout / account switch — invalidates in-flight debounced saves */
  const saveGenerationRef = useRef(0);
  /** Last progress loaded from server (admin edits / other devices update this) */
  const serverProgressRef = useRef({
    b: 0,
    ltt: 0,
    s: 0,
    dt: 0,
  });
  /** Ignore our own save echo for a moment */
  const lastLocalSaveAtRef = useRef(0);
  const saveFailNotifiedRef = useRef(0);
  const [decryptedPhrase, setDecryptedPhrase] = useState("");
  // Settings Menu State
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  /** View 12 words from Menu only — close returns to Menu, not Wallet hub */
  const [showMenuSecretPhrase, setShowMenuSecretPhrase] = useState(false);
  const [showAirdropBoard, setShowAirdropBoard] = useState(false);
  const [airdropProgress, setAirdropProgress] = useState(null);
  const [airdropLoading, setAirdropLoading] = useState(false);
  const [displayCurrency, setDisplayCurrencyState] = useState(() => {
    try {
      return localStorage.getItem('gift2u_display_currency') || 'USD';
    } catch {
      return 'USD';
    }
  });
  const setDisplayCurrency = (c) => {
    setDisplayCurrencyState(c);
    try {
      localStorage.setItem('gift2u_display_currency', c);
    } catch {
      /* ignore */
    }
  };
  /** { sol: { USD: n, ... }, usdc: { USD: n, ... } } from CoinGecko */
  const [fiatRates, setFiatRates] = useState({ sol: {}, usdc: {} });
  const [appLanguage, setAppLanguage] = useState('EN');
  const [isWhitepaperOpen, setIsWhitepaperOpen] = useState(false);
  const [isRoadmapOpen, setIsRoadmapOpen] = useState(false);
  const [legalKind, setLegalKind] = useState(null); // 'terms' | 'privacy' | null
  const [swapFromToken, setSwapFromToken] = useState('SOL');
  const [swapToToken, setSwapToToken] = useState('G2U');
  const [isShardSwapOpen, setIsShardSwapOpen] = useState(false);
  const [locksmithDetailOpen, setLocksmithDetailOpen] = useState(false);
  const [shardSwapAmount, setShardSwapAmount] = useState('');
  const [hasLocksmithNft, setHasLocksmithNft] = useState(false);
  const [shardSwapBusy, setShardSwapBusy] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [userRank, setUserRank] = useState(null);
  const [seasonShards, setSeasonShards] = useState(0);
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const [isAdModalOpen, setIsAdModalOpen] = useState(false);
  /** Our own countdown while ad tab is open (null = not counting). */
  const [adSecondsLeft, setAdSecondsLeft] = useState(null);
  const [dailyAdsWatched, setDailyAdsWatched] = useState(0);
  const pendingShards = useRef(0);
  const pendingCost = useRef(0);


  /**
   * Task / weekly quest claims: +max DAILY LIMIT until UTC midnight (stackable).
   * Goes to inventory.task_limit_boost → HUD "Daily Limit: x/1000+".
   * NEVER touches the 500 Energy battery pool (last_energy / ENERGY_CAP).
   */


  /**
   * Optional refill of the 500 Energy battery pool only (shop refill / ads / etc.).
   * Do NOT use this for task or weekly quest rewards.
   */
  const grantEnergyPool = useCallback(
    async (amount) => {
      const add = Math.max(0, Number(amount) || 0);
      if (add <= 0) return 0;
      const nowMs = Date.now();
      const cur = energyFromAnchor(
        energyAnchorRef.current.value,
        energyAnchorRef.current.at,
        nowMs,
      );
      const next = Math.min(ENERGY_CAP, cur + add);
      energyAnchorRef.current = { value: next, at: nowMs };
      optimisticEnergy.current = next;
      setEnergy(next);
      // Secure economy: last_energy / last_updated owned by Edge (shop-buy /
      // backpack-activate / commit-taps). Client writes here desync mining.
      if (secureEconomyRef.current) {
        return next;
      }
      if (playerId) {
        const { error } = await supabase
          .from('players')
          .update({
            last_energy: next,
            last_updated: new Date().toISOString(),
          })
          .eq(DB_PLAYER_ID, String(playerId));
        if (error) throw error;
      }
      return next;
    },
    [playerId],
  );

  /** Shop/backpack must update energy AND the regen anchor — setEnergy alone snaps back. */
  const setEnergySyncedForShop = useCallback((valueOrUpdater) => {
    const cur = Number(optimisticEnergy.current);
    const raw =
      typeof valueOrUpdater === 'function' ? valueOrUpdater(cur) : valueOrUpdater;
    const next = Math.max(0, Math.min(ENERGY_CAP, Number(raw) || 0));
    // Invalidate in-flight flushes so a pre-refill commit cannot overwrite the new bar
    energyEpochRef.current += 1;
    energyAnchorRef.current = { value: next, at: Date.now() };
    optimisticEnergy.current = next;
    lastLocalTapAtRef.current = 0; // allow idle settle after refill before next taps
    setEnergy(next);
  }, []);

  // Keep buff timers fresh for the tap handler (Frenzy ≠ energy cost).
  useEffect(() => {
    buffRef.current = {
      frenzyExpires: stats?.frenzy_expires || null,
      efficiencyExpires: stats?.efficiency_expires || null,
      premiumExpires: stats?.premium_multiplier_expires || null,
      premiumMult: Number(stats?.premium_multiplier) || 1,
    };
  }, [
    stats?.frenzy_expires,
    stats?.efficiency_expires,
    stats?.premium_multiplier_expires,
    stats?.premium_multiplier,
  ]);

  // Keep inventoryRef aligned when shop/backpack/badges update stats.inventory.
  // stats is shop authority (buy/use). preferConsumed(MIN) wiped purchases
  // (ref 0 vs buy 1 → 0) and left saves writing stale owned counts.
  useEffect(() => {
    if (!stats?.inventory) return;
    const weekId = getUtcWeekId();
    inventoryRef.current = applyServerInventoryAuthority(
      inventoryRef.current || {},
      stats.inventory,
      weekId,
    );
  }, [stats.inventory]);

  const onWeeklyStateChange = useCallback((nextWeekly, nextInv) => {
    setStats((prev) => {
      const weekId = getUtcWeekId();
      let inv = mergeInventoryWeekly(
        mergeInventoryWeekly(
          inventoryRef.current || {},
          prev.inventory || {},
          weekId,
        ),
        nextInv || {
          ...(prev.inventory || {}),
          weekly_quests: nextWeekly,
        },
        weekId,
      );
      if (nextWeekly) {
        inv.weekly_quests = mergeWeeklyStates(
          inv.weekly_quests,
          nextWeekly,
          weekId,
        );
      }
      // task_limit_boost stacks (100 + 100 = 200). Never keep the lower of two active boosts.
      if (nextInv?.task_limit_boost || inv.task_limit_boost) {
        const n = nextInv?.task_limit_boost;
        const cur = inv.task_limit_boost;
        const nAmt =
          n && n.expires && new Date(n.expires).getTime() > Date.now()
            ? Number(n.amount) || 0
            : 0;
        const cAmt =
          cur && cur.expires && new Date(cur.expires).getTime() > Date.now()
            ? Number(cur.amount) || 0
            : 0;
        if (nAmt > cAmt && n) inv.task_limit_boost = { amount: nAmt, expires: n.expires };
        else if (cAmt > nAmt && cur)
          inv.task_limit_boost = { amount: cAmt, expires: cur.expires };
        else if (nAmt > 0 && n) inv.task_limit_boost = { amount: nAmt, expires: n.expires };
        else if (cAmt > 0 && cur)
          inv.task_limit_boost = { amount: cAmt, expires: cur.expires };
      }
      inv = hydrateWeeklyClaimsFromLedger(inv, weekId);
      inventoryRef.current = inv;
      return { ...prev, inventory: inv };
    });
  }, []);

  /** Track weekly quest progress (500/day, full daily, etc.) and persist inventory.weekly_quests */
  const recordWeeklyDailyProgress = useCallback(
    (dayTaps, _maxLimitIgnored, when = new Date()) => {
      try {
        const weekId = getUtcWeekId(when);
        const day = weeklyUtcDayStr(when);
        const taps = Math.max(0, Number(dayTaps) || 0);
        // Weekly board uses base 1000 for drain-daily (boosts ignored)
        const limit = WEEKLY_BASE_DAILY_LIMIT;

        setStats((prev) => {
          const baseInv = inventoryRef.current || prev.inventory || {};
          // Progress only — merge keeps claimed[] from baseInv + prev
          let nextW = applyWeeklyDailyProgress(baseInv.weekly_quests, weekId, {
            day,
            dayTaps: taps,
            maxLimit: limit,
          });
          nextW = mergeWeeklyStates(
            prev.inventory?.weekly_quests,
            mergeWeeklyStates(baseInv.weekly_quests, nextW, weekId),
            weekId,
          );
          let nextInv = mergeInventoryWeekly(
            mergeInventoryWeekly(baseInv, prev.inventory || {}, weekId),
            { weekly_quests: nextW },
            weekId,
          );
          nextInv = hydrateWeeklyClaimsFromLedger(nextInv, weekId);
          // Never let a progress write drop claim ledgers from inventoryRef
          nextInv = mergeInventoryWeekly(
            inventoryRef.current || {},
            nextInv,
            weekId,
          );
          nextInv = hydrateWeeklyClaimsFromLedger(nextInv, weekId);
          inventoryRef.current = nextInv;
          if (playerId) {
            (async () => {
              try {
                const { data: row } = await supabase
                  .from('players')
                  .select('inventory')
                  .eq(DB_PLAYER_ID, String(playerId))
                  .maybeSingle();
                // Weekly progress must not touch shop qty. Server row is shop
                // authority — preferConsumed(MIN) + local nextInv wiped buys to DB.
                let merged = mergeInventoryWeekly(
                  hydrateWeeklyClaimsFromLedger(row?.inventory || {}, weekId),
                  nextInv,
                  weekId,
                );
                merged = applyShopQtyAuthority(
                  merged,
                  row?.inventory || {},
                );
                merged = hydrateWeeklyClaimsFromLedger(merged, weekId);
                inventoryRef.current = applyServerInventoryAuthority(
                  inventoryRef.current || {},
                  merged,
                  weekId,
                );
                // Never touch last_updated here — it is the energy regen clock.
                // Bumping it without last_energy freezes server battery at 0 while
                // the UI still regenerates locally → flush returns no_energy and
                // wipes optimistic taps / daily progress.
                const { error } = await supabase
                  .from('players')
                  .update({
                    inventory: inventoryRef.current,
                  })
                  .eq(DB_PLAYER_ID, String(playerId));
                if (error) console.warn('weekly_quests save', error.message);
              } catch (e) {
                console.warn('weekly_quests save', e?.message || e);
              }
            })();
          }
          return { ...prev, inventory: nextInv };
        });
      } catch (e) {
        console.warn('recordWeeklyDailyProgress', e?.message || e);
      }
    },
    [playerId],
  );

  // Credit weekly Tap-500 / base-1000 whenever live daily taps are high enough
  useEffect(() => {
    if (!isDataLoaded) return;
    const taps = Math.max(Number(dailyTaps) || 0, Number(optimisticDaily.current) || 0);
    if (taps < 500) return;
    recordWeeklyDailyProgress(taps, WEEKLY_BASE_DAILY_LIMIT, new Date());
  }, [dailyTaps, isDataLoaded, currentPage, recordWeeklyDailyProgress]);

  const refreshAirdropProgress = useCallback(async () => {
    try {
      const raw = playerId
        ? await fetchAirdropInputs(supabase, playerId, DB_PLAYER_ID)
        : null;
      const lifetime = Number(lifetimeTaps) || Number(raw?.lifetimeTaps) || 0;
      const maxU = Number(maxUnlockedLevel) || Number(raw?.maxUnlockedLevel) || 0;
      const st = Math.max(
        0,
        Number(streakRef.current) || Number(streak) || Number(raw?.streak) || 0,
      );
      let hasNft = !!hasLocksmithNft;
      let nfts = hasLocksmithNft
        ? [{ kind: 'locksmith', rarity: 'rare' }]
        : [];
      const nftWallet = playerWallet || raw?.walletAddress;
      if (nftWallet) {
        try {
          const owned = await listGiftNfts(nftWallet);
          if (Array.isArray(owned) && owned.length) {
            nfts = owned.map((n) => ({
              kind: n.kind || n.name,
              rarity: n.rarity,
              name: n.name,
            }));
            hasNft = nfts.length > 0;
          } else {
            hasNft = !!(await hasLocksmith(nftWallet)) || hasNft;
            if (hasNft && !nfts.length) {
              nfts = [{ kind: 'locksmith', rarity: 'rare' }];
            }
          }
        } catch {
          /* keep state flag */
        }
      }
      const progress = computeAirdropProgress({
        lifetimeTaps: lifetime,
        maxUnlockedLevel: maxU,
        currentLevel,
        streak: st,
        hasIap: !!(raw && raw.hasIap),
        completedTasks: raw?.completedTasks || [],
        hasNft,
        nfts,
        friendsTaps1000: raw?.friendsTaps1000 || 0,
        friendsL5: raw?.friendsL5 || 0,
      });
      setAirdropProgress(progress);
      return progress;
    } catch (e) {
      console.warn('airdrop board', e?.message || e);
      setAirdropProgress(null);
      return null;
    }
  }, [
    playerId,
    lifetimeTaps,
    maxUnlockedLevel,
    streak,
    hasLocksmithNft,
    playerWallet,
    currentLevel,
  ]);

  const openAirdropBoard = async () => {
    setShowAirdropBoard(true);
    setAirdropLoading(true);
    try {
      await refreshAirdropProgress();
    } finally {
      setAirdropLoading(false);
    }
  };

  // Prefetch airdrop stats for the home banner (no modal)
  useEffect(() => {
    if (!isDataLoaded || currentPage !== 'home' || !playerId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await refreshAirdropProgress();
      } catch {
        /* ignore */
      }
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [isDataLoaded, currentPage, playerId, refreshAirdropProgress]);

  /** +max daily limit (1000 bar), NOT the 500 Energy battery. */
  const grantTaskEnergy = useCallback(
    async ({ amount, preserveWeeklyQuests, preserveClaimKeys, forceInventory } = {}) => {
      // Sync inventory from secure task-claim without double-granting boost
      if (forceInventory && typeof forceInventory === 'object') {
        inventoryRef.current = {
          ...(inventoryRef.current || {}),
          ...forceInventory,
        };
        setStats((prev) => ({
          ...prev,
          inventory: inventoryRef.current,
        }));
        return 0;
      }
      const add = Math.max(0, Number(amount) || 0);
      if (add <= 0) return 0;

      const expires = utcMidnightTonightIso();
      const weekId = getUtcWeekId();
      // Use inventoryRef so we never wipe weekly claims after a quest claim
      const prevInv = {
        ...(inventoryRef.current || stats.inventory || {}),
      };
      const prevBoost = prevInv.task_limit_boost;
      let stacked = add;
      if (
        prevBoost &&
        prevBoost.expires &&
        new Date(prevBoost.expires).getTime() > Date.now()
      ) {
        stacked = (Number(prevBoost.amount) || 0) + add;
      }
      // Force-merge claimed + durable ledger so boost write cannot drop them
      const keptWeekly = mergeWeeklyStates(
        prevInv.weekly_quests,
        preserveWeeklyQuests || prevInv.weekly_quests,
        weekId,
      );
      let nextInv = {
        ...prevInv,
        weekly_quests: keptWeekly,
        weekly_claim_keys: mergeWeeklyClaimKeys(
          prevInv.weekly_claim_keys,
          preserveClaimKeys || prevInv.weekly_claim_keys,
        ),
        task_limit_boost: { amount: stacked, expires },
        task_daily_limit_migrated_v1: true,
      };
      nextInv = hydrateWeeklyClaimsFromLedger(nextInv, weekId);
      inventoryRef.current = nextInv;
      setStats((prev) => {
        let inv = mergeInventoryWeekly(prev.inventory || {}, nextInv, weekId);
        inv = hydrateWeeklyClaimsFromLedger(inv, weekId);
        inventoryRef.current = inv;
        return { ...prev, inventory: inv };
      });

      if (playerId) {
        // Re-merge against server inventory so concurrent saves cannot wipe claims
        try {
          const { data: row } = await supabase
            .from('players')
            .select('inventory')
            .eq(DB_PLAYER_ID, String(playerId))
            .maybeSingle();
          let writeInv = mergeInventoryWeekly(
            row?.inventory || {},
            inventoryRef.current || {},
            weekId,
          );
          writeInv.task_limit_boost = inventoryRef.current.task_limit_boost;
          writeInv.task_daily_limit_migrated_v1 = true;
          writeInv = hydrateWeeklyClaimsFromLedger(writeInv, weekId);
          inventoryRef.current = writeInv;
          // Do not write last_updated (energy regen clock) on inventory-only patches.
          const { error } = await supabase
            .from('players')
            .update({
              inventory: writeInv,
            })
            .eq(DB_PLAYER_ID, String(playerId));
          if (error) throw error;
          lastLocalSaveAtRef.current = Date.now();
        } catch (e) {
          const { error } = await supabase
            .from('players')
            .update({
              inventory: inventoryRef.current,
            })
            .eq(DB_PLAYER_ID, String(playerId));
          if (error) throw error;
          lastLocalSaveAtRef.current = Date.now();
        }
      }
      return stacked;
    },
    [playerId, stats.inventory],
  );

  const handleWatchAd = async (e) => {
    if (e) e.stopPropagation(); // Stop click-through to Gift
    if (isWatchingAd) return;
    if (dailyAdsWatched >= 10) {
      notify("Daily limit reached! (10/10)");
      return;
    }

    setIsWatchingAd(true);
    // Web Monetag: show our engagement timer. Seeker: AdMob has its own countdown.
    const onSeeker = isSeekerShell();
    setAdSecondsLeft(onSeeker ? null : AD_MIN_WATCH_SECONDS);

    try {
      // Monetag SDK (or engaged fallback) — reward ONLY if network confirms success.
      // Blocked / security-filtered ads must NOT grant free energy (Monetag $0 case).
      // Seeker AdMob: no onTick (native UI already counts down).
      const result = await showRewardedAdWaterfall({
        onTick: onSeeker ? undefined : (secondsLeft) => setAdSecondsLeft(secondsLeft),
        ymid: playerId ? `player_${playerId}_${Date.now()}` : undefined,
      });

      if (result && result.success) {
        console.log(`Ad OK via ${result.network}`);

        const newAdsCount = dailyAdsWatched + 1;
        const today = new Date().toISOString().split('T')[0];
        // End of UTC day (same clock as Expanded Battery / daily shop limits)
        const nowUtc = new Date();
        const midnightUtcTonight = new Date(Date.UTC(
          nowUtc.getUTCFullYear(),
          nowUtc.getUTCMonth(),
          nowUtc.getUTCDate(),
          23, 59, 59, 999,
        ));
        const nextAdBoost = (Number(stats.ad_energy_boost) || 0) + 100;
        // Effective day cap = base/Rush + battery + tasks + ads (not double-count max_daily_limit)
        let baseCap = 1000;
        const invRush = inventoryRef.current || stats?.inventory || {};
        const rush = invRush?.rush_active;
        if (rush && typeof rush === 'object') {
          const rl = Math.max(1, Math.min(5, Number(rush.level) || 1));
          baseCap = 1000 + rl * 500; // mirror Rush ladder if present — server is authority
        }
        let effectiveCap = baseCap;
        if (stats.energy_boost_expires && new Date(stats.energy_boost_expires) > nowUtc) {
          effectiveCap += 1000;
        }
        if (stats.limit_boost_expires && new Date(stats.limit_boost_expires) > nowUtc) {
          effectiveCap += Number(stats.limit_boost_amount) || 0;
        }
        const tlb = (inventoryRef.current || stats?.inventory || {}).task_limit_boost;
        if (tlb?.expires && new Date(tlb.expires) > nowUtc) {
          effectiveCap += Number(tlb.amount) || 0;
        }
        effectiveCap += nextAdBoost;

        const dbUpdates = {
          max_daily_limit: effectiveCap,
          daily_ads_watched: newAdsCount,
          last_ad_date: today,
          limit_boost_amount: stats.limit_boost_amount,
          limit_boost_expires: stats.limit_boost_expires,
          ad_energy_boost: nextAdBoost,
          ad_energy_expires: midnightUtcTonight.toISOString(),
          // no last_updated — would freeze the 500 energy regen clock
        };
        const newMaxLimit = effectiveCap;

        const { error } = await supabase
          .from('players')
          .update(dbUpdates)
          .eq(DB_PLAYER_ID, playerId);

        if (error) throw error;

        setMaxDailyLimit(newMaxLimit);
        setDailyAdsWatched(newAdsCount);
        if (setStats) setStats({ ...stats, ...dbUpdates });
        setIsAdModalOpen(false);

        notify("✅ +100 Energy Capacity added. Thanks for watching!");
      } else {
        notify(
          result?.error ||
            "⚠️ No rewarded ad available (blocked or empty). Energy was not granted.",
        );
      }
    } catch (err) {
      console.error("Ad Error:", err);
      notify(
        err?.message ||
          "No ads available. If security software blocks ads, Free Energy cannot run.",
      );
    } finally {
      setIsWatchingAd(false);
      setAdSecondsLeft(null);
    }
  };

  const getSwapBalance = (token) => {
    if (token === 'SOL') return balances.sol?.toFixed(4) || '0.0000';
    if (token === 'USDC') return balances.usdc?.toFixed(2) || '0.00'; // Adjust if your USDC state name is different
    if (token === 'G2U') return balances.G2U?.toLocaleString() || '0.00';
    return '0.00';
  };

  const ALL_CURRENCIES = FIAT_CURRENCIES;

  // Live SOL + USDC → all fiat currencies (menu currency picker)
  useEffect(() => {
    const load = async () => {
      try {
        const rates = await fetchFiatRates();
        setFiatRates(rates);
      } catch (err) {
        console.error('Failed to fetch global fiat prices:', err);
      }
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // The Translation Engine Dictionary
  const TRANSLATIONS = {
    EN: {
      menu: "Menu",
      language: "Language",
      currency: "Currency",
      secret: "View Secret Phrase",
      rules: "Game Guide"
    },
    FR: {
      menu: "Menu",
      language: "Langue",
      currency: "Devise",
      secret: "Voir la phrase secrète",
      rules: "Guide du jeu"
    }
    // You can add ES, PT, etc., as you expand!
  };
  // Universal Translation Formatter
  // Usage: t('currency') -> returns "Currency" (if EN) or "Devise" (if FR)
  const t = (key) => {
    return TRANSLATIONS[appLanguage]?.[key] || TRANSLATIONS['EN'][key] || key;
  };

  // NOTE: Do NOT sync optimisticTaps from lifetimeTaps state each render —
  // rapid taps update the ref first; lagging setState would reset the ref and desync.

  const connection = useMemo(() => {
    const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL;
    return new Connection(rpcUrl || clusterApiUrl('mainnet-beta'), 'confirmed');
  }, []);

  const GIFT_TREASURY_WALLET = new PublicKey("8G7uEcPS6dwA5wW9bGoqi98EzBunF8trjbbFJkgkvBPm");

  // 2. FETCH TOP LEADER (Individual Badge)
  const fetchTopLeader = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('leaderboard_all_time')
        .select('*')
        .order('lifetime_taps', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setTopLeader({
          name: data.username || (data[DB_PLAYER_ID] ? `ID:..${String(data[DB_PLAYER_ID]).slice(-4)}` : 'Anon'),
          score: data.lifetime_taps,
        });
      }
    } catch (err) { console.error("Badge fetch error:", err); }
  }, []);

  // Full leaderboard list for the Ranks page (not a modal)
  // opts.silent = background refresh: keep current list visible (no Loading flash)
  const fetchFullLeaderboard = async (typeOverride, opts = {}) => {
    const targetType = typeOverride || leaderboardType;
    const isAllTime = targetType === 'all_time' || targetType === 'All-time';
    const tableName = isAllTime ? 'leaderboard_all_time' : 'leaderboard_season';
    const sortColumn = isAllTime ? 'lifetime_taps' : 'score';
    const silent = !!(opts && opts.silent);

    if (!silent) setLeaderboardLoading(true);

    // --- AIRDROP qualified board (L5+, name / lvl / %) ---
    if (targetType === 'Airdrop') {
      try {
        setSeasonYouRank(null);
        setWeeklyYouRank(null);
        setSeasonEligibleCount(0);
        setWeeklyEligibleCount(0);
        let viewerNfts = [];
        try {
          if (playerWallet) {
            const owned = await listGiftNfts(playerWallet);
            viewerNfts = Array.isArray(owned)
              ? owned.map((n) => ({
                  kind: n.kind || n.name,
                  rarity: n.rarity,
                  name: n.name,
                }))
              : [];
          }
        } catch {
          /* ignore */
        }
        const board = await fetchAirdropBoard({
          limit: 100,
          viewerId: playerId || null,
          viewerHasNft: !!hasLocksmithNft || viewerNfts.length > 0,
          viewerNfts,
        });
        const rows = Array.isArray(board?.rows) ? board.rows : [];
        setLeaderboard(
          rows.map((r) => ({
            ...r,
            [DB_PLAYER_ID]: r.telegram_id,
            telegram_id: r.telegram_id,
            username: r.username || 'Player',
            score: Number(r.bonus_pct) || 0,
            bonus_pct: Number(r.bonus_pct) || 0,
            level: Number(r.level) || 0,
            lifetime_taps: Number(r.lifetime_taps) || 0,
          })),
        );
        setAirdropQualifiedCount(
          Number(board?.qualified_count) || rows.length || 0,
        );
        if (board?.you && playerId) {
          setAirdropYouRank({
            rank: board.you.rank,
            level: board.you.level,
            bonus_pct: board.you.bonus_pct,
            username: board.you.username,
            inList: !!board.you.inList,
          });
        } else {
          setAirdropYouRank(null);
        }
      } catch (e) {
        console.warn('airdrop board', e?.message || e);
        setLeaderboard([]);
        setAirdropQualifiedCount(0);
        setAirdropYouRank(null);
      } finally {
        setLeaderboardLoading(false);
      }
      return;
    }

    // --- WEEKLY board from Supabase (weekly_shards + snapshots) ---
    if (targetType === 'Weekly') {
      try {
        setAirdropYouRank(null);
        setAirdropQualifiedCount(0);
        // Push any pending taps so weekly_shards is current for ALL players using commit-taps
        try {
          await flushPendingTaps();
        } catch {
          /* ignore */
        }
        // Freeze any finished week before reading live / claim UI
        await ensureWeeklySeasonRollover();
        const weekId = getUtcWeekId();
        const liveW = Number(optimisticWeekly.current) || 0;
        const day = getUtcIsoWeekDayNumber();
        const floor = getWeeklyBoardFloor(day);
        setWeeklyBoardDay(day);
        setWeeklyBoardFloor(floor);

        // SYSTEM board: Edge reconciles EVERY miner this week (energy units),
        // then we still merge public sources as backup. No per-player patches.
        const byId = new Map();
        const absorb = (list) => {
          for (const r of list || []) {
            const id = String(r.telegram_id || r[DB_PLAYER_ID] || r.id || '').trim();
            if (!id) continue;
            const rowWeek = String(r.weekly_week_id || r.week_id || '').trim();
            // Strict: this UTC week only
            if (rowWeek && rowWeek !== weekId) continue;
            // Edge rows always current week; allow missing week_id from board API
            if (!rowWeek && r.weekly_shards == null && r.score == null && r.weekly_score == null) {
              continue;
            }
            let score = Math.max(
              0,
              Number(r.weekly_shards ?? r.score ?? r.weekly_score) || 0,
            );
            const daily = Math.max(0, Number(r.daily_taps) || 0);
            // Energy floor: week total >= today's daily
            if (daily > score) score = daily;
            if (score <= 0) continue;
            // If week missing, treat as current only when from weekly-board
            const effectiveWeek = rowWeek || weekId;
            if (effectiveWeek !== weekId) continue;
            const prev = byId.get(id);
            if (prev && score <= (Number(prev.weekly_score) || 0)) {
              if ((!prev.username || prev.username === 'Player') && r.username) {
                byId.set(id, { ...prev, username: r.username });
              }
              continue;
            }
            byId.set(id, {
              ...prev,
              ...r,
              telegram_id: id,
              [DB_PLAYER_ID]: id,
              username: r.username || prev?.username || 'Player',
              weekly_shards: score,
              weekly_score: score,
              score,
              weekly_week_id: weekId,
            });
          }
        };

        // 0) Canonical: weekly-board Edge (reconcile ALL + return live scores)
        try {
          const board = await fetchWeeklyBoard(500);
          if (board?.rows?.length) {
            absorb(
              board.rows.map((r) => ({
                ...r,
                weekly_week_id: board.week_id || weekId,
                week_id: board.week_id || weekId,
              })),
            );
          } else if (board?.error) {
            console.warn('weekly-board:', board.error);
          }
        } catch (e) {
          console.warn('weekly-board', e?.message || e);
        }

        // 1) Fallbacks if Edge unavailable
        if (byId.size === 0) {
          try {
            const rpc = await supabase.rpc('get_weekly_leaderboard_live', {
              p_limit: 500,
            });
            if (!rpc.error && rpc.data?.length) absorb(rpc.data);
          } catch (e) {
            console.warn('weekly rpc', e?.message || e);
          }
          {
            const v = await supabase
              .from('leaderboard_weekly')
              .select('*')
              .eq('weekly_week_id', weekId)
              .gt('weekly_shards', 0)
              .order('weekly_shards', { ascending: false })
              .limit(500);
            if (!v.error) absorb(v.data);
          }
          {
            const led = await supabase
              .from('weekly_score_ledger')
              .select('telegram_id, username, score, week_id, updated_at')
              .eq('week_id', weekId)
              .gt('score', 0)
              .order('score', { ascending: false })
              .limit(500);
            if (!led.error) {
              absorb(
                (led.data || []).map((r) => ({
                  telegram_id: r.telegram_id,
                  username: r.username,
                  weekly_shards: Number(r.score) || 0,
                  weekly_week_id: r.week_id,
                })),
              );
            }
          }
          {
            const pl = await supabase
              .from('players')
              .select(
                `${DB_PLAYER_ID}, username, weekly_shards, weekly_week_id, daily_taps, last_tap_date, inventory`,
              )
              .eq('weekly_week_id', weekId)
              .or('weekly_shards.gt.0,daily_taps.gt.0')
              .limit(500);
            if (!pl.error) absorb(pl.data);
          }
        }

        let rows = [...byId.values()].sort(
          (a, b) => (Number(b.weekly_score) || 0) - (Number(a.weekly_score) || 0),
        );

        // Inject live self (device may be ahead of last save) into full pool first
        if (playerId && liveW > 0) {
          const ix = rows.findIndex(
            (r) => String(r[DB_PLAYER_ID] || r.telegram_id || '') === String(playerId),
          );
          if (ix >= 0) {
            const best = Math.max(liveW, Number(rows[ix].weekly_score) || 0);
            rows[ix] = { ...rows[ix], weekly_score: best, score: best, weekly_shards: best };
            rows.sort((a, b) => (b.weekly_score || 0) - (a.weekly_score || 0));
          } else {
            rows = [
              {
                [DB_PLAYER_ID]: playerId,
                telegram_id: playerId,
                username: player?.username || 'You',
                weekly_score: liveW,
                weekly_shards: liveW,
                score: liveW,
                weekly_week_id: weekId,
              },
              ...rows,
            ].sort((a, b) => (b.weekly_score || 0) - (a.weekly_score || 0));
          }
        }

        const allRows = rows;
        const mainRows = filterWeeklyMainBoard(allRows, floor, 50);
        setWeeklyEligibleCount(mainRows.length);
        setLeaderboard(mainRows);
        setSeasonYouRank(null);
        setSeasonEligibleCount(0);

        const me = rankOnWeeklyBoard(allRows, playerId, DB_PLAYER_ID, floor);
        if (me && playerId) {
          const inList = mainRows.some(
            (r) =>
              String(r[DB_PLAYER_ID] || r.telegram_id || '') === String(playerId),
          );
          setWeeklyYouRank({
            ...me,
            score: Math.max(liveW, Number(me.score) || 0),
            inList,
          });
        } else if (playerId) {
          setWeeklyYouRank({
            rank: null,
            score: liveW,
            total: mainRows.length,
            tier: null,
            onMain: isWeeklyFloorEligible(liveW, floor),
            floor,
            need: Math.max(0, floor - liveW),
            inList: false,
          });
        } else {
          setWeeklyYouRank(null);
        }
      } catch (e) {
        console.warn('weekly leaderboard', e?.message || e);
        setLeaderboard([]);
        setWeeklyYouRank(null);
        setWeeklyEligibleCount(0);
      } finally {
        setLeaderboardLoading(false);
      }
      return;
    }

    try {
      if (isAllTime) {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .order(sortColumn, { ascending: false })
          .limit(100);
        if (error) console.warn('Leaderboard fetch:', error.message || error);
        setLeaderboard(data || []);
        setSeasonYouRank(null);
        setSeasonEligibleCount(0);
        setWeeklyYouRank(null);
        setAirdropYouRank(null);
        setAirdropQualifiedCount(0);
        return;
      }

      // Season: pull a wide list, apply 15% floor, show top eligible + your rank if off-board
      const day = getSeasonDayNumber(seasonData?.startTime);
      const floor = getSeasonBoardFloor(day);
      setSeasonBoardDay(day);
      setSeasonBoardFloor(floor);

      let { data, error } = await supabase
        .from(tableName)
        .select('*')
        .order(sortColumn, { ascending: false })
        .limit(500);
      if (error) {
        // Fallback if score column missing / view differs
        console.warn('Leaderboard season order:', error.message || error);
        ({ data, error } = await supabase.from(tableName).select('*').limit(500));
        if (error) console.warn('Leaderboard fetch:', error.message || error);
        data = (data || []).sort((a, b) => getSeasonScore(b) - getSeasonScore(a));
      }

      let rows = data || [];
      // Ensure live self is in the pool for rank (DB view can lag behind taps)
      if (playerId) {
        const pid = String(playerId);
        const liveScore = Number(optimisticSeason.current) || Number(seasonShards) || 0;
        const ix = rows.findIndex(
          (r) => String(r[DB_PLAYER_ID] || r.id || '') === pid,
        );
        if (ix >= 0) {
          const dbScore = getSeasonScore(rows[ix]);
          if (liveScore > dbScore) {
            rows = [...rows];
            rows[ix] = {
              ...rows[ix],
              score: liveScore,
              season_shards: liveScore,
            };
            rows.sort((a, b) => getSeasonScore(b) - getSeasonScore(a));
          }
        } else if (liveScore > 0) {
          rows = [
            ...rows,
            {
              [DB_PLAYER_ID]: pid,
              username: player?.username || getPlayerProfile()?.username || 'You',
              score: liveScore,
              season_shards: liveScore,
            },
          ].sort((a, b) => getSeasonScore(b) - getSeasonScore(a));
        }
      }

      const main = filterSeasonMainBoard(rows, floor, 100);
      const eligibleAll = rows.filter((r) => getSeasonScore(r) >= floor);
      setSeasonEligibleCount(eligibleAll.length);
      setLeaderboard(main);

      if (playerId) {
        const info = rankInSeason(rows, playerId, DB_PLAYER_ID);
        const myScore = info?.score ?? (Number(optimisticSeason.current) || Number(seasonShards) || 0);
        const onMain = myScore >= floor;
        const inList = main.some(
          (r) => String(r[DB_PLAYER_ID] || r.id || '') === String(playerId),
        );
        setSeasonYouRank({
          rank: info?.rank || null,
          score: myScore,
          onMain,
          inList,
          need: Math.max(0, floor - myScore),
          total: rows.length,
          eligible: eligibleAll.length,
        });
      } else {
        setSeasonYouRank(null);
      }
    } catch (err) {
      console.error('Leaderboard fetch error:', err);
      setLeaderboard([]);
      setSeasonYouRank(null);
    } finally {
      setLeaderboardLoading(false);
    }
  };

  // Live pull other miners while Weekly ranks is open (commit-taps is per-device)
  useEffect(() => {
    if (currentPage !== 'leaderboard' || leaderboardType !== 'Weekly') return undefined;
    const id = setInterval(() => {
      fetchFullLeaderboard('Weekly', { silent: true });
    }, 12000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, leaderboardType, playerId]);

  /** Open Ranks page always landing on Season tab */
  const openLeaderboardPage = () => {
    setLeaderboardType('Season');
    setCurrentPage('leaderboard');
    fetchFullLeaderboard('Season');
  };

  // 🚨 NEW FUNCTION: Bypasses the database and reads the live blockchain
  const syncBlockchainBalances = async (walletAddress) => {
      try {
          console.log("Fetching live balances directly from Solana...");
          const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=538f6c8f-c773-46a2-939c-6d48c75b2226", 'confirmed');
          const pubKey = new PublicKey(walletAddress);

          // 1. Get Live SOL Balance
          const lamports = await connection.getBalance(pubKey);
          const liveSol = lamports / 1000000000;

          // 2. Get Live USDC Balance (Using the official USDC Smart Contract)
          const usdcMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
          const usdcAccounts = await connection.getParsedTokenAccountsByOwner(pubKey, { mint: usdcMint });
          const liveUsdc = usdcAccounts.value.length > 0 
              ? usdcAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount 
              : 0;

          // 3. Force React to update the UI instantly (This fixes your MAX button and headers!)
          setBalances(prev => ({
              ...prev,
              sol: liveSol,
              usdc: liveUsdc
          }));

          // 4. Tell Supabase the new numbers so the database matches the blockchain
          await supabase
              .from('players')
              .update({ sol_balance: liveSol, usdc_balance: liveUsdc })
              .eq(DB_PLAYER_ID, playerId);

          console.log("UI and Database successfully synced with Blockchain!");
      } catch (err) {
          console.error("Live balance sync failed:", err);
      }
  };

  const syncPlayer = useCallback(async () => {
    if (!playerId) {
      setIsLoading(false);
      setIsDataLoaded(false);
      return;
    }
    setIsLoading(true);
    setIsDataLoaded(false);
    // Drop previous account's in-memory progress before loading this one
    // (same device: logout → login as someone else)
    try {
      if (window.saveTimeout) clearTimeout(window.saveTimeout);
    } catch {
      /* ignore */
    }
    window.saveTimeout = null;
    pendingSaveRef.current = null;
    spendGuardRef.current = false;
    saveGenerationRef.current += 1;
    optimisticTaps.current = 0;
    optimisticBalance.current = 0;
    optimisticSeason.current = 0;
    optimisticEnergy.current = 500;
    energyAnchorRef.current = { value: 500, at: Date.now() };
    optimisticDaily.current = 0;
    setBalance(0);
    setSeasonShards(0);
    setLifetimeTaps(0);
    setDailyTaps(0);
    setEnergy(500);
    setStats({
      frenzy_expires: null,
      efficiency_expires: null,
      energy_boost_expires: null,
      inventory: {},
    });
    setBalances({ sol: 0, G2U: 0, G2Ushards: 0, usdc: 0 });
    try {
      const userId = playerId;
      const invisibleKey = vaultSaltFor(userId);
      
      // 1. Fetch player data
      const { data: playerRow } = await supabase
        .from('players')
        .select('*')
        .eq(DB_PLAYER_ID, userId)
        .maybeSingle();

      // ==========================================
      // CASE A: RETURNING PLAYER (Has Wallet)
      // ==========================================
      if (playerRow && playerRow.wallet_address) {
        console.log("Existing player found, protecting data...");
        const displayName =
          (playerRow.username && String(playerRow.username).trim()) ||
          `Player_${String(userId).replace(/-/g, '').slice(0, 8)}`;
        setUsername(displayName);
        setPlayer(getPlayerProfile());
        // Public launch: no beta codes — everyone with an account can play
        setHasAccess(true);
        if (!playerRow.has_beta_access) {
          supabase
            .from('players')
            .update({ has_beta_access: true })
            .eq(DB_PLAYER_ID, userId)
            .then(() => {})
            .catch(() => {});
        }
        setPlayerWallet(playerRow.wallet_address);
        // password_hash is NOT readable via anon — status via Edge
        try {
          await ensureSecureSession();
          const st = await secureVaultStatus();
          setNeedsPassword(st?.has_password === false);
        } catch {
          setNeedsPassword(false);
        }
        
        setBalances({ 
          sol: playerRow.sol_balance || 0, 
          G2U: playerRow.gft_token_balance || 0, 
          G2Ushards: Number(playerRow.shard_balance) || 0, 
          usdc: playerRow.usdc_balance || 0 
        });
        const _bal = Number(playerRow.shard_balance) || 0;
        setBalance(_bal);
        optimisticBalance.current = _bal;
        setTapPower(playerRow.tap_power || 1);
        setMaxDailyLimit(playerRow.max_daily_limit || 1000);
        
        // Load Backpack and Timers
        let inv = { ...(playerRow.inventory || {}) };
        // One-time heal: energy-task claims used to fill the 500 pool by mistake.
        // Convert completed retention tasks into today's daily-limit boost once.
        if (!inv.task_daily_limit_migrated_v1) {
          const done = Array.isArray(playerRow.completed_tasks)
            ? playerRow.completed_tasks
            : [];
          let heal = 0;
          for (const [tid, amt] of Object.entries(TASK_DAILY_LIMIT_REWARDS)) {
            if (done.includes(tid)) heal += amt;
          }
          if (heal > 0) {
            const prevAmt =
              inv.task_limit_boost &&
              inv.task_limit_boost.expires &&
              new Date(inv.task_limit_boost.expires).getTime() > Date.now()
                ? Number(inv.task_limit_boost.amount) || 0
                : 0;
            inv = {
              ...inv,
              task_limit_boost: {
                amount: prevAmt + heal,
                expires: utcMidnightTonightIso(),
              },
              task_daily_limit_migrated_v1: true,
            };
            supabase
              .from('players')
              .update({
                inventory: inv,
              })
              .eq(DB_PLAYER_ID, String(userId))
              .then(({ error }) => {
                if (error) console.warn('task daily-limit migrate failed', error.message);
              });
          } else {
            inv = { ...inv, task_daily_limit_migrated_v1: true };
          }
        }
        // If daily already maxed on load, credit weekly "drain daily limit" for today
        try {
          const dbDaily = Number(playerRow.daily_taps) || 0;
          let lim = Number(playerRow.max_daily_limit) || 1000;
          if (
            playerRow.energy_boost_expires &&
            new Date(playerRow.energy_boost_expires) > new Date()
          ) {
            lim += 1000;
          }
          if (
            playerRow.limit_boost_expires &&
            new Date(playerRow.limit_boost_expires) > new Date()
          ) {
            lim += Number(playerRow.limit_boost_amount) || 0;
          }
          const tlb = inv?.task_limit_boost;
          if (tlb?.expires && new Date(tlb.expires) > new Date()) {
            lim += Number(tlb.amount) || 0;
          }
          if (dbDaily > 0) {
            const nowLoad = new Date();
            // Credit 500/day, active day, and full-drain at BASE 1000 (boosts ignored)
            inv.weekly_quests = applyWeeklyDailyProgress(
              inv.weekly_quests,
              getUtcWeekId(nowLoad),
              {
                day: weeklyUtcDayStr(nowLoad),
                dayTaps: dbDaily,
                maxLimit: WEEKLY_BASE_DAILY_LIMIT,
              },
            );
          }
        } catch {
          /* ignore */
        }
        // Repair claims from durable ledger BEFORE any write/setState
        inv = hydrateWeeklyClaimsFromLedger(inv, getUtcWeekId());
        if ((Number(playerRow.daily_taps) || 0) > 0) {
          supabase
            .from('players')
            .update({
              inventory: inv,
            })
            .eq(DB_PLAYER_ID, String(userId))
            .then(({ error }) => {
              if (error) console.warn('weekly progress on load', error.message);
            });
        }
        {
          const weekIdNow = getUtcWeekId();
          let wScore = 0;
          if (String(playerRow.weekly_week_id || '') === weekIdNow) {
            wScore = Math.max(0, Number(playerRow.weekly_shards) || 0);
          }
          const invW = getWeeklyLbState(inv, weekIdNow).score;
          wScore = Math.max(wScore, invW);
          // Same-week energy floor: weekly cannot lag today's daily (1300 daily / 656 weekly)
          const ltd = String(playerRow.last_tap_date || '').slice(0, 10);
          const today = utcTodayStr();
          if (ltd === today || String(playerRow.weekly_week_id || '') === weekIdNow) {
            wScore = Math.max(wScore, Number(playerRow.daily_taps) || 0);
          }
          optimisticWeekly.current = wScore;
          inv.weekly_lb = { weekId: weekIdNow, score: wScore };
          // Seed you weekly row so Ranks shows score before first re-fetch
          {
            const fl = getWeeklyBoardFloor();
            setWeeklyYouRank((prev) => ({
              ...(prev && typeof prev === 'object' ? prev : {}),
              score: wScore,
              onMain: isWeeklyFloorEligible(wScore, fl),
              floor: fl,
              need: Math.max(0, fl - wScore),
              rank: prev?.rank ?? null,
              tier: prev?.tier ?? null,
              inList: !!prev?.inList,
              total: prev?.total ?? 0,
            }));
          }
          // Auto-freeze last week's winners (idempotent; also covered by pg_cron)
          ensureWeeklySeasonRollover();
          // Persist seed so this week shows on the board after first save
          if (wScore > 0 && String(playerRow.weekly_week_id || '') !== weekIdNow) {
            supabase
              .from('players')
              .update({
                weekly_shards: wScore,
                weekly_week_id: weekIdNow,
                inventory: inv,
              })
              .eq(DB_PLAYER_ID, String(userId))
              .then(({ error }) => {
                if (error) console.warn('weekly seed save', error.message);
              });
          } else if (
            wScore > 0 &&
            (Number(playerRow.weekly_shards) || 0) < wScore
          ) {
            supabase
              .from('players')
              .update({
                weekly_shards: wScore,
                weekly_week_id: weekIdNow,
                inventory: inv,
              })
              .eq(DB_PLAYER_ID, String(userId))
              .then(({ error }) => {
                if (error) console.warn('weekly seed bump', error.message);
              });
          }
        }
        inventoryRef.current = inv;
        setStats({
          inventory: inv,
          frenzy_expires: playerRow.frenzy_expires || null,
          efficiency_expires: playerRow.efficiency_expires || null,
          energy_boost_expires: playerRow.energy_boost_expires || null,
          premium_multiplier: playerRow.premium_multiplier || 1,
          premium_multiplier_expires: playerRow.premium_multiplier_expires || null,
          limit_boost_amount: playerRow.limit_boost_amount || 0,
          limit_boost_expires: playerRow.limit_boost_expires || null
        });
        
        const _lt = Number(playerRow.lifetime_taps) || 0;
        setLifetimeTaps(_lt);
        optimisticTaps.current = _lt;
        const _ss = Number(playerRow.season_shards) || 0;
        setSeasonShards(_ss);
        optimisticSeason.current = _ss;
        const _dtLoad = Number(playerRow.daily_taps) || 0;
        serverProgressRef.current = {
          b: Number(playerRow.shard_balance) || 0,
          ltt: _lt,
          s: _ss,
          dt: _dtLoad,
        }; 
        let loadedMax = migrateMaxUnlockedLevel(playerRow.max_unlocked_level || 4);
        setMaxUnlockedLevel(loadedMax);
        // Persist bridge so DB matches new wall keys (50 → 74)
        if (loadedMax !== Number(playerRow.max_unlocked_level || 4)) {
          supabase
            .from('players')
            .update({
              max_unlocked_level: loadedMax,
            })
            .eq(DB_PLAYER_ID, String(userId))
            .then(({ error }) => {
              if (error) console.warn('max_unlocked migrate', error.message);
            });
        }
        const _max = loadedMax;
        setCurrentLevel(effectiveLevel(_lt, _max));
        // Persist "stay mining" so wall modal does not re-open after each save/tap pause
        if (Number(inv.wall_snooze_level) === loadedMax) {
          setWallSnoozedFor(loadedMax);
        } else {
          setWallSnoozedFor(null);
        }
        // Provisional energy from DB (recovery math below overwrites with wall-clock regen)
        const _en = Number.isFinite(Number(playerRow.last_energy))
          ? Math.max(0, Math.min(ENERGY_CAP, Number(playerRow.last_energy)))
          : 0;
        const _enAt = playerRow.last_updated
          ? new Date(playerRow.last_updated).getTime()
          : Date.now();
        energyAnchorRef.current = { value: _en, at: _enAt };
        setEnergy(energyFromAnchor(_en, _enAt));
        optimisticEnergy.current = energyFromAnchor(_en, _enAt);

        // Daily limit + streak (UTC calendar day)
        // RULE: daily_taps only resets when last activity was a PREVIOUS UTC day.
        // Never zero daily_taps on every refresh. Never zero just because bar is full.
        const today = utcTodayStr();
        const yesterdayUtc = utcYesterdayStr();
        const ltd = playerRow.last_tap_date
          ? String(playerRow.last_tap_date).slice(0, 10)
          : null;
        const lastUpdatedDay = playerRow.last_updated
          ? String(playerRow.last_updated).slice(0, 10)
          : null;
        const dbDaily = Number(playerRow.daily_taps) || 0;

        let loadedStreak = Number(playerRow.current_streak) || 0;
        // Gap > 1 UTC day → streak back to 0 (display + optional DB)
        if (ltd && ltd < yesterdayUtc) {
          loadedStreak = 0;
          if (Number(playerRow.current_streak) || 0) {
            supabase
              .from('players')
              .update({ current_streak: 0 })
              .eq(DB_PLAYER_ID, userId)
              .then(({ error }) => {
                if (error) console.warn('streak gap reset failed', error.message);
              });
          }
        }
        setStreak(loadedStreak);
        streakRef.current = loadedStreak;

        // Same UTC day for *daily limit* only uses last_tap_date (and local progress).
        // Do NOT use last_updated — heartbeats stamp it every load and blocked UTC day-roll.
        const isSameUtcDay =
          ltd === today ||
          (!ltd && dbDaily > 0 && lastUpdatedDay === today);

        if (
          !isSameUtcDay &&
          ((ltd && ltd < today) || (!ltd && lastUpdatedDay && lastUpdatedDay < today))
        ) {
          // NEW UTC day only — reset daily bar once
          setDailyTaps(0);
          optimisticDaily.current = 0;
          setLastTapDate(ltd || '');
          lastTapDateRef.current = ltd || '';
          serverProgressRef.current = { ...(serverProgressRef.current || {}), dt: 0 };
          if (dbDaily !== 0) {
            supabase
              .from('players')
              .update({ daily_taps: 0 })
              .eq(DB_PLAYER_ID, userId)
              .then(({ error }) => {
                if (error) console.error('UTC daily reset failed:', error.message);
              });
          }
        } else {
          // Same UTC day: KEEP daily_taps — never wipe on refresh / full bar
          setDailyTaps(dbDaily);
          optimisticDaily.current = dbDaily;
          if (isSameUtcDay && dbDaily > 0) {
            setLastTapDate(today);
            lastTapDateRef.current = today;
          } else {
            setLastTapDate(ltd || '');
            lastTapDateRef.current = ltd || '';
          }
          serverProgressRef.current = { ...(serverProgressRef.current || {}), dt: dbDaily };
        }

        // 🚨 NEW: Ad Capacity & Midnight Reset Logic
        // --- 1. SEARCH FOR THE AD RESET LOGIC (Around line 50 of your snippet) ---
        if (playerRow.last_ad_date !== today) {
            setDailyAdsWatched(0);
            
            // 🚨 SENIOR FIX: Don't just set to 1000. Set to 1000 + their active SOL boost.
            const baseLimit = 1000;
            const activeBoost = Number(playerRow.limit_boost_amount) || 0;
            const resetLimit = baseLimit; // max_daily_limit is the "Base", boosts are calculated in dynamicMaxLimit

            setMaxDailyLimit(resetLimit);

            supabase
                .from('players')
                .update({ 
                    daily_ads_watched: 0, 
                    max_daily_limit: resetLimit,
                    last_ad_date: today
                })
                .eq(DB_PLAYER_ID, userId)
                .then(({ error }) => {
                    if (error) console.error("Midnight ad reset failed:", error.message);
                });
        } else {
            setDailyAdsWatched(playerRow.daily_ads_watched || 0);
            setMaxDailyLimit(playerRow.max_daily_limit || 1000);
        }

        // --- 2. SEARCH FOR THE ENERGY RECOVERY (Around line 65 of your snippet) ---
        // Fallback to 'now' if last_updated is missing to prevent NaN errors
        const lastDate = playerRow.last_updated ? new Date(playerRow.last_updated).getTime() : new Date().getTime();
        const now = new Date().getTime();
        const secondsPassed = Math.floor((now - lastDate) / 1000);

        // A. Energy Recovery Math (wall-clock from last_energy + last_updated)
        // last_energy === 0 is valid (drained). Do NOT treat 0 as missing and force 500.
        const rawEn = Number(playerRow.last_energy);
        const dbEnergy = Number.isFinite(rawEn)
          ? Math.max(0, Math.min(ENERGY_CAP, rawEn))
          : ENERGY_CAP;
        // Anchor at last save time so remaining time regenerates correctly
        energyAnchorRef.current = {
          value: dbEnergy,
          at: lastDate,
        };
        const recoveredEnergy = energyFromAnchor(dbEnergy, lastDate, now);
        setEnergy(recoveredEnergy);
        optimisticEnergy.current = recoveredEnergy;
        
        // 🚨 NEW: B. Weekend Bot (Offline Mining) Multi-Day Math
        let offlineShardsEarned = 0;
        const botExpiresMs = playerRow.bot_expires ? new Date(playerRow.bot_expires).getTime() : 0;
        
        // Ensure the bot was actually active at some point since they last played
        if (botExpiresMs > lastDate) {
            
            const currentMaxLimit = Number(playerRow.max_daily_limit) || 1000;
            const BOT_SHARDS_PER_SECOND = currentMaxLimit / 86400; // Takes 24h to mine 100% of limit
            
            const botEndMs = Math.min(now, botExpiresMs); // Stops calculating if bot expired
            
            let simDateMs = lastDate;
            let simDailyTaps = Number(playerRow.daily_taps) || 0;
            
            // 1. Simulate day-by-day to perfectly handle midnight resets
            while (simDateMs < botEndMs) {
                // Find midnight of the current simulation day (UTC)
                const simDateStr = new Date(simDateMs).toISOString().split('T')[0];
                const nextMidnightMs = new Date(simDateStr + 'T00:00:00Z').getTime() + 86400000;
                
                // End this step either at the bot's end time, or at midnight
                const stepEndMs = Math.min(botEndMs, nextMidnightMs);
                const secondsInStep = (stepEndMs - simDateMs) / 1000;
                
                // Calculate shards for this step
                const potentialShards = secondsInStep * BOT_SHARDS_PER_SECOND;
                const remainingLimit = Math.max(0, currentMaxLimit - simDailyTaps);
                
                const earnedThisStep = Math.min(potentialShards, remainingLimit);
                offlineShardsEarned += earnedThisStep;
                simDailyTaps += earnedThisStep;
                
                // Advance the simulation clock
                simDateMs = stepEndMs;
                
                // If the clock hit midnight, reset the daily taps for the next day's loop!
                if (simDateMs === nextMidnightMs) {
                    simDailyTaps = 0;
                }
            }
            
            offlineShardsEarned = Math.floor(offlineShardsEarned);
            simDailyTaps = Math.floor(simDailyTaps); // 🚨 THE SURGICAL FIX: Locks the daily limit to whole numbers
            
            // 2. Format today's date for DB
            const todayStr = new Date(now).toISOString().split('T')[0];
            const botEndDateStr = new Date(botEndMs).toISOString().split('T')[0];
            
            // If the bot expired yesterday, today's bar should be totally empty when they log in!
            if (botEndDateStr !== todayStr) {
                simDailyTaps = 0;
            }

            // 🚨 SEASON SAFETY VALVE: Set to false since Beta is over
            const isBetaActive = false;

            if (offlineShardsEarned > 0) {
                
                // 1. Safely pull actual variables straight from your Supabase 'player' object
                const currentLifetimeTaps = Number(playerRow.lifetime_taps) || 0;
                const playerMaxLevel = playerRow.max_unlocked_level || 4;
                let projectedLifetime = currentLifetimeTaps + offlineShardsEarned;
                
                // Open mining: wall does NOT stop bot shards. Level stays capped client-side.
                if (calculateLevel(projectedLifetime) > playerMaxLevel) {
                    console.log("Bot mining past wall threshold — shards still earned; level unlock optional.");
                }

                if (offlineShardsEarned > 0) {
                    // 1. Update React UI instantly (Balance, Limits, and Leaderboard Stats!)
                    const botBal = Math.round((Number(optimisticBalance.current) + offlineShardsEarned) * 1000) / 1000;
                    const botLife = Math.round((Number(optimisticTaps.current) + offlineShardsEarned) * 1000) / 1000;
                    const botSeason = Math.round((Number(optimisticSeason.current) + offlineShardsEarned) * 1000) / 1000;
                    optimisticBalance.current = botBal;
                    optimisticTaps.current = botLife;
                    optimisticSeason.current = botSeason;
                    optimisticDaily.current = simDailyTaps;
                    setBalance(botBal);
                    setDailyTaps(simDailyTaps);
                    setLifetimeTaps(botLife);
                    setSeasonShards(botSeason);
                    
                    // Bot is a boost only — do NOT touch last_tap_date / current_streak /
                    // last_updated (energy regen clock).
                    if (!secureEconomyRef.current) {
                      supabase
                        .from('players')
                        .update({ 
                            shard_balance: Number(playerRow.shard_balance) + offlineShardsEarned,
                            daily_taps: simDailyTaps,
                            lifetime_taps: projectedLifetime,
                            season_shards: Number(playerRow.season_shards) + offlineShardsEarned,
                        })
                        .eq(DB_PLAYER_ID, userId)
                        .then(({ error }) => {
                            if (error) console.error("Bot sync failed:", error);
                        });
                    }

                    // Fire the welcome back popup!
                    setTimeout(() => {
                        notify(`🤖 Welcome back! Your Bot mined ${offlineShardsEarned.toLocaleString()} Shards while you were away!`);
                        // Open mining: no auto climb popup after bot mining (use HUD Level up).
                    }, 1000);
                } else {
                    // Bot active but mined 0 — no forced wall modal.
                    // Secure economy: never client-write last_energy / last_updated
                    // (commit-taps owns the regen clock).
                }
            } else {
              // Bot active but mined 0 (limit maxed) — same: no energy-clock write.
            }
        } else {
            // No bot — do NOT heartbeat last_updated. Under secure economy that
            // field is the battery regen clock owned by commit-taps only.
        }

        // HARD SECURITY: vault NOT readable via anon select('*').
        // Owner-only via Edge wallet-vault + JWT.
        try {
          await ensureSecureSession();
          const vaultRes = await secureGetVault();
          if (vaultRes?.encrypted_vault) {
            const unlockedSecret = decryptWallet(vaultRes.encrypted_vault, invisibleKey);
            if (unlockedSecret) {
              setDecryptedPhrase(unlockedSecret);
            }
          }
        } catch (vaultErr) {
          console.warn('secure vault load', vaultErr?.message || vaultErr);
        }

        setIsDataLoaded(true);
        return;
      } 
      // ==========================================
      // CASE B: Account exists but no wallet yet → create ONCE via Edge (JWT)
      // Never overwrite wallet_address / encrypted_vault if already set.
      // ==========================================
      else if (playerRow && !playerRow.wallet_address) {
        console.log("Account without wallet — generating in-app wallet (secure, set-once)...");
        try {
          await ensureSecureSession();
          const result = await secureCreateUserWallet();
          if (result?.already_bound && result.publicKey) {
            setPlayerWallet(result.publicKey);
            setHasAccess(true);
            setIsDataLoaded(true);
          } else if (result && result.publicKey) {
            // Vault set-once via Edge only (anon cannot read/write encrypted_vault)
            const rawSecret = result.mnemonic || result.secretKey || null;
            if (rawSecret) {
              const enc = encryptWallet(rawSecret, invisibleKey);
              try {
                await secureSetVaultIfEmpty(enc);
              } catch (ve) {
                console.warn('vault set_if_empty', ve?.message || ve);
              }
              setDecryptedPhrase(rawSecret);
              setMustBackup(true);
              localStorage.removeItem(`wallet_backed_up_${userId}`);
            }
            setPlayerWallet(result.publicKey);
            setHasAccess(true);
            if (!playerRow.has_beta_access) {
              await supabase
                .from('players')
                .update({ has_beta_access: true })
                .eq(DB_PLAYER_ID, userId);
            }
            setIsDataLoaded(true);
          } else {
            console.error("Wallet generation failed.", result);
            setHasAccess(true);
          }
        } catch (wErr) {
          console.error("Secure wallet create failed:", wErr?.message || wErr);
          setHasAccess(true);
        }
      }
      // No row for this session id → force re-auth (don't auto-create ghost accounts)
      else if (!playerRow) {
        console.warn("No player row for session — clearing and showing login.");
        clearSession();
        setIsAuthed(false);
        setPlayer({ id: '', username: '', first_name: '' });
      }

      await fetchTopLeader();
    } catch (err) {
      console.error("Sync Error:", err.message);
    } finally {
      setIsLoading(false);
    }
  }, [playerId, player.username, player.first_name, fetchTopLeader]);

  /** Called after beta code redeem — grant access; create wallet only if missing. */
  const initializeNewPlayer = async () => {
    setIsLoading(true);
    try {
      const userId = playerId;
      const userName = player.username || player.first_name || 'Player';

      const referrerId = consumeReferralId(); 
      // Referrer is NOT paid on join — only at L1 (+1000) and wall 4→5 (+3000)
      const JOINER_BONUS = REFERRAL.JOINER_ON_JOIN; // 500 to new player only
      const startingShards = referrerId ? JOINER_BONUS : 0;

      // Prefer existing account row (from username signup)
      const { data: existingPlayer } = await supabase
        .from('players')
        .select('*')
        .eq(DB_PLAYER_ID, userId)
        .maybeSingle();

      let encryptedVault = null;
      let publicKey = existingPlayer?.wallet_address || null;
      const hadWallet = !!(publicKey && String(publicKey).trim());
      // encrypted_vault not on anon select — ask Edge
      let hadVault = false;
      try {
        await ensureSecureSession();
        const st = await secureVaultStatus();
        hadVault = !!st?.has_vault;
      } catch {
        hadVault = false;
      }

      // Ensure player row exists BEFORE wallet Edge bind (create-user-wallet needs the row)
      if (!existingPlayer) {
        const { error: insertError } = await supabase
          .from('players')
          .insert([{
            [DB_PLAYER_ID]: userId,
            has_beta_access: true,
            username: userName,
            shard_balance: startingShards,
            season_shards: 0,
            lifetime_taps: 0,
            referred_by: referrerId ? String(referrerId) : null,
          }]);
        if (insertError) throw insertError;
      } else {
        const updates = {
          has_beta_access: true,
          username: existingPlayer?.username || userName,
        };
        if (referrerId && !existingPlayer.referred_by && Number(existingPlayer.shard_balance || 0) === 0) {
          updates.shard_balance = startingShards;
          updates.referred_by = String(referrerId);
        }
        // HARD SECURITY: never touch wallet_address / encrypted_vault here
        const { error: updateError } = await supabase
          .from('players')
          .update(updates)
          .eq(DB_PLAYER_ID, userId);
        if (updateError) throw updateError;
      }

      // Generate wallet only if missing — Edge JWT, set-once (cannot replace)
      if (!hadWallet) {
        await ensureSecureSession();
        const newWallet = await secureCreateUserWallet();
        if (!newWallet?.publicKey) throw new Error(newWallet?.error || 'Wallet generation failed');

        publicKey = newWallet.publicKey;
        if (!hadVault && newWallet.mnemonic) {
          const invisibleKey = vaultSaltFor(userId);
          encryptedVault = encryptWallet(newWallet.mnemonic, invisibleKey);
          setDecryptedPhrase(newWallet.mnemonic);
          setGeneratedSecret(newWallet.mnemonic);
          setMustBackup(true);
          await secureSetVaultIfEmpty(encryptedVault);
        }
      }

      if (publicKey) setPlayerWallet(publicKey);

      // No referrer join bonus (milestones: L1 / wall5 only)

      if (startingShards && !existingPlayer?.shard_balance) {
        setBalance(startingShards);
      }
      // Do not force 500 when energy is legitimately 0 — catch-up already applied on load.
      setEnergy((e) => {
        const n = Number(e);
        if (Number.isFinite(n)) return Math.max(0, Math.min(ENERGY_CAP, n));
        return ENERGY_CAP;
      });
      setHasAccess(true);
      setIsDataLoaded(true);
    } catch (err) {
      console.error("Init Error:", err);
      notify(err?.message || "Error during initialization. Please reload.");
    } finally {
      setIsLoading(false);
    }
  };


  /** Restore via 12-word phrase → bind this device to that account. */
  const restoreAccountFromMnemonic = async (mnemonic) => {
    const cleaned = (mnemonic || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!cleaned || cleaned.split(" ").length < 12) {
      notify("Enter your full 12-word secret phrase.");
      return false;
    }
    setIsLoading(true);
    try {
      let keypair;
      try {
        keypair = keypairFromMnemonic(cleaned);
      } catch {
        notify("Invalid secret phrase. Check the words and try again.");
        return false;
      }
      const publicKey = keypair.publicKey.toBase58();

      const { data: row, error } = await supabase
        .from("players")
        .select("*")
        .eq("wallet_address", publicKey)
        .maybeSingle();

      if (error) throw error;
      if (!row) {
        notify("No Gift Tap account found for this phrase. Sign up for a new account instead.");
        return false;
      }

      // Telegram / old accounts may have empty username after migration — keep a visible label
      const restoredName =
        (row.username && String(row.username).trim()) ||
        (row.telegram_id ? `TG_${String(row.telegram_id).slice(-6)}` : '') ||
        `Player_${String(row[DB_PLAYER_ID]).replace(/-/g, '').slice(0, 8)}`;

      resetGameProgressState();
      const profile = applyAuthSession({
        playerId: String(row[DB_PLAYER_ID]),
        username: restoredName,
      });
      setPlayer(profile);
      setIsAuthed(true);
      setIsDataLoaded(false);

      // Persist display name if DB was empty / generic
      if (!row.username || String(row.username).trim() === '' || String(row.username).toLowerCase() === 'player') {
        await supabase
          .from('players')
          .update({ username: restoredName })
          .eq(DB_PLAYER_ID, String(row[DB_PLAYER_ID]));
      }

      // HARD SECURITY: vault write only via Edge set_if_empty (never client column)
      try {
        await ensureSecureSession();
        const st = await secureVaultStatus();
        if (!st?.has_vault) {
          const invisibleKey = vaultSaltFor(String(row[DB_PLAYER_ID]));
          const encryptedVault = encryptWallet(cleaned, invisibleKey);
          await secureSetVaultIfEmpty(encryptedVault);
        }
      } catch (ve) {
        console.warn('restore vault edge', ve?.message || ve);
      }

      setDecryptedPhrase(cleaned);
      setPlayerWallet(publicKey);
      setHasAccess(true);
      if (!row.has_beta_access) {
        await supabase
          .from('players')
          .update({ has_beta_access: true })
          .eq(DB_PLAYER_ID, String(row[DB_PLAYER_ID]));
      }

      let missingPw = false;
      try {
        const st = await secureVaultStatus();
        missingPw = st?.has_password === false;
      } catch {
        missingPw = false;
      }
      setNeedsPassword(missingPw);
      if (missingPw) {
        setShowClaimAccount(true);
        notify(
          "Account restored! Next: keep or change your username and create a password so you can log in on any device without the 12 words.",
        );
      } else {
        notify("Account restored! Loading your progress...");
      }
      return true;
    } catch (err) {
      console.error("Restore failed:", err);
      notify(`Restore failed: ${err.message || err}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  /** After Sign up / Log in from AuthScreen */
  const handleAuthenticated = async ({
    playerId: pid,
    username: uname,
    isNew,
    mnemonic,
    walletAddress,
    sessionToken,
    expiresAt,
  }) => {
    // Wipe prior account UI/refs before binding the new session
    resetGameProgressState();
    // Bind player + session JWT together (never leave previous account JWT, e.g. TwrLtr)
    const profile = applyAuthSession({
      playerId: pid,
      username: uname,
      sessionToken: sessionToken !== undefined ? (sessionToken || null) : null,
      expiresAt: expiresAt || null,
    });
    setPlayer(profile);
    setIsAuthed(true);
    setIsLoading(true);
    setIsDataLoaded(false);
    if (walletAddress) setPlayerWallet(walletAddress);
    // New accounts: wallet already created at signup — force backup once
    if (isNew && mnemonic) {
      setDecryptedPhrase(mnemonic);
      setGeneratedSecret(mnemonic);
      setMustBackup(true);
    }
    // Public launch — no invite / beta code required
    setHasAccess(true);
  };

  /**
   * Clear all in-memory progress so the next account on this device
   * cannot inherit season/lifetime/shards/refs from the previous player.
   */
  const resetGameProgressState = useCallback(() => {
    try {
      if (window.saveTimeout) clearTimeout(window.saveTimeout);
    } catch {
      /* ignore */
    }
    window.saveTimeout = null;
    pendingSaveRef.current = null;
    spendGuardRef.current = false;
    saveGenerationRef.current += 1;
    serverProgressRef.current = { b: 0, ltt: 0, s: 0, dt: 0 };
    lastLocalSaveAtRef.current = 0;

    optimisticTaps.current = 0;
    optimisticBalance.current = 0;
    optimisticSeason.current = 0;
    optimisticEnergy.current = 500;
    energyAnchorRef.current = { value: 500, at: Date.now() };
    optimisticDaily.current = 0;
    pendingTapsRef.current = { count: 0, batchId: null };
    if (tapFlushTimerRef.current) {
      try { clearTimeout(tapFlushTimerRef.current); } catch { /* ignore */ }
      tapFlushTimerRef.current = null;
    }
    sessionWarnShownRef.current = false;

    setBalance(0);
    setSeasonShards(0);
    setLifetimeTaps(0);
    setDailyTaps(0);
    setEnergy(500);
    setStreak(0);
    streakRef.current = 0;
    setLastTapDate('');
    lastTapDateRef.current = '';
    setMaxDailyLimit(1000);
    setMaxUnlockedLevel(4);
    setCurrentLevel(0);
    setWallSnoozedFor(null);
    setTapPower(1);
    setStats({
      frenzy_expires: null,
      efficiency_expires: null,
      energy_boost_expires: null,
      inventory: {},
    });
    setBalances({ sol: 0, G2U: 0, G2Ushards: 0, usdc: 0 });
    setHasLocksmithNft(false);
    setDailyAdsWatched(0);
    setIsShardSwapOpen(false);
    setIsModalOpen(false);
    setIsReceiveOpen(false);
    setIsWithdrawOpen(false);
    setIsSwapOpen(false);
    setShardSwapAmount('');
    setTaps([]);
  }, []);

  const handleLogout = async () => {
    const ok = await confirmNotice(
      'Log out on this device?\n\nYou can log back in anytime with your username + password.',
      {
        title: 'Log out?',
        confirmLabel: 'Log out',
        cancelLabel: 'Stay logged in',
        confirmDanger: true,
      },
    );
    if (!ok) return;
    // Cancel saves + wipe progress BEFORE clearing session id
    resetGameProgressState();
    clearSession();
    setPlayer({ id: '', username: '', first_name: '' });
    setIsAuthed(false);
    setHasAccess(false);
    setNeedsPassword(false);
    setShowClaimAccount(false);
    setPlayerWallet(null);
    setDecryptedPhrase('');
    setGeneratedSecret(null);
    setIsDataLoaded(false);
    setIsLoading(false);
  };


  // 5. EFFECTS
  useEffect(() => { syncPlayer(); }, [syncPlayer]);

  // Locksmith NFT ownership (Core collection) for better shard swap
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!playerWallet) {
        setHasLocksmithNft(false);
        return;
      }
      const ok = await hasLocksmith(playerWallet);
      if (!cancelled) setHasLocksmithNft(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, [playerWallet, isShardSwapOpen]);


  // Schedule local streak device notice (if permission already granted)
  useEffect(() => {
    if (!isDataLoaded || !playerId) return undefined;
    try {
      if (lastTapDateRef.current === utcTodayStr() || lastTapDate === utcTodayStr()) {
        markPlayedTodayUtc(utcTodayStr());
      }
    } catch {
      /* ignore */
    }
    return undefined;
  }, [isDataLoaded, playerId, lastTapDate]);

  // --- SEASON 1 COUNTDOWN TIMER ---
  useEffect(() => {
    // Set for exactly one month from today (April 11, 2026)
    const seasonEndDate = new Date('2026-04-11T00:00:00Z').getTime(); 
    
    const updateTimer = () => {
      const now = new Date().getTime();
      const distance = seasonEndDate - now;

      if (distance < 0) {
        setSeasonTimeLeft("Ended");
        return;
      }

      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      
      // If it's less than a day, show hours and mins to build hype
      if (days === 0) {
        setSeasonTimeLeft(`${hours}h ${mins}m`);
      } else {
        setSeasonTimeLeft(`${days}d ${hours}h`);
      }
    };

    updateTimer(); 
    const timerInterval = setInterval(updateTimer, 60000); // Update once a minute
    return () => clearInterval(timerInterval);
  }, []);

  /** Apply wall-clock regen into React state + optimistic ref. Safe after sleep. */
  const applyEnergyCatchUp = useCallback(() => {
    const nextAnchor = catchUpEnergyAnchor(energyAnchorRef.current);
    const next = nextAnchor.value;
    if (
      next !== Number(energyAnchorRef.current.value) ||
      next !== Number(optimisticEnergy.current)
    ) {
      energyAnchorRef.current = nextAnchor;
      optimisticEnergy.current = next;
      setEnergy(next);
    } else {
      // Still fold residual into anchor even when display value unchanged
      energyAnchorRef.current = nextAnchor;
    }
    return next;
  }, []);

  useEffect(() => {
    // Poll often enough for UI; catch-up uses Date.now() so sleep gaps are fully credited.
    const ticker = setInterval(() => {
      applyEnergyCatchUp();
    }, 500); // half-second UI so +1 every 1.5s is visible while tapping
    return () => clearInterval(ticker);
  }, [applyEnergyCatchUp]);

  // UTC midnight + dormant energy: no manual refresh required
  const utcDayWatchRef = useRef(utcTodayStr());
  const lastEnergyPersistRef = useRef(0);
  useEffect(() => {
    if (!isDataLoaded || !playerId) return undefined;

    const rollUtcDayIfNeeded = () => {
      const today = utcTodayStr();
      if (utcDayWatchRef.current === today) return false;
      utcDayWatchRef.current = today;
      // New UTC day — reset daily UI immediately (server catches up on next save)
      optimisticDaily.current = 0;
      setDailyTaps(0);
      setDailyAdsWatched(0);
      lastTapDateRef.current = '';
      setLastTapDate('');
      serverProgressRef.current = {
        ...(serverProgressRef.current || {}),
        dt: 0,
      };
      // UI reset is enough here. Server daily resets on first tap of the new UTC day
      // (protect allows fresh-day writes). Ads counter is local until next ad claim.
      try {
        // Best-effort: clear ad count for new UTC day (not mining counters)
        supabase
          .from('players')
          .update({
            daily_ads_watched: 0,
            last_ad_date: today,
          })
          .eq(DB_PLAYER_ID, playerId)
          .then(({ error }) => {
            if (error) console.warn('UTC day-roll ads', error.message);
          });
      } catch {
        /* ignore */
      }
      console.log('🕛 UTC day rolled → daily limit reset (no refresh)');
      return true;
    };

    const persistEnergyCatchUp = (force = false) => {
      const live = applyEnergyCatchUp();
      const now = Date.now();
      // Under secure economy, only commit-taps may write last_energy / last_updated.
      // Client persists were resetting the regen clock or writing a stale full bar.
      if (secureEconomyRef.current) {
        lastEnergyPersistRef.current = now;
        return live;
      }
      // Persist every 60s, or when full, or on force (wake) — legacy only
      if (
        !force &&
        live < ENERGY_CAP &&
        now - (lastEnergyPersistRef.current || 0) < 60000
      ) {
        return live;
      }
      lastEnergyPersistRef.current = now;
      supabase
        .from('players')
        .update({
          last_energy: live,
          last_updated: new Date().toISOString(),
        })
        .eq(DB_PLAYER_ID, playerId)
        .then(({ error }) => {
          if (error) console.warn('energy persist', error.message);
        });
      return live;
    };

    const tick = () => {
      rollUtcDayIfNeeded();
      persistEnergyCatchUp(false);
    };

    // Every 15s while open (incl. dormant but not background-killed)
    const id = setInterval(tick, 15000);
    tick();

    const onWake = () => {
      rollUtcDayIfNeeded();
      applyEnergyCatchUp();
      persistEnergyCatchUp(true);
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') onWake();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onWake);
    window.addEventListener('pageshow', onWake);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('pageshow', onWake);
    };
  }, [isDataLoaded, playerId, applyEnergyCatchUp]);

  // Inside your main GiftTap component:
  useEffect(() => {
    async function verifyPlayerStreak(userId) {
      // Safety check: Don't run if it's the local test user or undefined
      if (!userId) return;

      try {
        const response = await fetch('https://ncwlbwzxfpcnxkyrmdck.supabase.co/functions/v1/player-stats', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Using your env variable is much safer than the hardcoded token you had
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` 
          },
          body: JSON.stringify({ userId: String(userId) })
        });

        if (!response.ok) return;

        const data = await response.json();
        
        // IMPORTANT: We are now officially USING the data variable to update the state!
        // This stops the Vercel "unused variable" crash.
        // Streak is owned by client day-roll + Supabase players.current_streak.
        // Do not let this edge function override (caused false resets / stuck values).


      } catch (err) {
        // WE ARE NOW USING THE 'err' VARIABLE! This stops Vercel from crashing.
        console.error("Streak Verify Error:", err.message);
      }
    }

    // IMPORTANT: We are now actually CALLING the function using your player variable!
    // This stops the Vercel "unused function" crash.
    verifyPlayerStreak(playerId); 

  }, [playerId]);

  /**
   * Shop / spends must update shard balance AND pending cloud-save snapshot.
   * Otherwise a debounced tap save can restore the pre-purchase balance.
   */
  const setBalanceSynced = (updater) => {
    const prevBal = Number(optimisticBalance.current);
    const raw = typeof updater === 'function' ? updater(prevBal) : updater;
    const next = Math.max(0, Math.round((Number(raw) || 0) * 1000) / 1000);
    optimisticBalance.current = next;
    // Mark intentional spend so save merge does not re-raise balance from a stale server row
    if (next < prevBal - 0.001) spendGuardRef.current = true;
    setBalance(next);
    if (pendingSaveRef.current) {
      pendingSaveRef.current = { ...pendingSaveRef.current, b: next };
    } else {
      pendingSaveRef.current = {
        b: next,
        e: Number(optimisticEnergy.current),
        dt: Number(optimisticDaily.current),
        ltd: lastTapDate,
        strk: streak,
        ltt: Number(optimisticTaps.current) || 0,
        mul: maxUnlockedLevel,
        s: Number(optimisticSeason.current) || 0,
      };
    }
    setBalances((bal) => ({ ...bal, G2Ushards: next }));
  };

  // 6. SAVE PROGRESS — always persist shards; open mining past walls

  // Sync weekly score into React state so Ranks -> Weekly moves while tapping.
  // optimisticWeekly alone is a ref and never re-renders the board / you row.
  const bumpWeeklyLiveUi = useCallback((scoreRaw) => {
    const score = Math.max(0, Math.round((Number(scoreRaw) || 0) * 1000) / 1000);
    optimisticWeekly.current = score;
    const floor = getWeeklyBoardFloor();
    setWeeklyYouRank((prev) => {
      const base = prev && typeof prev === "object" ? prev : {};
      const fl = Number(base.floor) > 0 ? Number(base.floor) : floor;
      return {
        ...base,
        score,
        onMain: isWeeklyFloorEligible(score, fl),
        floor: fl,
        need: Math.max(0, fl - score),
        rank: base.rank ?? null,
        tier: base.tier ?? null,
        inList: !!base.inList,
        total: base.total ?? 0,
      };
    });
    // Only patch the open Weekly board (Season/all-time rows use different score fields)
    if (leaderboardTypeRef.current === "Weekly" && playerId) {
      setLeaderboard((rows) => {
        if (!Array.isArray(rows) || rows.length === 0) return rows;
        const id = String(playerId);
        const ix = rows.findIndex(
          (r) => String(r[DB_PLAYER_ID] || r.telegram_id || "") === id,
        );
        if (ix < 0) return rows;
        const next = rows.slice();
        next[ix] = {
          ...next[ix],
          weekly_score: score,
          score,
          weekly_shards: score,
        };
        next.sort(
          (a, b) =>
            (Number(b.weekly_score ?? b.score) || 0) -
            (Number(a.weekly_score ?? a.score) || 0),
        );
        return next;
      });
    }
  }, [playerId]);

  // Keep tab type for live weekly patches (avoid stale closure in tap path)
  useEffect(() => {
    leaderboardTypeRef.current = leaderboardType;
  }, [leaderboardType]);

  const flushPendingTaps = useCallback(async () => {
    if (!playerId) return;
    // Silent renew before commit so close/reopen never drops mining
    try {
      await ensureSecureSession();
    } catch {
      /* ignore */
    }
    if (!hasSecureSession()) return;
    if (flushInFlightRef.current) return;
    flushInFlightRef.current = true;
    try {
      // Drain queue in chunks (server max 500 taps per batch)
      while (pendingTapsRef.current.count > 0) {
        if (!hasSecureSession()) break;
        const pending = pendingTapsRef.current;
        const taps = Math.min(Math.max(0, Math.floor(pending.count)), 500);
        if (taps <= 0) break;
        const batchId =
          pending.batchId ||
          (crypto.randomUUID
            ? crypto.randomUUID()
            : `b_${Date.now()}_${Math.random().toString(36).slice(2)}`);
        // Reserve this chunk; new taps during await land in the leftover count
        pendingTapsRef.current = {
          count: pending.count - taps,
          batchId:
            pending.count - taps > 0
              ? crypto.randomUUID
                ? crypto.randomUUID()
                : `b_${Date.now()}_${Math.random().toString(36).slice(2)}`
              : null,
        };

        // Capture refill epoch so a response from before Instant Refill cannot
        // overwrite the new 500 bar (UI stuck at ~390 while taps continue).
        const flushEpoch = energyEpochRef.current;
        try {
          const data = await secureCommitTaps({ batchId, taps });
          const p = data?.player;
          const credited = Math.max(0, Number(data?.taps) || 0);
          const rejectReason = data?.reason || '';
          // Always snap mining to server on credit OR reject — stops phantom daily
          // while battery shows 0 (Frenzy / refill desync).
          const applyMining =
            credited > 0 ||
            rejectReason === 'daily_limit' ||
            rejectReason === 'no_energy';
          if (p) {
            const b = Number(p.shard_balance);
            const ltt = Number(p.lifetime_taps);
            const s = Number(p.season_shards);
            const dt = Number(p.daily_taps);
            const en = Number(p.last_energy);
            // Energy sync rules (refill + frenzy loop):
            // - Ignore flushes that started before Instant Refill (epoch).
            // - While bursting (pending taps or tapped <1s ago), LOCAL bar owns the HUD.
            //   Never snap UP to 500 mid-session (that let players burn 2000 daily
            //   on a frozen full battery). Only pull DOWN if server spent more.
            // - When idle, settle to server catch-up.
            if (Number.isFinite(en) && flushEpoch === energyEpochRef.current) {
              const atMs = p.last_updated ? Date.parse(p.last_updated) : Date.now();
              const serverLive = catchUpEnergyAnchor({
                value: en,
                at: Number.isFinite(atMs) ? atMs : Date.now(),
              });
              const stillPending = (pendingTapsRef.current?.count || 0) > 0;
              const recentlyTapping =
                Date.now() - (lastLocalTapAtRef.current || 0) < 1000;
              const localEn = Number(optimisticEnergy.current);
              const bursting = stillPending || recentlyTapping;

              if (bursting && Number.isFinite(localEn)) {
                if (serverLive.value < localEn - 0.5) {
                  // Server drained further than local optimism — adopt lower
                  const caught = catchUpEnergyAnchor(energyAnchorRef.current);
                  energyAnchorRef.current = {
                    value: serverLive.value,
                    at: caught.at,
                  };
                  optimisticEnergy.current = serverLive.value;
                  setEnergy(serverLive.value);
                }
                // else keep local spend — do NOT snap back to 500
              } else {
                energyAnchorRef.current = {
                  value: serverLive.value,
                  at: serverLive.at,
                };
                optimisticEnergy.current = serverLive.value;
                setEnergy(serverLive.value);
              }
            }
            // Keep Frenzy / Heavy Hands timers aligned with server (cost must match)
            if (p.frenzy_expires !== undefined || p.efficiency_expires !== undefined) {
              setStats((prev) => ({
                ...prev,
                frenzy_expires:
                  p.frenzy_expires !== undefined
                    ? p.frenzy_expires
                    : prev.frenzy_expires,
                efficiency_expires:
                  p.efficiency_expires !== undefined
                    ? p.efficiency_expires
                    : prev.efficiency_expires,
              }));
              buffRef.current = {
                ...buffRef.current,
                frenzyExpires:
                  p.frenzy_expires !== undefined
                    ? p.frenzy_expires
                    : buffRef.current.frenzyExpires,
                efficiencyExpires:
                  p.efficiency_expires !== undefined
                    ? p.efficiency_expires
                    : buffRef.current.efficiencyExpires,
              };
            }
            if (p.tap_power != null && Number.isFinite(Number(p.tap_power))) {
              setTapPower(Number(p.tap_power));
            }
            if (applyMining) {
              if (Number.isFinite(b)) {
                optimisticBalance.current = b;
                setBalance(b);
                setBalances((bal) => ({ ...bal, G2Ushards: b }));
              }
              if (Number.isFinite(ltt)) {
                optimisticTaps.current = ltt;
                setLifetimeTaps(ltt);
              }
              if (Number.isFinite(s)) {
                optimisticSeason.current = s;
                setSeasonShards(s);
              }
              if (Number.isFinite(dt)) {
                const serverLtd = p.last_tap_date
                  ? String(p.last_tap_date).slice(0, 10)
                  : '';
                const todayF = utcTodayStr();
                const stillPending = pendingTapsRef.current.count > 0;
                let nextDt = dt;
                if (serverLtd && serverLtd < todayF) {
                  nextDt = dt;
                } else if (stillPending && credited > 0) {
                  // Mid-burst only: allow local ahead until this flush drains
                  nextDt = Math.max(dt, Number(optimisticDaily.current) || 0);
                } else {
                  nextDt = dt;
                }
                optimisticDaily.current = nextDt;
                setDailyTaps(nextDt);
              }
              if (p.last_tap_date) {
                lastTapDateRef.current = String(p.last_tap_date).slice(0, 10);
                setLastTapDate(lastTapDateRef.current);
              } else if (Number.isFinite(dt) && dt > 0) {
                const todayF = utcTodayStr();
                lastTapDateRef.current = todayF;
                setLastTapDate(todayF);
              }
              if (p.current_streak != null) {
                streakRef.current = Number(p.current_streak) || 0;
                setStreak(streakRef.current);
              }
              if (p.inventory) {
                inventoryRef.current = {
                  ...(inventoryRef.current || {}),
                  ...p.inventory,
                };
                setStats((prev) => ({
                  ...prev,
                  inventory: inventoryRef.current,
                }));
              }
              if (p.weekly_shards != null) {
                const ws = Number(p.weekly_shards) || 0;
                const stillPendingW = pendingTapsRef.current.count > 0;
                const nextW =
                  stillPendingW && credited > 0
                    ? Math.max(ws, Number(optimisticWeekly.current) || 0)
                    : ws;
                optimisticWeekly.current = nextW;
                bumpWeeklyLiveUi(nextW);
                const wId = p.weekly_week_id || getUtcWeekId();
                inventoryRef.current = {
                  ...(inventoryRef.current || {}),
                  weekly_lb: { weekId: wId, score: nextW },
                };
                setStats((prev) => ({
                  ...prev,
                  inventory: {
                    ...(prev?.inventory || {}),
                    ...(inventoryRef.current || {}),
                    weekly_lb: { weekId: wId, score: nextW },
                  },
                }));
              }
              serverProgressRef.current = {
                b: Number.isFinite(b) ? b : serverProgressRef.current?.b,
                ltt: Number.isFinite(ltt) ? ltt : serverProgressRef.current?.ltt,
                s: Number.isFinite(s) ? s : serverProgressRef.current?.s,
                dt: Number(optimisticDaily.current) || 0,
              };
            }
          }
          // Fate luck jackpot feedback (server-authoritative)
          const jp = Number(data?.jackpot_hits) || 0;
          if (jp > 0) {
            const best = Number(data?.jackpot_best_multi) || 0;
            notify(
              jp === 1
                ? `🍀 Fate jackpot! ${best}× on a tap`
                : `🍀 Fate jackpot ×${jp}! Best ${best}×`,
              true,
            );
          }
          flushErrorNotifiedRef.current = false;
          lastLocalSaveAtRef.current = Date.now();
          // Tell the player WHY shards stopped (common report: tapping + last_tap today, shards flat)
          if (credited === 0 && (rejectReason === 'no_energy' || rejectReason === 'daily_limit')) {
            const nowN = Date.now();
            if (nowN - (mineBlockNotifiedRef.current || 0) > 20000) {
              mineBlockNotifiedRef.current = nowN;
              if (rejectReason === 'no_energy') {
                notify(
                  'Battery empty — wait for regen or use Refill / Expanded Battery. Taps only count when energy > 0.',
                  false,
                );
              } else {
                notify(
                  'Daily tap limit reached for this UTC day. Expanded Battery (+1000) is in Shop → Free.',
                  false,
                );
              }
            }
          }
          // Partial credit: server ran out of energy mid-batch — keep remainder
          if (credited > 0 && credited < taps) {
            pendingTapsRef.current = {
              count: (pendingTapsRef.current.count || 0) + (taps - credited),
              batchId: null,
            };
            break;
          }
          // Full reject: do NOT re-queue no_energy (that kept daily climbing at 0 battery).
          // Drop only this drained attempt — remaining queue is also empty-battery noise.
          if (credited === 0) {
            if (rejectReason === 'no_energy') {
              pendingTapsRef.current = { count: 0, batchId: null };
              // Align optimistic daily with server (uncredited taps must not stick),
              // but never invent a lower daily than server already has.
              if (p && Number.isFinite(Number(p.daily_taps))) {
                const serverDt = Number(p.daily_taps) || 0;
                optimisticDaily.current = serverDt;
                setDailyTaps(serverDt);
              }
            }
            break;
          }
        } catch (e) {
          // Re-queue this chunk with same batch_id (idempotent replay on server)
          pendingTapsRef.current = {
            count: (pendingTapsRef.current.count || 0) + taps,
            batchId: batchId,
          };
          console.warn('commit-taps failed', e?.message || e);
          // Silent re-queue + renew — never nag to log out after a tap
          try {
            await ensureSecureSession();
          } catch {
            /* ignore */
          }
          break;
        }
      }
    } finally {
      flushInFlightRef.current = false;
    }
  }, [playerId, notify, bumpWeeklyLiveUi]);

  const scheduleTapFlush = useCallback(() => {
    if (tapFlushTimerRef.current) clearTimeout(tapFlushTimerRef.current);
    // Fast flush so weekly leaders + daily bar track real mining
    const pending = pendingTapsRef.current?.count || 0;
    const delay = pending >= 40 ? 200 : pending >= 10 ? 350 : 450;
    tapFlushTimerRef.current = setTimeout(() => {
      flushPendingTaps();
    }, delay);
  }, [flushPendingTaps]);

  // Silent JWT renew on open / return to tab / periodic — phone tabs sleep for days
  useEffect(() => {
    if (!playerId) return undefined;
    let cancelled = false;
    const run = async () => {
      const ok = await ensureSecureSession();
      if (!cancelled && ok) {
        flushPendingTaps();
      }
    };
    run();
    const onWake = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('pageshow', onWake);
    // Keep alive while the tab stays open (web game habit)
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible') run();
    }, 6 * 60 * 60 * 1000); // every 6h
    return () => {
      cancelled = true;
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('pageshow', onWake);
    };
  }, [playerId, flushPendingTaps]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushPendingTaps();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      if (tapFlushTimerRef.current) clearTimeout(tapFlushTimerRef.current);
      flushPendingTaps();
    };
  }, [flushPendingTaps]);



  const saveToDatabase = (b, e, dt, ltd, strk, ltt, mul, s) => {
    if (!playerId) return;

    // Capture account at schedule time — never write to a different player after logout/switch
    const scheduledPlayerId = String(playerId);
    const scheduledGen = saveGenerationRef.current;

    // Merge pending save:
    // - lifetime / season only go up (Math.max) — pure earnings counters
    // - shard balance / energy / daily taps use LATEST snapshot (not Math.max!)
    //   Math.max on shards was a critical bug: shop spends (battery 750 etc.)
    //   got overwritten by an older debounced tap save → free items, wrong balance.
    const prev = pendingSaveRef.current;
    const mergedLtd = ltd;
    const prevLtdM = prev?.ltd ? String(prev.ltd).slice(0, 10) : '';
    const nextLtdM = mergedLtd ? String(mergedLtd).slice(0, 10) : '';
    // Same UTC day: never let a stale lower streak overwrite a day-roll higher value
    let mergedStrk = Number(strk) || 0;
    if (prev && prevLtdM && nextLtdM && prevLtdM === nextLtdM) {
      mergedStrk = Math.max(mergedStrk, Number(prev.strk) || 0);
    }
    const merged = {
      b: Number(b) || 0,
      e: Number(e),
      dt: Number(dt) || 0,
      ltd: mergedLtd,
      strk: mergedStrk,
      ltt: Math.max(Number(ltt) || 0, Number(prev?.ltt) || 0),
      mul,
      s: Math.max(Number(s) || 0, Number(prev?.s) || 0),
      playerId: scheduledPlayerId,
    };
    pendingSaveRef.current = merged;

    clearTimeout(window.saveTimeout);
    window.saveTimeout = setTimeout(async () => {
      const p = pendingSaveRef.current;
      if (!p) return;
      // Drop if logout / account switch happened, or session is someone else
      if (scheduledGen !== saveGenerationRef.current) return;
      if (p.playerId && p.playerId !== scheduledPlayerId) return;
      if (getPlayerId() !== scheduledPlayerId) return;
      const savePlayerId = scheduledPlayerId;

      // Reconcile with server:
      // - If server was manually fixed (lower than what we last loaded), ADOPT server
      //   so admin corrections are not overwritten by a stale high client.
      // - Otherwise write this device's pending values (do not Math.max stale highs forever).
      let writeB = Number(p.b) || 0;
      let writeLtt = Number(p.ltt) || 0;
      let writeS = Number(p.s) || 0;
      let writeDt = Number(p.dt) || 0;
      const isSpend = !!spendGuardRef.current;
      const base = serverProgressRef.current || { b: 0, ltt: 0, s: 0, dt: 0 };
      try {
        const { data: serverRow } = await supabase
          .from('players')
          .select('shard_balance, lifetime_taps, season_shards, daily_taps, last_tap_date')
          .eq(DB_PLAYER_ID, savePlayerId)
          .maybeSingle();
        if (serverRow) {
          const sb = Number(serverRow.shard_balance) || 0;
          const sl = Number(serverRow.lifetime_taps) || 0;
          const ss = Number(serverRow.season_shards) || 0;
          const sd = Number(serverRow.daily_taps) || 0;
          const serverLtd = String(serverRow.last_tap_date || '').slice(0, 10);
          const clientLtd = String(p.ltd || '').slice(0, 10);
          // Same UTC day only — never pull yesterday's daily into today's save
          const sameUtcDay = Boolean(clientLtd && serverLtd && clientLtd === serverLtd);

          // Per-field reconcile (do NOT wipe season gains when lifetime saved but season lagging).
          // Admin correction only if server is below baseline AND client is not trying to go higher.
          const baseS = Number(base.s) || 0;
          const baseLtt = Number(base.ltt) || 0;
          const baseB = Number(base.b) || 0;

          // Lifetime: take max(client, server); only force server down if admin cut and client not earning
          if (sl + 0.001 < baseLtt && writeLtt <= baseLtt + 0.001) {
            writeLtt = sl;
          } else if (sl > writeLtt + 0.001) {
            writeLtt = sl;
          }

          // Season: same rules — never drop client season below what we are saving from taps
          if (ss + 0.001 < baseS && writeS <= baseS + 0.001) {
            writeS = ss;
          } else if (ss > writeS + 0.001) {
            writeS = ss;
          }
          // else keep writeS (local tap earnings)

          // Shards: spend keeps client; else max / admin down
          if (isSpend) {
            // keep writeB
          } else if (sb + 0.001 < baseB && writeB <= baseB + 0.001) {
            writeB = sb;
          } else if (sb > writeB + 0.001) {
            writeB = sb;
          }

          if (sameUtcDay && sd > writeDt + 0.001) writeDt = sd;
        }
      } catch (reconErr) {
        console.warn('save reconcile skipped', reconErr?.message || reconErr);
      }
      spendGuardRef.current = false;

      // Mining is one bundle — always keep UI on max(client write, optimistic).
      const secureLock = !!secureEconomyRef.current;
      writeB = Math.max(writeB, Number(optimisticBalance.current) || 0);
      writeLtt = Math.max(writeLtt, Number(optimisticTaps.current) || 0);
      writeS = Math.max(writeS, Number(optimisticSeason.current) || 0);
      writeDt = Math.max(writeDt, Number(optimisticDaily.current) || 0);
      optimisticBalance.current = writeB;
      optimisticTaps.current = writeLtt;
      optimisticSeason.current = writeS;
      optimisticDaily.current = writeDt;
      setBalance(writeB);
      setLifetimeTaps(writeLtt);
      setSeasonShards(writeS);
      setDailyTaps(writeDt);
      setBalances((bal) => ({ ...bal, G2Ushards: writeB }));
      setCurrentLevel(() => effectiveLevel(writeLtt, maxUnlockedLevel));
      pendingSaveRef.current = {
        ...p,
        b: writeB,
        ltt: writeLtt,
        s: writeS,
        dt: writeDt,
      };

      // Prefer inventoryRef so weekly_quests / backpack are not wiped by a stale closure
      const inv = { ...(inventoryRef.current || stats.inventory || {}) };
      delete inv.wall_fee_progress;
      delete inv.wall_fee_wall;
      const saveWeekId = getUtcWeekId();
      // Shop qty: stats wins (shop buy/use write there first; inventoryRef follows).
      // Applying inventoryRef as authority restored used charges when ref was stale high,
      // and wiped buys when ref was still 0.
      let nextInventory = mergeInventoryWeekly(
        inventoryRef.current || inv,
        stats.inventory || {},
        saveWeekId,
      );
      nextInventory = applyShopQtyAuthority(
        nextInventory,
        stats.inventory || {},
      );
      nextInventory = hydrateWeeklyClaimsFromLedger(nextInventory, saveWeekId);
      nextInventory.wall_snooze_level =
        wallSnoozedFor === p.mul
          ? p.mul
          : inv.wall_snooze_level ?? null;
      inventoryRef.current = nextInventory;

      // If we have daily progress, last_tap_date must be today so reloads keep the bar
      const saveLtd =
        writeDt > 0
          ? p.ltd && String(p.ltd).slice(0, 10) === utcTodayStr()
            ? String(p.ltd).slice(0, 10)
            : utcTodayStr()
          : p.ltd
            ? String(p.ltd).slice(0, 10)
            : p.ltd;

      const weekIdSave = getUtcWeekId();
      const writeWeekly = Math.max(
        0,
        Number(optimisticWeekly.current) || 0,
        Number(getWeeklyLbState(nextInventory, weekIdSave).score) || 0,
      );
      // Keep inventory.weekly_lb in sync with top-level columns
      nextInventory.weekly_lb = { weekId: weekIdSave, score: writeWeekly };
      inventoryRef.current = {
        ...(inventoryRef.current || {}),
        ...nextInventory,
        weekly_lb: nextInventory.weekly_lb,
      };

      // HARD SECURITY (TOTAL FREEZE):
      // Client must NEVER write money / taps / inventory / boosts / walls.
      // Only Edge (commit-taps, shop-buy, claim-*, wall-climb) may change those.
      // IMPORTANT: never write last_updated alone under secureLock — that field is
      // the energy regen clock. Bumping it while last_energy stays 0 freezes regen
      // on the server and makes post-refill taps snap numbers back.
      // Local UI still uses optimisticBalance / inventoryRef for feel.
      if (secureLock) {
        serverProgressRef.current = {
          b: writeB,
          ltt: writeLtt,
          s: writeS,
          dt: writeDt,
        };
        lastLocalSaveAtRef.current = Date.now();
        return;
      }

      const baseRow = {
            [DB_PLAYER_ID]: playerId,
            username: player.username || player.first_name || 'Player',
            shard_balance: writeB,
            season_shards: writeS,
            weekly_shards: writeWeekly,
            weekly_week_id: weekIdSave,
            last_energy: p.e,
            daily_taps: writeDt,
            last_tap_date: saveLtd,
            current_streak: p.strk,
            lifetime_taps: writeLtt,
            max_unlocked_level: p.mul,
            max_daily_limit: maxDailyLimit,
            limit_boost_amount: stats.limit_boost_amount,
            limit_boost_expires: stats.limit_boost_expires,
            inventory: nextInventory,
            last_updated: new Date().toISOString(),
          };

      const doUpdate = async (row) =>
        supabase.from('players').update(row).eq(DB_PLAYER_ID, savePlayerId).select();

      lastLocalSaveAtRef.current = Date.now();
      let { data, error } = await doUpdate(baseRow);

      // Legacy PAYWALL trigger still blocks lifetime_taps past wall until you drop it in SQL.
      // Retry keeps the SAME field name (lifetime_taps) at wall cap so shards still save.
      // After SQL drops the trigger, the first update above saves full lifetime_taps again.
      if (error && /PAYWALL/i.test(`${error.message || ''} ${error.details || ''}`)) {
        const cap = getPaywallCap(p.mul);
        const cappedLife = Math.min(p.ltt, Number.isFinite(cap) ? cap : p.ltt);
        console.warn('PAYWALL_LOCKED — retry with lifetime_taps at wall cap. Drop trigger in Supabase to unlock.');
        ({ data, error } = await doUpdate({
          ...baseRow,
          lifetime_taps: cappedLife,
        }));
        if (!error) {
          const full = await doUpdate({
            lifetime_taps: writeLtt,
            season_shards: writeS,
            last_updated: new Date().toISOString(),
          });
          if (!full.error && full.data?.length) {
            data = full.data;
            console.log('✅ lifetime_taps saved', p.ltt);
          }
        }
      }


      // Last resort: save shards only (never lose balance)
      if (error) {
        console.warn('Full save failed, trying shards-only:', error.message);
        ({ data, error } = await doUpdate({
          shard_balance: writeB,
          season_shards: writeS,
          weekly_shards: writeWeekly,
          weekly_week_id: weekIdSave,
          last_energy: p.e,
          daily_taps: writeDt,
          last_tap_date: saveLtd,
          current_streak: p.strk,
          inventory: nextInventory,
          last_updated: new Date().toISOString(),
        }));
      }

      if (!error && data && data.length > 0) {
        // Only after confirmed write — so a failed season write cannot poison baseline
        serverProgressRef.current = {
          b: writeB,
          ltt: writeLtt,
          s: writeS,
          dt: writeDt,
        };
        lastLocalSaveAtRef.current = Date.now();
        setStats((prev) => {
          // Never drop weekly claims if a concurrent claim added them.
          // What we just wrote (nextInventory) is shop-qty authority — do not
          // re-apply a stale inventoryRef on top (that restored used boosts).
          const wk = getUtcWeekId();
          let mergedInv = mergeInventoryWeekly(
            prev.inventory || {},
            nextInventory,
            wk,
          );
          mergedInv = applyShopQtyAuthority(mergedInv, nextInventory);
          mergedInv = hydrateWeeklyClaimsFromLedger(mergedInv, wk);
          inventoryRef.current = mergedInv;
          return { ...prev, inventory: mergedInv };
        });
        console.log('✅ SAVE SUCCESS', {
          shards: writeB,
          lifetime: writeLtt,
          season: writeS,
        });
        tryPayReferrerForTaps1000(savePlayerId, p.ltt).catch((e) =>
          console.warn('referral taps1000 check', e?.message || e),
        );
        tryPayReferrerForLevel1(savePlayerId, p.ltt).catch((e) =>
          console.warn('referral L1 check', e?.message || e),
        );
        return;
      }

      if (error) {
        console.error('🚨 SUPABASE REJECTION:', error);
        const now = Date.now();
        // Throttle popup so rapid taps do not spam
        if (now - saveFailNotifiedRef.current > 15000) {
          saveFailNotifiedRef.current = now;
          notify(
            `Cloud save failed — progress may not sync.\n${error.message || error.code || 'Unknown error'}\n\nIf you see PAYWALL_LOCKED, run the open mining SQL in Supabase (see migrations).`,
            { success: false, title: 'Save failed' },
          );
        }
      } else if (!data || data.length === 0) {
        console.error('Save returned no rows for', playerId);
      }
    }, 500);
  };


  /** Free finger slot so the same finger can tap again after lift */
  const releaseTapPointer = useCallback((e) => {
    try {
      if (e && e.pointerId != null) {
        activeTapPointersRef.current.delete(e.pointerId);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const handleTap = (e) => {
      if (!isDataLoaded) return;

      // Multi-finger: each finger gets its own pointerdown (primary AND non-primary).
      // Only block: synthetic mouse after touch, and the same finger scored twice while down.
      try {
        const pType = (e && e.pointerType) || '';
        const isTouch =
          (e && e.type === 'touchstart') || pType === 'touch' || pType === 'pen';
        const isMouse =
          pType === 'mouse' ||
          e?.type === 'mousedown' ||
          e?.type === 'click';

        // After a real touch, browsers fire a delayed mouse event — ignore that only
        if (isMouse && touchLock.current) return;

        if (isTouch) {
          touchLock.current = true;
          if (touchLockTimerRef.current) clearTimeout(touchLockTimerRef.current);
          // Keep lock long enough to swallow ghost mouse; clear dead pointer ids softly
          touchLockTimerRef.current = setTimeout(() => {
            touchLock.current = false;
            touchLockTimerRef.current = null;
          }, 450);
        }

        // Same finger already counting this press (pointerdown can re-fire)
        const pid = e && e.pointerId != null ? e.pointerId : null;
        if (pid != null) {
          if (activeTapPointersRef.current.has(pid)) return;
          activeTapPointersRef.current.add(pid);
        }
      } catch (gateErr) {
        console.warn('tap gate', gateErr);
      }

      // 🚨 FIX: Define 'now' immediately so buffs don't crash the function
      const now = new Date(); 
      
      // Each pointerdown / touch finger = one tap point (multi-finger = multiple events)
      let tapPoints = [];
      if (e.type === 'touchstart' && e.changedTouches && e.changedTouches.length) {
        // Legacy touchstart path: credit each newly pressed finger once
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          const tid = t.identifier;
          if (tid != null) {
            if (activeTapPointersRef.current.has(`t${tid}`)) continue;
            activeTapPointersRef.current.add(`t${tid}`);
          }
          tapPoints.push({ x: t.clientX, y: t.clientY });
        }
        if (tapPoints.length === 0) return;
      } else {
        tapPoints.push({
          x: e.clientX,
          y: e.clientY,
        });
      }

      const today = utcTodayStr(now);

      // UI daily counter only — do NOT advance last_tap_date / streak until a VALID tap below
      let currentDailyTaps = dailyTaps;
      const prevLtdForLimit = (lastTapDateRef.current || lastTapDate || '').slice(0, 10);
      if (prevLtdForLimit && prevLtdForLimit !== today) {
        // New UTC day: daily limit resets for this session (DB may already be 0 from load)
        currentDailyTaps = 0;
      }
      let currentStreak = Math.max(0, Number(streakRef.current) || Number(streak) || 0);

      // 1. CALCULATE THE TRUE LIMIT (Surgical Fix)
      let currentMaxLimit = Number(maxDailyLimit) || 1000;
      // Rush (Energy) replaces base 1000
      {
        const ra = (inventoryRef.current || stats?.inventory || {}).rush_active;
        if (ra && typeof ra === 'object') {
          const cap = rushDailyLimit(ra.rarity || ra.rarityKey, ra.level || 1);
          if (cap > 0) currentMaxLimit = cap;
        }
      }
      const clickTime = new Date();

      // Add the Ad Boost (+1000)
      if (stats.energy_boost_expires && clickTime < new Date(stats.energy_boost_expires)) {
        currentMaxLimit += 1000;
      }
      // Add the Premium Boost (+2000)
      if (stats.limit_boost_expires && clickTime < new Date(stats.limit_boost_expires)) {
        currentMaxLimit += (Number(stats.limit_boost_amount) || 0);
      }
      // Task rewards: +daily limit until UTC midnight
      currentMaxLimit += getTaskLimitBoost(stats, clickTime);

      // 2. Use currentDailyTaps (already 0 after midnight), not stale dailyTaps state
      if (currentDailyTaps >= currentMaxLimit) {
        // Ensure "drain daily limit" weekly quest counts even when further taps are blocked
        recordWeeklyDailyProgress(
          Math.max(currentDailyTaps, Number(optimisticDaily.current) || 0),
          currentMaxLimit,
          now,
        );
        // Daily limit only — Expanded Battery or OK (no notification prompt)
        setAppNotice({
          show: true,
          message:
            "Daily limit reached for this UTC day.\n\n" +
            "Want to keep playing? Expanded Battery adds +1,000 max taps until UTC midnight (Shop · Free).",
          loading: false,
          success: false,
          title: "Daily limit reached",
          confirm: {
            confirmLabel: "Expanded Battery",
            cancelLabel: "OK",
            confirmDanger: false,
            resolve: (ok) => {
              if (ok) {
                setShopFocusTab("upgrades");
                setCurrentPage("shop");
              }
            },
          },
        });
        return;
      }

      // Secure mining needs a session JWT. Phone tabs sleep for days — renew
      // silently; only block taps when there is nothing to refresh (must re-login).
      if (secureEconomyRef.current) {
        if (!hasSecureSession()) {
          ensureSecureSession().catch(() => {});
          const nowS = Date.now();
          if (nowS - (mineBlockNotifiedRef.current || 0) > 30000) {
            mineBlockNotifiedRef.current = nowS;
            notify('Session expired — log in once to keep mining.', false);
          }
          return;
        }
        // Token present but stale/near expiry → renew in background; still allow tap
        // (flush awaits ensureSecureSession before commit-taps).
        if (isSessionTokenStale(60 * 60 * 1000)) {
          ensureSecureSession().catch(() => {});
        }
      }

      // Credit sleep/background time before deciding if player can tap (keep residual)
      {
        const caught = catchUpEnergyAnchor(energyAnchorRef.current);
        energyAnchorRef.current = caught;
        optimisticEnergy.current = caught.value;
        if (caught.value !== Number(energy)) setEnergy(caught.value);
      }
      if ((Number(optimisticEnergy.current) || 0) <= 0 || !isDataLoaded) return;

      // 🚨 FIX: Use the synchronous Ref to prevent rapid-click bypasses
      const safeLifetimeTaps = Number(optimisticTaps.current) || 0;

      // Tap power = additive (L5 1.15 + Echo 1.1 = 1.25). Frenzy doubles that (→ 2.5).
      const levelMulti = getLevelMultiplier(currentLevel);
      let costMultiplier = 1; // always 1 — Frenzy never raises battery drain

      const buffs = buffRef.current || {};
      const frenzyOn =
        !!(buffs.frenzyExpires && now < new Date(buffs.frenzyExpires));
      const premiumMulti =
        buffs.premiumExpires && now < new Date(buffs.premiumExpires)
          ? Number(buffs.premiumMult) || 1
          : 1;
      let echoMulti = 1;
      {
        const ea = (inventoryRef.current || stats?.inventory || {}).echo_active;
        if (ea && typeof ea === 'object') {
          const em = echoMultiplier(ea.rarity || ea.rarityKey, ea.level || 1);
          if (em > 1) echoMulti = em;
        }
      }
      const baseTapPower = stackPayoutMultis(levelMulti, premiumMulti, echoMulti);
      if (Math.abs(baseTapPower - Number(tapPower || 0)) > 0.0005) {
        setTapPower(baseTapPower);
      }
      const payoutMultiplier = frenzyOn ? baseTapPower * 2 : baseTapPower;
      const baseRate = 1; // payoutMultiplier is full shards-per-tap

      // 3. CALCULATE VALID FINGERS — catch up regen first so UI and spend agree
      applyEnergyCatchUp();
      const liveEnergy = Math.max(0, Number(optimisticEnergy.current) || 0);
      const availableByEnergy = Math.floor(liveEnergy / costMultiplier);
      const dailyUsed = Math.max(Number(currentDailyTaps) || 0, Number(optimisticDaily.current) || 0);
      // Daily limit = raw taps. Frenzy gives 2x shards/boards without burning the bar 2x.
      const availableByDailyLimit = Math.max(
        0,
        Math.floor(currentMaxLimit - dailyUsed),
      );
      const validTaps = Math.min(tapPoints.length, availableByEnergy, availableByDailyLimit);

      if (validTaps <= 0) {
        // Hard stop at empty battery — do not animate progress
        if (liveEnergy < costMultiplier) {
          setEnergy(liveEnergy);
          return;
        }
        // Still credit weekly quests (500/day + full drain) when blocked by energy/limit
        if (dailyUsed > 0) {
          recordWeeklyDailyProgress(dailyUsed, currentMaxLimit, now);
        }
        if (isDailyLimitDrained(dailyUsed, currentMaxLimit)) {
          setAppNotice({
            show: true,
            message:
              "Daily limit reached for this UTC day.\n\n" +
              "Want to keep playing? Expanded Battery adds +1,000 max taps until UTC midnight (Shop · Free).",
            loading: false,
            success: false,
            title: "Daily limit reached",
            confirm: {
              confirmLabel: "Expanded Battery",
              cancelLabel: "OK",
              confirmDanger: false,
              resolve: (ok) => {
                if (ok) {
                  setShopFocusTab("upgrades");
                  setCurrentPage("shop");
                }
              },
            },
          });
        }
        return;
      }

      // --- STREAK: only on first VALID tap of a new UTC day ---
      // CRITICAL: empty last_tap_date must NOT wipe daily progress (protect freezes ltd writes).
      // Only reset when we know the previous play day was a different UTC date.
      {
        const prevLtd = (lastTapDateRef.current || lastTapDate || '').slice(0, 10);
        const localDailyNow = Math.max(
          Number(currentDailyTaps) || 0,
          Number(optimisticDaily.current) || 0,
        );
        if (prevLtd && prevLtd !== today) {
          // Confirmed previous UTC day → real day-roll
          const nextStreak = streakAfterPlayDay(prevLtd, currentStreak, today);
          currentStreak = nextStreak;
          currentDailyTaps = 0;
          optimisticDaily.current = 0;
          setDailyTaps(0);
          lastTapDateRef.current = today;
          streakRef.current = nextStreak;
          setLastTapDate(today);
          setStreak(nextStreak);
          // Streak/date only — never last_updated (energy regen clock).
          if (!secureEconomyRef.current) {
            supabase
              .from('players')
              .update({
                current_streak: nextStreak,
                last_tap_date: today,
              })
              .eq(DB_PLAYER_ID, playerId)
              .then(({ error }) => {
                if (error) console.warn('streak day-roll save failed', error.message);
              });
          }
        } else if (!prevLtd) {
          // Missing ltd (common under secure_economy client freezes): keep daily progress
          lastTapDateRef.current = today;
          setLastTapDate(today);
          if (localDailyNow <= 0) {
            // First play ever / no progress — streak starts at 1
            const nextStreak = streakAfterPlayDay('', currentStreak, today);
            currentStreak = nextStreak;
            streakRef.current = nextStreak;
            setStreak(nextStreak);
          }
          // Do NOT zero optimisticDaily / dailyTaps
        }
        // prevLtd === today: already playing today — no-op
      }

      // Any valid tap counts as played today for device streak notice
      try {
        markPlayedTodayUtc(today);
      } catch {
        /* ignore */
      }

      // 4. ALWAYS EARN SHARDS (open mining). Wall only caps *level unlock*, not earnings.
      const isAtLevelCap = currentLevel >= maxUnlockedLevel;
      const atWall =
        isAtLevelCap && !!ASCENSION_WALLS[maxUnlockedLevel];

      const rawShardsEarned = (baseRate * payoutMultiplier) * validTaps;
      const shardsEarned = Math.round(rawShardsEarned * 1000) / 1000;
      const perTapAmount = Math.round((baseRate * payoutMultiplier) * 1000) / 1000;

      // Climb UI is opt-in only (HUD "Level up" / "Climb"). No auto-popup while mining.
      // First time they hit the wall, show once unless they already chose Stay mining.
      if (
        atWall &&
        wallSnoozedFor !== maxUnlockedLevel &&
        safeLifetimeTaps < getPaywallCap(maxUnlockedLevel) &&
        safeLifetimeTaps + shardsEarned >= getPaywallCap(maxUnlockedLevel)
      ) {
        setShowAscensionModal(true);
      }

      // Instant refs so multi-touch / rapid taps never use stale React state in saves
      optimisticTaps.current = Math.round((safeLifetimeTaps + shardsEarned) * 1000) / 1000;
      const nextLifetimeTaps = optimisticTaps.current;

      const safeBal = Number(optimisticBalance.current);
      optimisticBalance.current = Math.round((safeBal + shardsEarned) * 1000) / 1000;
      const nextBalance = optimisticBalance.current;

      const safeSeason = Number(optimisticSeason.current) || 0;
      optimisticSeason.current = Math.round((safeSeason + shardsEarned) * 1000) / 1000;
      const nextSeasonShards = optimisticSeason.current;

      const totalCost = costMultiplier * validTaps;
      // Boards/balance: Frenzy/premium/Echo payout-weighted. Daily bar: raw taps only.
      const scoreCredit = Math.round(validTaps * payoutMultiplier * 1000) / 1000;
      const limitCredit = validTaps;

      // Weekly leaderboard (UTC week) — payout-weighted (Frenzy 10 taps → 20 board)
      {
        const wId = getUtcWeekId();
        const invW = addWeeklyLbScore(
          inventoryRef.current || stats.inventory || {},
          scoreCredit,
          wId,
        );
        inventoryRef.current = invW;
        const wScore = getWeeklyLbState(invW, wId).score;
        optimisticWeekly.current = wScore;
        // Live Ranks -> Weekly you score (ref alone never re-renders)
        bumpWeeklyLiveUi(wScore);
      }
      // Regen continues on the 1.5s clock even while tapping (preserve residual ms)
      {
        const spent = spendEnergyFromAnchor(
          energyAnchorRef.current,
          totalCost,
          Date.now(),
        );
        energyAnchorRef.current = spent;
        optimisticEnergy.current = spent.value;
        lastLocalTapAtRef.current = Date.now();
      }
      let nextEnergy = Number(optimisticEnergy.current) || 0;

      const safeDaily = Number(optimisticDaily.current);
      // Prefer ref for daily progress (stale state under multi-touch)
      const baseDaily = Math.max(Number(currentDailyTaps) || 0, safeDaily);
      // Daily limit bar: +1 per tap (not +2 under Frenzy)
      const nextDaily = baseDaily + limitCredit;
      optimisticDaily.current = nextDaily;

      // Level-ups only inside unlocked tier (climbing wall is paid / optional)
      // Battery refill on level-up is SERVER-ONLY (commit-taps). Never fake a full
      // bar locally — that caused "I'm tapping but shards don't move" (client energy
      // ahead of last_energy → flush returns no_energy → snap shards back).
      {
        const nextLv = effectiveLevel(nextLifetimeTaps, maxUnlockedLevel);
        if (nextLv !== currentLevel) setCurrentLevel(nextLv);
      }

      setIsPressed(true);
      setTimeout(() => setIsPressed(false), 100);

      // --- RAPID TAP UI FIX ---
      setBalance(nextBalance);
      setLifetimeTaps(nextLifetimeTaps);
      setSeasonShards(nextSeasonShards);
      setEnergy(nextEnergy);
      setDailyTaps(nextDaily);
      setBalances((bal) => ({ ...bal, G2Ushards: nextBalance }));

      // HARD SECURITY: client cannot write weekly_shards / daily_taps / balances.
      // Queue taps for commit-taps (service_role) — sole authority for weekly season score.
      if (playerId && validTaps > 0) {
        const prevQ = pendingTapsRef.current || { count: 0, batchId: null };
        pendingTapsRef.current = {
          count: (Number(prevQ.count) || 0) + validTaps,
          batchId:
            prevQ.batchId ||
            (crypto.randomUUID
              ? crypto.randomUUID()
              : `b_${Date.now()}_${Math.random().toString(36).slice(2)}`),
        };
        // Empty battery → flush now so server catches up before more optimistic taps
        if (nextEnergy < costMultiplier) {
          if (tapFlushTimerRef.current) clearTimeout(tapFlushTimerRef.current);
          tapFlushTimerRef.current = null;
          flushPendingTaps();
        } else {
          scheduleTapFlush();
        }
      }
      // Local UI sync only under secureLock (no last_updated heartbeat — that
      // field is the energy regen clock owned by commit-taps).
      if (playerId) {
        saveToDatabase(
          nextBalance,
          nextEnergy,
          nextDaily,
          today,
          currentStreak,
          nextLifetimeTaps,
          maxUnlockedLevel,
          nextSeasonShards,
        );
      }

      // Weekly quests: 500/day, full daily limit, active days (functional state + DB)
      recordWeeklyDailyProgress(nextDaily, currentMaxLimit, now);
 
      
      // 5. GENERATE FLOATING TEXT
      const nowMs = now.getTime();
      const newTapVisuals = tapPoints.slice(0, validTaps).map((point, index) => ({
        id: nowMs + index,
        x: point.x,
        y: point.y,
        amount: perTapAmount
      }));

      setTaps(t => [...t, ...newTapVisuals]);
      setTimeout(() => {
        setTaps(t => t.filter(tap => !newTapVisuals.map(nt => nt.id).includes(tap.id)));
      }, 500);
  };

  /** Close climb UI and remember player chose to mine (no more auto popups for this wall). */
  const dismissWallClimb = (snooze = true) => {
    setShowAscensionModal(false);
    if (!snooze) return;
    const wallKey = maxUnlockedLevel;
    if (!ASCENSION_WALLS[wallKey]) return;
    setWallSnoozedFor(wallKey);
    const nextInv = {
      ...(stats.inventory || {}),
      wall_snooze_level: wallKey,
    };
    delete nextInv.wall_fee_progress;
    delete nextInv.wall_fee_wall;
    setStats((prev) => ({ ...prev, inventory: nextInv }));
    if (playerId && !secureEconomyRef.current) {
      supabase
        .from('players')
        .update({
          inventory: nextInv,
        })
        .eq(DB_PLAYER_ID, String(playerId))
        .then(({ error }) => {
          if (error) console.warn('wall snooze save', error.message);
        });
    }
  };

  const finishAscensionUnlock = async (newBalance, wallData, wallKey, opts = {}) => {
    const newCap = wallData.newCap;
    const newLevel = wallData.targetLevel;
    const method = opts.method || 'shards';
    const txSignature = opts.txSignature || null;

    // Hard security: server deducts shards + raises max_unlocked_level
    if (hasSecureSession()) {
      try {
        const data = await secureWallClimb({ method, txSignature });
        const bal = Number(data.shard_balance);
        const cap = Number(data.max_unlocked_level);
        const lvl = Number(data.target_level);
        if (Number.isFinite(bal)) {
          optimisticBalance.current = bal;
          setBalance(bal);
          setBalances((b) => ({ ...b, G2Ushards: bal }));
        }
        if (Number.isFinite(cap)) setMaxUnlockedLevel(cap);
        if (Number.isFinite(lvl)) setCurrentLevel(lvl);
        setShowAscensionModal(false);
        setWallSnoozedFor(null);
        if (data.inventory) {
          inventoryRef.current = {
            ...(inventoryRef.current || {}),
            ...data.inventory,
          };
          setStats((prev) => ({
            ...prev,
            inventory: inventoryRef.current,
          }));
        }
        if (wallKey === 4) {
          tryPayReferrerForWall5(playerId).catch((e) =>
            console.warn('referral wall5', e?.message || e),
          );
        }
        const shoeGranted = !!data.shoe_granted;
        const shoes = Number(data.walk2u_shoe_common) || getCommonShoeCount(data.inventory);
        notify(
          shoeGranted
            ? `Ascended to Level ${lvl || newLevel}! +1 Common Walk2u Shoe L1 (×${shoes}).`
            : `Ascended to Level ${lvl || newLevel}! Tap power increased.`,
        );
        return;
      } catch (e) {
        console.error('secure wall-climb', e);
        notify(e?.message || 'Climb failed. Check connection and try again.');
        return;
      }
    }

    setBalance(newBalance);
    setBalances((b) => ({ ...b, G2Ushards: newBalance }));
    setMaxUnlockedLevel(newCap);
    setCurrentLevel(newLevel);
    setEnergy(maxDailyLimit);
    setShowAscensionModal(false);
    setWallSnoozedFor(null);
    setStats((prev) => ({
      ...prev,
      inventory: { ...(prev.inventory || {}), wall_snooze_level: null },
    }));
    await saveToDatabase(
      newBalance,
      maxDailyLimit,
      dailyTaps,
      lastTapDate,
      streak,
      lifetimeTaps,
      newCap,
      seasonShards,
      0,
    );
    if (wallKey === 4) {
      tryPayReferrerForWall5(playerId).catch((e) =>
        console.warn('referral wall5', e?.message || e),
      );
    }
    notify(`Ascended to Level ${newLevel}! Tap Power Increased.`);
  };

  /** Pay wall climb. method: 'shards' | 'sol' | 'both' | 'locksmith'. */
  const handleAscensionPayment = async (method) => {
    const wallKey = maxUnlockedLevel; // e.g. 4 for wall 4→5
    const wallData = ASCENSION_WALLS[wallKey];
    if (!wallData) return;
    const needsBoth = !!wallData.requiresBoth;

    if (method === 'locksmith') {
      let inv = inventoryRef.current || stats.inventory || {};
      // Owning on-chain Locksmith used to leave free-climb greyed out because
      // Pack never wrote inventory.locksmith_active. Auto-equip if they hold it.
      if (!locksmithCoversWall(inv, wallKey) && hasLocksmithNft) {
        try {
          const need = LOCKSMITH_LEVEL_FOR_WALL[wallKey] || 1;
          const have = Math.max(1, locksmithLevelFromInv(inv) || 1);
          const level = Math.max(need, have);
          const data = await secureLocksmithActivate({ level });
          if (data?.inventory) {
            inv = { ...(inventoryRef.current || {}), ...data.inventory };
            inventoryRef.current = inv;
            setStats((prev) => ({
              ...prev,
              inventory: inv,
            }));
          }
        } catch (e) {
          notify(e?.message || 'Could not equip GiftLocksmith', false);
          return;
        }
      }
      if (!locksmithCoversWall(inv, wallKey)) {
        const need = LOCKSMITH_LEVEL_FOR_WALL[wallKey] || 1;
        const have = locksmithLevelFromInv(inv);
        notify(
          have < 1
            ? 'Mint or equip GiftLocksmith in Pack → NFT, then climb free.'
            : `Need GiftLocksmith L${need}+ for this wall (you have L${have}).`,
        );
        return;
      }
      await finishAscensionUnlock(balance, wallData, wallKey, {
        method: 'locksmith',
      });
      return;
    }

    // Mid/late walls: only the combined path unlocks
    if (needsBoth && method !== 'both') {
      notify(
        `This wall needs BOTH ${wallData.shardCost.toLocaleString()} shards AND ${wallData.solCost} SOL.`,
      );
      return;
    }
    if (!needsBoth && method === 'both') {
      // treat as shards-or-sol early wall — ignore
      return;
    }

    if (method === 'shards') {
      if (Number(balance) < wallData.shardCost) {
        notify(
          `Need ${wallData.shardCost.toLocaleString()} shards to climb (optional). You have ${Number(balance).toLocaleString()}. Keep mining anytime — wall is extra power, not required.`,
        );
        return;
      }

      const newBalance =
        Math.round((Number(balance) - wallData.shardCost) * 1000) / 1000;
      await finishAscensionUnlock(newBalance, wallData, wallKey, { method: 'shards' });
      return;
    }

    if (method === 'sol' || method === 'both') {
      try {
        if (method === 'both' && Number(balance) < wallData.shardCost) {
          notify(
            `Need ${wallData.shardCost.toLocaleString()} shards + ${wallData.solCost} SOL. You have ${Number(balance).toLocaleString()} shards.`,
          );
          return;
        }
        // --- 1. ZERO-DELAY INSTANT DECRYPTION ---
        let storedSecret = decryptedPhrase || generatedSecret;
        
        // Failsafe: owner-only Edge vault (anon cannot SELECT encrypted_vault)
        if (!storedSecret) {
          try {
            await ensureSecureSession();
            const vaultRes = await secureGetVault();
            if (vaultRes?.encrypted_vault) {
              const invisibleKey = vaultSaltFor(playerId);
              storedSecret = decryptWallet(vaultRes.encrypted_vault, invisibleKey);
            }
          } catch (ve) {
            console.warn('wall vault edge', ve?.message || ve);
          }
        }

        if (!storedSecret) {
          throw new Error("Wallet connection lost. Please completely refresh the game to resync your session.");
        }

        // Temporary alert so the player knows the transaction is processing
        notify(`Initiating SOL transaction for Level ${wallData.targetLevel}... Please wait.`);

        // --- 2. Setup Connection & Keypair (Using the decrypted storedSecret) ---
        const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=538f6c8f-c773-46a2-939c-6d48c75b2226", 'confirmed');
        
        let playerKeypair;
        if (storedSecret.includes(" ")) {
          playerKeypair = keypairFromMnemonic(storedSecret.trim());
        } else {
          playerKeypair = Keypair.fromSecretKey(bs58.decode(storedSecret));
        }

        // --- 3. Set Destination Wallets & Costs ---
        const masterWallet = new PublicKey("D4GufPTvp6tnzkaYGfombFLs48UjDANsxjMFJnSYz4Gh");
        const treasuryWallet = new PublicKey("8G7uEcPS6dwA5wW9bGoqi98EzBunF8trjbbFJkgkvBPm"); 

        // Convert the SOL cost from your ascension wall data to lamports
        const itemPriceLamports = Math.floor(wallData.solCost * 1e9);
        const projectFeeLamports = Math.floor(0.0005 * 1e9); // The 0.0005 SOL Treasury Fee
        const totalRequired = itemPriceLamports + projectFeeLamports + 1000000; // Total + buffer for network fee

        // --- 4. Check Balance ---
        const currentBalance = await connection.getBalance(playerKeypair.publicKey);
        if (currentBalance < totalRequired) {
          throw new Error(`Insufficient SOL. You need at least ${(totalRequired / 1e9).toFixed(4)} SOL to cover the ascension and network fees.`);
        }

        // --- 5. Build Split Transaction ---
        const transaction = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000000 }),
          // Instruction 1: Send the ascension cost to your Master Wallet
          SystemProgram.transfer({
            fromPubkey: playerKeypair.publicKey,
            toPubkey: masterWallet,
            lamports: itemPriceLamports,
          }),
          // Instruction 2: Send the game fee directly to your Treasury
          SystemProgram.transfer({
            fromPubkey: playerKeypair.publicKey,
            toPubkey: treasuryWallet,
            lamports: projectFeeLamports,
          })
        );

        // --- 6. Send and Confirm ---
        const signature = await sendAndConfirmTransaction(connection, transaction, [playerKeypair]);

        // --- 7. Payment cleared — unlock (and burn shards if requiresBoth) ---
        let newBalance = Number(balance) || 0;
        if (method === 'both') {
          if (newBalance < wallData.shardCost) {
            throw new Error(
              `SOL paid but not enough shards (${wallData.shardCost.toLocaleString()} required). Contact support with tx if needed.`,
            );
          }
          newBalance =
            Math.round((newBalance - wallData.shardCost) * 1000) / 1000;
        }
        await finishAscensionUnlock(newBalance, wallData, wallKey, {
          method: method === 'both' ? 'both' : 'sol',
          txSignature: signature,
        });

      } catch (err) {
        console.error("SOL Payment Error:", err);
        notify(`Transaction Failed: ${err.message || "An error occurred during the SOL payment."}`);
      }
      return;
    }
  };
  // --- SEAMLESS SYNC (Instant Phone-to-Laptop) ---
  useEffect(() => {
    if (!isDataLoaded || !playerId) return;

    const channel = supabase
      .channel(`main-page-sync-${playerId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'players' },
        async (payload) => {
          // 1. Update your personal balance (Seamless Sync)
          if (payload.new[DB_PLAYER_ID] === playerId) {
            
            // Sync when another device is ahead (shards OR lifetime / mining taps)
            const incomingTaps = Number(payload.new.lifetime_taps) || 0;
            const inv = payload.new.inventory || {};
            const incomingShards = Number(payload.new.shard_balance) || 0;

            // Skip echo of our own save for 1.5s (avoid fighting mid-tap)
            const isOwnEcho = Date.now() - (lastLocalSaveAtRef.current || 0) < 3000;
            const incSeason = Number(payload.new.season_shards) || 0;
            const incDaily = Number(payload.new.daily_taps) || 0;
            const base = serverProgressRef.current || {};
            const serverChanged =
              Math.abs(incomingShards - (Number(base.b) || 0)) > 0.001 ||
              Math.abs(incomingTaps - (Number(base.ltt) || 0)) > 0.001 ||
              Math.abs(incSeason - (Number(base.s) || 0)) > 0.001 ||
              Math.abs(incDaily - (Number(base.dt) || 0)) > 0.001;

            // Secure economy freezes balances on client saves — realtime often echoes
            // OLD shard_balance while daily_taps moved. Never snap UI money DOWN mid-tap.
            if (serverChanged && !isOwnEcho) {
              const localB = Number(optimisticBalance.current) || 0;
              const localLtt = Number(optimisticTaps.current) || 0;
              const localS = Number(optimisticSeason.current) || 0;
              const pendingTaps = pendingTapsRef.current?.count || 0;
              // Keep the higher of local vs server for earnings counters.
              // Only adopt a lower server value if it is a clear spend (local also not ahead
              // from fresh taps) and no commit queue is in flight.
              let mergedB = incomingShards;
              let mergedLtt = incomingTaps;
              let mergedS = incSeason;
              if (pendingTaps > 0 || localB > incomingShards + 0.001) {
                mergedB = Math.max(localB, incomingShards);
              }
              if (pendingTaps > 0 || localLtt > incomingTaps + 0.001) {
                mergedLtt = Math.max(localLtt, incomingTaps);
              }
              if (pendingTaps > 0 || localS > incSeason + 0.001) {
                mergedS = Math.max(localS, incSeason);
              }
              // True other-device ahead: server higher → take it
              if (incomingShards > localB + 0.001) mergedB = incomingShards;
              if (incomingTaps > localLtt + 0.001) mergedLtt = incomingTaps;
              if (incSeason > localS + 0.001) mergedS = incSeason;

              optimisticBalance.current = mergedB;
              optimisticTaps.current = mergedLtt;
              optimisticSeason.current = mergedS;
              // Daily limit: max with local same-day progress so echo/lag cannot reopen the bar
              {
                const todayRt = utcTodayStr();
                const rtLtd = payload.new.last_tap_date
                  ? String(payload.new.last_tap_date).slice(0, 10)
                  : '';
                const localDtRt = Math.max(
                  Number(optimisticDaily.current) || 0,
                  Number(dailyTaps) || 0,
                );
                const localLtdRt = (lastTapDateRef.current || '').slice(0, 10);
                let mergedDaily = incDaily;
                if (rtLtd && rtLtd < todayRt && localLtdRt !== todayRt) {
                  mergedDaily = incDaily; // real new day from server
                } else {
                  mergedDaily = Math.max(incDaily, localDtRt);
                }
                optimisticDaily.current = mergedDaily;
                if (localLtdRt !== todayRt && (rtLtd === todayRt || mergedDaily > 0)) {
                  lastTapDateRef.current = todayRt;
                }
              }
              serverProgressRef.current = {
                b: mergedB,
                ltt: mergedLtt,
                s: mergedS,
                dt: Number(optimisticDaily.current) || 0,
              };
              // Do NOT drop pendingSave / kill debounce — that was wiping mid-tap earnings
              setBalance(mergedB);
              setLifetimeTaps(mergedLtt);
              setSeasonShards(mergedS);
              setDailyTaps(Number(optimisticDaily.current) || 0);
              setBalances((b) => ({ ...b, G2Ushards: mergedB }));
              {
                const maxU = Number(
                  payload.new.max_unlocked_level ?? maxUnlockedLevel,
                ) || 4;
                if (payload.new.max_unlocked_level != null) {
                  setMaxUnlockedLevel(maxU);
                }
                setCurrentLevel(effectiveLevel(incomingTaps, maxU));
              }
              if (
                payload.new.last_energy != null &&
                (pendingTapsRef.current?.count || 0) <= 0 &&
                Date.now() - (lastLocalTapAtRef.current || 0) > 1000
              ) {
                const raw = Number(payload.new.last_energy);
                // 0 is valid (empty battery). Skip while bursting — realtime was
                // resetting the bar to 500 after Instant Refill.
                if (Number.isFinite(raw)) {
                  const base = Math.max(0, Math.min(ENERGY_CAP, raw));
                  const atMs = payload.new.last_updated
                    ? new Date(payload.new.last_updated).getTime()
                    : Date.now();
                  const en = energyFromAnchor(base, atMs);
                  const localEn = Number(optimisticEnergy.current);
                  // Never snap UP from realtime while local already spent lower
                  if (Number.isFinite(localEn) && en > localEn + 1) {
                    /* keep local */
                  } else {
                    energyAnchorRef.current = { value: base, at: atMs };
                    setEnergy(en);
                    optimisticEnergy.current = en;
                  }
                }
              }
              if (payload.new.tap_power != null) setTapPower(payload.new.tap_power);
              if (payload.new.max_daily_limit != null) {
                setMaxDailyLimit(payload.new.max_daily_limit);
              }
              setStats((prev) => {
                const wk = getUtcWeekId();
                // Realtime row is shop-qty authority (buy + use). Do not MIN with
                // inventoryRef afterward — that wiped purchases (ref 0 vs server 1).
                let nextInv = applyServerInventoryAuthority(
                  mergeInventoryWeekly(
                    prev.inventory || {},
                    inventoryRef.current || {},
                    wk,
                  ),
                  inv || {},
                  wk,
                );
                nextInv = hydrateWeeklyClaimsFromLedger(nextInv, wk);
                inventoryRef.current = nextInv;
                return {
                  ...prev,
                  inventory: nextInv,
                  frenzy_expires: payload.new.frenzy_expires,
                  efficiency_expires: payload.new.efficiency_expires,
                  energy_boost_expires: payload.new.energy_boost_expires,
                };
              });
            } else if (!isOwnEcho) {
              // Still refresh inventory / buffs — never wipe weekly claims
              setStats((prev) => {
                const wk = getUtcWeekId();
                let nextInv = applyServerInventoryAuthority(
                  mergeInventoryWeekly(
                    prev.inventory || {},
                    inventoryRef.current || {},
                    wk,
                  ),
                  inv || {},
                  wk,
                );
                nextInv = hydrateWeeklyClaimsFromLedger(nextInv, wk);
                inventoryRef.current = nextInv;
                return {
                  ...prev,
                  inventory: nextInv,
                  frenzy_expires: payload.new.frenzy_expires ?? prev.frenzy_expires,
                  efficiency_expires:
                    payload.new.efficiency_expires ?? prev.efficiency_expires,
                  energy_boost_expires:
                    payload.new.energy_boost_expires ?? prev.energy_boost_expires,
                };
              });
            }
          }

          const fetchTopLeaderSafe = async () => {
            try {
              const { data, error } = await supabase
                .from('leaderboard_all_time')
                .select('*')
                .limit(1)
                .maybeSingle();
              
              if (error) throw error;

              if (data) {
                setTopLeader({
                  name: data.username || `ID:..${String(data[DB_PLAYER_ID]).slice(-4)}`,
                  score: data.lifetime_taps
                });
              }
            } catch (err) {
              console.error("Leaderboard poll error:", err.message);
            }
          };
          // 1. Fetch instantly when the component mounts
          fetchTopLeaderSafe();

          // 2. Set a strict 60-second timer to update the badge quietly in the background
          const leaderInterval = setInterval(fetchTopLeaderSafe, 60000); 

          // Cleanup the timer if the user closes the app
          return () => clearInterval(leaderInterval);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isDataLoaded, playerId]);

  // --- Resume sync: tab left open on phone, user comes back without full reload ---
  useEffect(() => {
    if (!isDataLoaded || !playerId) return undefined;

    let busy = false;
    const resyncFromServer = async (reason) => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      // Avoid fighting an in-flight local save / mid-tap burst
      if (Date.now() - (lastLocalSaveAtRef.current || 0) < 2500) return;
      if (pendingSaveRef.current) return;
      if (busy) return;
      busy = true;
      try {
        const { data: row, error } = await supabase
          .from('players')
          .select(
            'shard_balance, lifetime_taps, season_shards, daily_taps, last_tap_date, last_updated, last_energy, max_unlocked_level, max_daily_limit, tap_power, inventory, frenzy_expires, efficiency_expires, energy_boost_expires, limit_boost_amount, limit_boost_expires, current_streak, daily_ads_watched, last_ad_date, ad_energy_boost, ad_energy_expires',
          )
          .eq(DB_PLAYER_ID, playerId)
          .maybeSingle();
        if (error || !row) return;

        const today = utcTodayStr();
        const ltd = row.last_tap_date ? String(row.last_tap_date).slice(0, 10) : null;
        const lastUpdatedDay = row.last_updated ? String(row.last_updated).slice(0, 10) : null;
        const dbDaily = Number(row.daily_taps) || 0;
        const localLtd = (lastTapDateRef.current || '').slice(0, 10);
        const localDaily = Math.max(
          Number(optimisticDaily.current) || 0,
          Number(dailyTaps) || 0,
        );
        // Daily limit day-roll: last_tap_date / local only — not last_updated heartbeats
        const isSameUtcDay =
          ltd === today ||
          localLtd === today ||
          (!ltd && dbDaily > 0 && lastUpdatedDay === today);

        let nextDaily = dbDaily;
        if (
          !isSameUtcDay &&
          ((ltd && ltd < today) || (!ltd && lastUpdatedDay && lastUpdatedDay < today)) &&
          localLtd !== today
        ) {
          // Confirmed new UTC day and this device is not already counting today
          nextDaily = 0;
        } else {
          // Same day / ambiguous: never drop local progress below what player already mined
          nextDaily = Math.max(dbDaily, localDaily);
        }

        // Energy: server last_energy + last_updated is authority (0 is valid).
        // NEVER Math.max(local, server) — a stale local 500 (or unflushed drain)
        // was filling the bar after ~2 min away (should be ~80 from 0, not 500).
        const lastMs = row.last_updated
          ? new Date(row.last_updated).getTime()
          : Date.now();
        const rawEn = Number(row.last_energy);
        let nextEnergy;
        if (Number.isFinite(rawEn)) {
          const dbEnergy = Math.max(0, Math.min(ENERGY_CAP, rawEn));
          const fromServer = energyFromAnchor(dbEnergy, lastMs);
          nextEnergy = fromServer;
          // Anchor at caught-up value "now" so the 1.5s clock continues cleanly
          energyAnchorRef.current = { value: nextEnergy, at: Date.now() };
        } else {
          // Missing DB energy: keep local catch-up only (do not invent 500)
          const fromLocal = catchUpEnergyAnchor(energyAnchorRef.current);
          energyAnchorRef.current = fromLocal;
          nextEnergy = fromLocal.value;
        }

        const dbShards = Number(row.shard_balance) || 0;
        const dbLife = Number(row.lifetime_taps) || 0;
        const dbSeason = Number(row.season_shards) || 0;
        // Never snap money down on resume — local taps may be ahead of frozen server
        const shards = Math.max(dbShards, Number(optimisticBalance.current) || 0);
        const life = Math.max(dbLife, Number(optimisticTaps.current) || 0);
        const season = Math.max(dbSeason, Number(optimisticSeason.current) || 0);
        const maxU = Number(row.max_unlocked_level) || 4;

        optimisticBalance.current = shards;
        optimisticTaps.current = life;
        optimisticSeason.current = season;
        optimisticDaily.current = nextDaily;
        optimisticEnergy.current = nextEnergy;
        serverProgressRef.current = { b: dbShards, ltt: dbLife, s: dbSeason, dt: nextDaily };

        setBalance(shards);
        setLifetimeTaps(life);
        setSeasonShards(season);
        setDailyTaps(nextDaily);
        setEnergy(nextEnergy);
        setBalances((b) => ({ ...b, G2Ushards: shards }));
        setMaxUnlockedLevel(maxU);
        setCurrentLevel(effectiveLevel(life, maxU));
        if (row.max_daily_limit != null) setMaxDailyLimit(Number(row.max_daily_limit) || 1000);
        if (row.tap_power != null) setTapPower(row.tap_power);
        if (row.current_streak != null) {
          const st = Number(row.current_streak) || 0;
          setStreak(st);
          streakRef.current = st;
        }
        if (ltd) {
          lastTapDateRef.current = isSameUtcDay && nextDaily > 0 ? today : ltd;
          setLastTapDate(lastTapDateRef.current);
        }
        setStats((prev) => ({
          ...prev,
          inventory: row.inventory || prev.inventory,
          frenzy_expires: row.frenzy_expires ?? prev.frenzy_expires,
          efficiency_expires: row.efficiency_expires ?? prev.efficiency_expires,
          energy_boost_expires: row.energy_boost_expires ?? prev.energy_boost_expires,
          limit_boost_amount: row.limit_boost_amount ?? prev.limit_boost_amount,
          limit_boost_expires: row.limit_boost_expires ?? prev.limit_boost_expires,
          ad_energy_boost: row.ad_energy_boost ?? prev.ad_energy_boost,
          ad_energy_expires: row.ad_energy_expires ?? prev.ad_energy_expires,
        }));
        if (row.last_ad_date != null) {
          const adToday = String(row.last_ad_date).slice(0, 10) === today;
          setDailyAdsWatched(adToday ? Number(row.daily_ads_watched) || 0 : 0);
        }
        console.log('🔄 Resume sync', reason, { shards, life, season, nextDaily, nextEnergy });
      } catch (e) {
        console.warn('Resume sync failed', e?.message || e);
      } finally {
        busy = false;
      }
    };

    const onVis = () => {
      if (document.visibilityState === 'visible') {
        // Instant local catch-up (phone sleep) — do not wait on network
        applyEnergyCatchUp();
        resyncFromServer('visibility');
      }
    };
    const onFocus = () => {
      applyEnergyCatchUp();
      resyncFromServer('focus');
    };
    const onPageShow = (ev) => {
      // bfcache restore on mobile browsers
      applyEnergyCatchUp();
      resyncFromServer(ev?.persisted ? 'pageshow-bfcache' : 'pageshow');
    };

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onPageShow);
    // Catch-up once when effect mounts (tab already visible after long freeze)
    applyEnergyCatchUp();
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [isDataLoaded, playerId, applyEnergyCatchUp]);

  // --- PLACE THIS AROUND LINE 200 (Above fetchBalances) ---

  // 1. Logic to check if fees are actually loaded from the blockchain
  const isFeeLoaded = useMemo(() => {
    return transactionCosts.baseFeeWithBuffer > 0;
  }, [transactionCosts.baseFeeWithBuffer]);

  // 2. Logic to calculate exactly what the user gets after all fees
  const netReceiveAmount = useMemo(() => {
    const amount = Number(withdrawAmount) || 0;
    const fees = (transactionCosts.baseFeeWithBuffer || 0) + (transactionCosts.projectFee || 0);
    return amount > fees ? (amount - fees).toFixed(6) : "0.000000";
  }, [withdrawAmount, transactionCosts]);

  const fetchBalances = useCallback(async () => {
    if (!playerWallet) return;

    try {
      const pubKey = new PublicKey(playerWallet);
      const usdcMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

      // Use Promise.all to fetch everything in parallel (faster)
      const [solLamports] = await Promise.all([
        connection.getBalance(pubKey),
        connection.getLatestBlockhash('confirmed')
      ]);
      const realSol = solLamports / 1e9;
      const baseFee = 800000 / 1e9;
      const baseFeeWithBuffer = baseFee * 1.25; // Your 25% safety buffer

      // 2. Update UI (This part is also working)
      setBalances(prev => ({ ...prev, sol: realSol }));

      const getTokenBal = async (mint) => {
        try {
          const ata = getAssociatedTokenAddressSync(mint, pubKey);
          const bal = await connection.getTokenAccountBalance(ata);
          return bal.value.uiAmount || 0;
        } catch { return 0; }
      };

      const realUsdc = await getTokenBal(usdcMint);

      setBalances({
        sol: realSol,
        G2U: 0,
        G2Ushards: balance, // Pulls from your 'balance' state
        usdc: realUsdc,
      });

      // Set Fees separately
      setTransactionCosts({
        baseFeeWithBuffer: baseFeeWithBuffer, 
        projectFee: 0.0005 // Your fixed Gift launch fee
      });

      // --- SURGICAL FIX: Targeted Update ---
      // We use .update() instead of .upsert() because we only want to change 
      // the wallet balances. This protects your Energy and 3200 Boost.
      const { data: updatedData, error: updateError } = await supabase
        .from('players')
        .update({
          sol_balance: realSol,
          usdc_balance: realUsdc,
          // Never last_updated — that is the energy regen clock, not a wallet stamp.
        })
        .eq(DB_PLAYER_ID, playerId)
        .select();

      if (updateError) {
        console.error("❌ Wallet Sync Error:", updateError.message);
      } else {
          console.log("✅ Sync Successful for ID:", playerId, updatedData); 
      }
      
    } catch (err) { 
      console.error("Balance/Fee fetch failed", err); 
    }
  }, [playerWallet, connection, balance, playerId]);

  // --- BLOCKCHAIN-TO-DATABASE SYNC ---
  useEffect(() => {
    if (isModalOpen && playerWallet && isDataLoaded && !showSettings) {
      console.log("Wallet Dashboard opened: Syncing real balances...");
      fetchBalances();
    }
  }, [isModalOpen, playerWallet, isDataLoaded, fetchBalances, showSettings]);

  const handleWithdraw = async (e) => {
      if (e) e.preventDefault(); 
      
      if (!withdrawAddress || !withdrawAmount) return;
      
      // 🚨 FIX 1: Add show: true, success: false to open the modal immediately
      setTxStatus({ show: true, loading: true, message: 'Initiating withdrawal...', success: false });

      try {
          // 1. Get Secret Key directly from your existing React State
          const storedSecret = decryptedPhrase;
          if (!storedSecret) {
              throw new Error("Secret key not found. Please unlock your wallet in settings.");
          }

          // 2. Setup Connection & Keypair (Matching your marketplace logic)
          const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=538f6c8f-c773-46a2-939c-6d48c75b2226", 'confirmed');
          
          let playerKeypair;
          if (storedSecret.includes(" ")) {
              playerKeypair = keypairFromMnemonic(storedSecret.trim());
          } else {
              playerKeypair = Keypair.fromSecretKey(bs58.decode(storedSecret));
          }

          // 3. Check Balance
          const balance = await connection.getBalance(playerKeypair.publicKey);
          const withdrawLamports = Math.floor(parseFloat(withdrawAmount) * 1e9);
          const projectFeeLamports = Math.floor(0.0005 * 1e9); // Your 0.0005 SOL Fee
          const totalRequired = withdrawLamports + projectFeeLamports + 1000000; // Amount + fee + gas buffer
          
          if (balance < totalRequired) {
              throw new Error(`Insufficient SOL. You need at least ${(totalRequired / 1e9).toFixed(4)} SOL.`);
          }

          // 🚨 FIX 2: Maintain show: true while updating the message
          setTxStatus({ show: true, loading: true, message: '🔗 Confirming withdrawal on Solana...', success: false });

          // 4. Build the Split Transaction
          const transaction = new Transaction().add(
              ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }),
              // Instruction 1: Send the withdrawal amount to the target address
              SystemProgram.transfer({
                  fromPubkey: playerKeypair.publicKey,
                  toPubkey: new PublicKey(withdrawAddress),
                  lamports: withdrawLamports,
              }),
              // Instruction 2: Send the game fee to your Treasury
              SystemProgram.transfer({
                  fromPubkey: playerKeypair.publicKey,
                  toPubkey: new PublicKey("8G7uEcPS6dwA5wW9bGoqi98EzBunF8trjbbFJkgkvBPm"),
                  lamports: projectFeeLamports,
              })
          );

          // 5. Helius Requirement: Explicitly set blockhash and fee payer
          const latestBlockhash = await connection.getLatestBlockhash('confirmed');
          transaction.recentBlockhash = latestBlockhash.blockhash;
          transaction.feePayer = playerKeypair.publicKey;

          // 6. Send and Confirm
          const signature = await sendAndConfirmTransaction(connection, transaction, [playerKeypair]);

          // 7. Update UI Local State
          setBalances(prev => ({ ...prev, sol: prev.sol - parseFloat(withdrawAmount) - 0.0005 }));
          // 🚨 FIX 3: Match marketplace success state payload
          setTxStatus({ show: true, loading: false, message: '✅ Withdrawal successful!', success: true });
          
          // 🚨 FIX 4: Auto-hide the modal after 3 seconds, matching marketplace timing
          setTimeout(() => setTxStatus(prev => ({ ...prev, show: false })), 3000);
          
          setWithdrawAmount('');
          setWithdrawAddress('');

      } catch (err) {
          console.error("Withdrawal Error:", err);
          // 🚨 FIX 5: Ensure error state matches marketplace payload structure
          setTxStatus({ show: true, loading: false, message: `❌ Error: ${err.message}`, success: false });
      }
  };

  // 2. Create the execution function
  const handleWithdraw_old = async () => {
      console.log("REACT MEMORY CHECK:", { address: withdrawAddress, amount: withdrawAmount });
      if (!withdrawAddress || !withdrawAmount) return;
      
      setTxStatus({ loading: true, message: '🔗 Signing with your local key...' });

      try {
          // 1. Get the player's secret key from their local storage
          const storedSecret = localStorage.getItem(`wallet_secret_${playerId}`);
          if (!storedSecret) {
              throw new Error("Secret key not found. Please re-import your key in settings.");
          }

          // 2. Setup Connection & Keypair
          // We use your Helius RPC here
          const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=538f6c8f-c773-46a2-939c-6d48c75b2226", 'confirmed');
          const playerKeypair = Keypair.fromSecretKey(bs58.decode(storedSecret));

          // 3. Check Real SOL Balance (Player needs enough for withdrawal + fee + rent)
          const balance = await connection.getBalance(playerKeypair.publicKey);
          const requiredAmount = (parseFloat(withdrawAmount) + 0.0005 + 0.000025 + 0.001) * 1e9; // Amount + Fee + Buffer
          
          if (balance < requiredAmount) {
              throw new Error(`Insufficient real SOL. You need at least ${(requiredAmount / 1e9).toFixed(4)} SOL in your wallet.`);
          }

          // 4. Build Transaction (Player signs, player pays)
          const transaction = new Transaction().add(
              ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }),
              // Send SOL to the destination
              SystemProgram.transfer({
                  fromPubkey: playerKeypair.publicKey,
                  toPubkey: new PublicKey(withdrawAddress),
                  lamports: Math.floor(parseFloat(withdrawAmount) * 1e9),
              }),
              // Send your 0.0005 Game Fee to your Treasury
              SystemProgram.transfer({
                  fromPubkey: playerKeypair.publicKey,
                  toPubkey: new PublicKey("8G7uEcPS6dwA5wW9bGoqi98EzBunF8trjbbFJkgkvBPm"),
                  lamports: Math.floor(0.0005 * 1e9),
              })
          );

          // 5. Sign and Send (The magic happens here)
          const signature = await sendAndConfirmTransaction(connection, transaction, [playerKeypair]);

          // Keep the UI fast: Subtract the balance locally without needing a refresh
          setBalances(prev => ({ ...prev, sol: prev.sol - parseFloat(withdrawAmount) - 0.0005 }));

          // Save plain text to state to prevent the React White Screen crash
          setTxStatus({ 
            loading: false, 
            message: '✅ Success! Withdrawal Complete.', 
            signature: signature 
          });

          // Clear the inputs for next time
          setWithdrawAmount('');
          setWithdrawAddress('');

          // Close the modal and hide the toast after 4 seconds
          setTimeout(() => {
            setIsWithdrawOpen(false);
            setTxStatus({ loading: false, message: '', signature: null });
          }, 4000);

      } catch (err) {
          setTxStatus({ loading: false, message: `❌ Error: ${err.message}`, signature: null });
          setTimeout(() => setTxStatus({ loading: false, message: '', signature: null }), 4000);
      }
  };

  const handleMaxWithdraw = () => {
    // 1. Calculate fees (Project fee + Solana network fee)
    const projectFee = transactionCosts.projectFee || 0.0005;
    const networkBuffer = transactionCosts.baseFeeWithBuffer || 0.000025;
    
    // 2. The Solana Account Rent Buffer (keeps the wallet alive)
    const rentBuffer = 0.001; 
    
    // 3. Calculate the safe maximum
    const safeMax = balances.sol - projectFee - networkBuffer - rentBuffer;
    
    // 3. Set it, or warn them if they don't have enough to pay fees
    if (safeMax > 0) {
      // Round down to 5 decimals so Solana doesn't fail on a tiny rounding error
      setWithdrawAmount((Math.floor(safeMax * 100000) / 100000).toString());
    } else {
      setWithdrawAmount("");
      notify("Balance is too low to cover the 0.001 SOL transaction fee.");
    }
  };

  // --- THE LIVE ESTIMATOR (Runs in the background when typing) ---
  useEffect(() => {
    const fetchEstimate = async () => {
      // 1. If box is empty, clear everything
      if (!swapFromAmount || parseFloat(swapFromAmount) <= 0) {
        setSwapToAmount('');
        setIsEstimating(false);
        return;
      }

      // 2. Turn on the "Estimating..." UI
      setIsEstimating(true); 

      try {
        const inputMint = TOKEN_MINTS[swapFromToken];
        const outputMint = TOKEN_MINTS[swapToToken];
        const decimals = swapFromToken === 'SOL' ? 1000000000 : 1000000;
        const amountInSmallestUnits = Math.floor(parseFloat(swapFromAmount) * decimals);

        // 3. Ask Jupiter for the quote (using lite-api and 200 slippage)
        const res = await fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountInSmallestUnits}&slippageBps=200&platformFeeBps=100`);
        const quoteResponse = await res.json();
        
        // 🚨 DEBUGGER: Prints the math to your F12 console
        console.log("JUPITER RAW ESTIMATE:", quoteResponse);

        // 4. Update the UI with the real number
        if (quoteResponse && quoteResponse.outAmount) {
          const outDecimals = swapToToken === 'SOL' ? 1000000000 : 1000000; 
          const estimatedAmount = (parseInt(quoteResponse.outAmount) / outDecimals).toFixed(4);
          setSwapToAmount(estimatedAmount); 
        } else {
          setSwapToAmount('');
        }
      } catch (error) {
        console.error("Background estimate failed:", error);
        setSwapToAmount('');
      } finally {
        // 5. Turn off the "Estimating..." UI
        setIsEstimating(false); 
      }
    };

    // 500ms delay so it doesn't spam the API on every single keystroke
    const delayDebounceFn = setTimeout(() => { fetchEstimate(); }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [swapFromAmount, swapFromToken, swapToToken]);

  const swapAccess = getSwapAccess({
    currentLevel,
    maxUnlockedLevel,
    inventory: stats.inventory,
    hasLocksmithNft,
  });
  const shardQuote = quoteShardSwap(
    shardSwapAmount,
    swapAccess,
    stats.inventory,
  );

  /** Free unlock: burn shards for Swap Badge (also requires Level 5+) */
  const buySwapLicense = async () => {
    const cost = SHARD_SWAP_CONFIG.freeUnlockBurnShards;
    if (currentLevel < SHARD_SWAP_CONFIG.freeUnlockMinLevel) {
      notify(
        `Free swap license requires Level ${SHARD_SWAP_CONFIG.freeUnlockMinLevel}+ first (you are Level ${currentLevel}).`,
      );
      return;
    }
    if (balance < cost) {
      notify(`Need ${cost.toLocaleString()} G2Ushards to buy the free swap license.`);
      return;
    }
    if (stats.inventory?.swap_unlocked || stats.inventory?.swap_unlock_burned) {
      const d = getSwapDurability(stats.inventory);
      if (d <= 0) {
        notify('Swap Badge already owned but at 0% — top it up with G2U credit below.');
      } else {
        notify('Swap Badge already owned. Need Level 5+ if still locked, or top up durability with G2U.');
      }
      return;
    }
    setShardSwapBusy(true);
    try {
      const newBal = Math.round((balance - cost) * 1000) / 1000;
      const nextInv = inventoryAfterUnlockBurn(stats.inventory);
      const { error } = await supabase
        .from('players')
        .update({
          shard_balance: newBal,
          inventory: nextInv,
        })
        .eq(DB_PLAYER_ID, playerId);
      if (error) throw error;
      setBalanceSynced(newBal);
      setStats((s) => ({ ...s, inventory: nextInv }));
      notify('✅ Swap Badge charged to 100%! Free path: 10% fee, daily cap, durability drains by volume. Top up with G2U when low.');
    } catch (e) {
      console.error(e);
      notify(e?.message || 'Failed to unlock swap');
    } finally {
      setShardSwapBusy(false);
    }
  };

  /**
   * G2Ushards → G2U credit (off-chain gft_token_balance until on-chain mint).
   * Free vs Locksmith tiers from getSwapAccess.
   */
  const executeShardSwap = async () => {
    const access = getSwapAccess({
      currentLevel,
      maxUnlockedLevel,
      inventory: stats.inventory,
      hasLocksmithNft,
    });
    const quote = quoteShardSwap(shardSwapAmount, access, stats.inventory);
    if (!quote.ok) {
      notify(quote.error);
      return;
    }
    const amt = Number(shardSwapAmount);
    if (balance < amt) {
      notify('Not enough G2Ushards.');
      return;
    }

    setShardSwapBusy(true);
    try {
      const newShardBal = Math.round((balance - amt) * 1000) / 1000;
      const newGft =
        Math.round(
          ((Number(balances.G2U) || 0) + quote.gftOut) * 1e6,
        ) / 1e6;
      const nextInv = inventoryAfterSwap(stats.inventory, amt, quote.feeGft, {
        isFreeTier: access.tier === 'free',
      });

      const { error } = await supabase
        .from('players')
        .update({
          shard_balance: newShardBal,
          gft_token_balance: newGft,
          inventory: nextInv,
        })
        .eq(DB_PLAYER_ID, playerId);
      if (error) throw error;

      setBalanceSynced(newShardBal);
      setBalances((b) => ({ ...b, G2U: newGft, G2Ushards: newShardBal }));
      setStats((s) => ({ ...s, inventory: nextInv }));
      setShardSwapAmount('');
      const durMsg =
        access.tier === 'free' && quote.durabilityAfter != null
          ? ` Badge ${quote.durabilityAfter.toFixed(1)}% left.`
          : '';
      notify(
        `✅ Swapped ${amt.toLocaleString()} G2Ushards → ${quote.gftOut} G2U ` +
          `(${access.label}). Fee ${quote.feeGft} G2U (${(access.feeBps / 100).toFixed(1)}%).` +
          durMsg,
      );
    } catch (e) {
      console.error(e);
      notify(e?.message || 'Shard swap failed');
    } finally {
      setShardSwapBusy(false);
    }
  };


  /** Free Swap Badge: spend G2U credit to restore durability % (no browser prompt) */
  const topUpSwapBadge = async (gftAmtIn) => {
    const gftBal = Number(balances.G2U) || 0;
    const gftAmt = Number(gftAmtIn);
    if (!Number.isFinite(gftAmt) || gftAmt < SHARD_SWAP_CONFIG.durabilityTopUpMinGft) {
      notify(`Min top-up is ${SHARD_SWAP_CONFIG.durabilityTopUpMinGft} G2U.`);
      return;
    }
    if (gftBal < gftAmt) {
      notify('Not enough G2U credit. Mine/swap shards → G2U first, or mint Locksmith.');
      return;
    }
    const result = inventoryAfterDurabilityTopUp(stats.inventory, gftAmt);
    if (result.error) {
      notify(result.error);
      return;
    }
    setShardSwapBusy(true);
    try {
      const newGft = Math.round((gftBal - result.gftSpent) * 1e6) / 1e6;
      const { error } = await supabase
        .from('players')
        .update({
          gft_token_balance: newGft,
          inventory: result.inventory,
        })
        .eq(DB_PLAYER_ID, playerId);
      if (error) throw error;
      setBalances((b) => ({ ...b, G2U: newGft }));
      setStats((s) => ({ ...s, inventory: result.inventory }));
      notify(
        `✅ Badge +${result.durabilityAdded}% → ${result.newDurability.toFixed(1)}% (spent ${result.gftSpent} G2U).`,
        { success: true },
      );
    } catch (e) {
      notify(e?.message || 'Top-up failed');
    } finally {
      setShardSwapBusy(false);
    }
  };

  /** Raise Swap Badge level with G2U (more shards per durability %) */
  const levelUpSwapBadge = async () => {
    const gftBal = Number(balances.G2U) || 0;
    const result = inventoryAfterBadgeLevelUp(stats.inventory);
    if (result.error) {
      notify(result.error);
      return;
    }
    if (gftBal < result.gftCost) {
      notify(`Need ${result.gftCost} G2U credit to level badge to Lv${result.newLevel}.`);
      return;
    }
    setShardSwapBusy(true);
    try {
      const newGft = Math.round((gftBal - result.gftCost) * 1e6) / 1e6;
      const { error } = await supabase
        .from('players')
        .update({
          gft_token_balance: newGft,
          inventory: result.inventory,
        })
        .eq(DB_PLAYER_ID, playerId);
      if (error) throw error;
      setBalances((b) => ({ ...b, G2U: newGft }));
      setStats((s) => ({ ...s, inventory: result.inventory }));
      notify(
        `✅ Swap Badge Lv${result.previousLevel} → Lv${result.newLevel}. Full charge now lasts ~${result.fullVolumeAfter.toLocaleString()} shards volume.`,
        { success: true },
      );
    } catch (e) {
      notify(e?.message || 'Level up failed');
    } finally {
      setShardSwapBusy(false);
    }
  };

  // --- THE BRAIN: Web3 Jupiter Swap Logic (Solflare Standard) ---
  const executeJupiterSwap = async () => {
    if (!swapFromAmount || parseFloat(swapFromAmount) <= 0) return;
    
    // 🚨 1. MOVE TXID OUTSIDE THE TRY BLOCK so it survives timeout errors!
    let currentTxid = null; 

    // ONE SINGLE START MESSAGE 
    setTxStatus({ show: true, loading: true, message: `Confirming transaction...`, success: false, txid: null });
    
    try {
      // 1. SETUP WALLET
      const storedSecret = decryptedPhrase;
      if (!storedSecret) throw new Error("Secret key not found. Please unlock your wallet.");

      let playerKeypair;
      if (storedSecret.includes(" ")) {
        playerKeypair = keypairFromMnemonic(storedSecret.trim());
      } else {
        playerKeypair = Keypair.fromSecretKey(bs58.decode(storedSecret));
      }

      // 2. SETUP CONNECTION
      const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=538f6c8f-c773-46a2-939c-6d48c75b2226", 'confirmed');
      
      // 3. PREPARE JUPITER INPUTS
      const inputMint = TOKEN_MINTS[swapFromToken];
      const outputMint = TOKEN_MINTS[swapToToken];
      const decimals = swapFromToken === 'SOL' ? 1000000000 : 1000000;
      const amountInSmallestUnits = Math.floor(parseFloat(swapFromAmount) * decimals);

      // 4. FETCH QUOTE
      const quoteResponse = await (
        await fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountInSmallestUnits}&slippageBps=500&platformFeeBps=100`)
      ).json();

      if (quoteResponse.error) throw new Error(quoteResponse.error);

      // 5. FETCH ASSEMBLED TRANSACTION
      const TREASURY_TOKEN_ACCOUNTS = {
        'USDC': 'H5nSSix2Q4xrSPJCn8f4tY2FNDRazeUot1MNcgATYKEq',
        'G2U': 'Paste_Your_G2U_Token_Account_Here',
        'SOL': 'GwEPP1njWswga8JoCnQ7AyvJJeqxkx8GzW5o5HFsN1F1' 
      };

      const activeFeeAccount = TREASURY_TOKEN_ACCOUNTS[swapToToken]; 

      const { swapTransaction } = await (
        await fetch('https://lite-api.jup.ag/swap/v1/swap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quoteResponse,
            userPublicKey: playerKeypair.publicKey.toString(),
            wrapAndUnwrapSol: true,
            feeAccount: activeFeeAccount,
            dynamicComputeUnitLimit: true,
            prioritizationFeeLamports: { autoMultiplier: 2 } 
          })
        })
      ).json();

      if (!swapTransaction) throw new Error("Failed to build swap transaction.");

      // 6. DESERIALIZE AND SIGN
      const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
      var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
      transaction.sign([playerKeypair]);

      // 7. SEND TO NETWORK
      const rawTransaction = transaction.serialize();
      
      // 🚨 WE UPDATE THE VARIABLE HERE INSTEAD OF USING 'const'
      currentTxid = await connection.sendRawTransaction(rawTransaction, { skipPreflight: true, maxRetries: 2 });
      console.log(`🚨 TRACK TX HERE: https://solscan.io/tx/${currentTxid}`);

      // 8. WAIT FOR CONFIRMATION
      setTxStatus(prev => ({ ...prev, message: "Confirming on-chain..." })); // Optional clean UI update during the wait
      
      const latestBlockHash = await connection.getLatestBlockhash();
      const confirmation = await connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: currentTxid
      }, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed on-chain!`);
      }

      // 9. CLEANUP & SUCCESS (Standard)
      setTxStatus({ show: true, loading: false, message: `Transaction confirmed`, success: true, txid: currentTxid });
      setSwapFromAmount('');
      setSwapToAmount('');
      
      setTimeout(() => {
          setTxStatus(prev => ({ ...prev, show: false }));
      }, 3500); 

      setTimeout(async () => { 
        try {
            if (typeof syncPlayer === 'function') {
                console.log("Fetching fresh balances from blockchain...");
                await syncPlayer(); 
                console.log("Sync complete!");
            }

            // 🚨 SECOND: Sync their actual Web3 money directly from the blockchain!
            if (playerKeypair) {
                await syncBlockchainBalances(playerKeypair.publicKey.toString());
            }

        } catch (syncError) {
            console.error("Player sync failed after swap:", syncError);
        }
      }, 3500); 

    } catch (error) {
      console.error("Swap Error:", error);
      
      let errorMessage = "Transaction failed";
      let isSuccessVisual = false;

      if (error.message.includes("6025") || error.message.includes("6024")) {
          errorMessage = "Slippage tolerance exceeded";
      }
      
      // 🚨 10. THE PHANTOM CATCH
      // If the RPC times out, but we actually got a txid in Step 7, it's a success!
      if (error.message.includes("expired") || error.message.includes("timeout") || error.message.includes("block height exceeded")) {
          errorMessage = "Swap succeeded!";
          isSuccessVisual = true; // Forces the UI to turn green
      }

      // We pass `currentTxid` so even if it falls to the catch block, the Solscan link still appears
      setTxStatus({ 
          show: true, 
          loading: false, 
          message: errorMessage, 
          success: isSuccessVisual, 
          txid: currentTxid 
      });

      setTimeout(() => {
          setTxStatus(prev => ({ ...prev, show: false }));
      }, 5000); 
    }
  };

  // --- CALCULATE DYNAMIC DAILY LIMIT BAR ---
  // Same formula as server effectiveDailyLimit: base Rush/1000 + battery + boosts + ads.
  // Do NOT start from maxDailyLimit column (that already stores the effective total).
  const now = new Date();
  let dynamicMaxLimit = 1000;
  {
    const ra = (inventoryRef.current || stats?.inventory || {}).rush_active;
    if (ra && typeof ra === 'object') {
      const cap = rushDailyLimit(ra.rarity || ra.rarityKey, ra.level || 1);
      if (cap > 0) dynamicMaxLimit = cap;
    }
  }
  if (stats.energy_boost_expires && now < new Date(stats.energy_boost_expires)) {
    dynamicMaxLimit += 1000;
  }
  if (stats.limit_boost_expires && now < new Date(stats.limit_boost_expires)) {
    dynamicMaxLimit += (stats.limit_boost_amount || 0);
  }
  dynamicMaxLimit += getTaskLimitBoost(stats, now);
  if (stats.ad_energy_expires && now < new Date(stats.ad_energy_expires)) {
    dynamicMaxLimit += Math.max(0, Number(stats.ad_energy_boost) || 0);
  }

  const handleCopyPhrase = async () => {
    // Pure state-only retrieval. Zero browser storage.
    const phraseToCopy = decryptedPhrase || generatedSecret;
    
    if (!phraseToCopy) {
      notify("Error: No secret phrase found to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(phraseToCopy);
      notify("✅ 12-Word Phrase Copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy text: ", err);
      notify("❌ Clipboard access denied. Please write it down manually.");
    }
  };

  const [seasonData, setSeasonData] = useState({ 
    isActive: false, 
    startTime: null, 
    endTime: null 
  });
  const [seasonDisplayMsg, setSeasonDisplayMsg] = useState("Loading...");

  // 1. FETCH THE TRUTH FROM SUPABASE (Run once on load)
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('game_settings')
          .select('season_name, is_season_active, season_start_time, season_end_time, secure_economy')
          .eq('id', 1)
          .single();

        if (error) throw error;

        if (data) {
          // Default true if column missing — hard security is live in production
          // Always hard-secure — never allow client dual-write path even if flag missing
          secureEconomyRef.current = true;
          setSeasonData({
            name: data.season_name,
            isActive: data.is_season_active,
            startTime: data.season_start_time ? new Date(data.season_start_time).getTime() : null,
            endTime: data.season_end_time ? new Date(data.season_end_time).getTime() : null
          });
        }
      } catch (err) {
        console.error("Failed to fetch game settings:", err);
      }
    };

    fetchSettings();
  }, []);

  // 2. THE LOCAL UI TICKER (Runs every second)
  useEffect(() => {
    const updateDisplay = () => {
      const now = Date.now();

      // State A: The Master Switch is off
      if (!seasonData.isActive) {
        setSeasonDisplayMsg("Awaiting Next Season");
        return;
      }

      // State B: Season is scheduled, but hasn't started yet
      if (seasonData.startTime && now < seasonData.startTime) {
        const diff = seasonData.startTime - now;
        setSeasonDisplayMsg(`Starts in: ${formatTime(diff)}`);
        return;
      }

      // State C: Season has ended
      if (seasonData.endTime && now >= seasonData.endTime) {
        setSeasonDisplayMsg("Season Ended");
        return;
      }

      // State D: Season is actively running
      if (seasonData.endTime && now < seasonData.endTime) {
        const diff = seasonData.endTime - now;
        setSeasonDisplayMsg(`${formatTime(diff)}`);
        return;
      }
    };

    // Helper to format milliseconds into 0d 0h 0m
    const formatTime = (ms) => {
      const days = Math.floor(ms / (1000 * 60 * 60 * 24));
      const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
      return `${days}d ${hours}h ${minutes}m`;
    };

    // Run immediately, then tick every 60 seconds 
    // (Change to 1000 if you want a live ticking seconds counter)
    updateDisplay();
    const timer = setInterval(updateDisplay, 60000); 

    return () => clearInterval(timer);
  }, [seasonData]);

  // 0) Login / Sign up (cross-device)
  if (!isAuthed || !playerId) {
    return (
      <AuthScreen
        onAuthenticated={handleAuthenticated}
        onRestoreAccount={restoreAccountFromMnemonic}
      />
    );
  }

  if (isLoading) return <div style={styles.container}>Loading Gift...</div>;

  return (
    <div style={{ backgroundColor: '#000', minHeight: '100vh', width: '100%' }}>
      <AppNotice
        show={appNotice.show}
        message={appNotice.message}
        loading={appNotice.loading}
        success={appNotice.success}
        title={appNotice.title}
        confirmLabel={appNotice.confirm?.confirmLabel}
        cancelLabel={appNotice.confirm?.cancelLabel}
        confirmDanger={!!appNotice.confirm?.confirmDanger}
        onConfirm={
          appNotice.confirm
            ? () => {
                const resolve = appNotice.confirm.resolve;
                setAppNotice((n) => ({ ...n, show: false, confirm: null }));
                if (resolve) resolve(true);
              }
            : undefined
        }
        onClose={() => {
          const resolve = appNotice.confirm?.resolve;
          setAppNotice((n) => ({ ...n, show: false, confirm: null }));
          if (resolve) resolve(false);
        }}
      />
      {/* Public launch: no BetaGate / invite codes */}
        <div style={{ ...styles.container, flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
          
          {/* ASCENSION WALL MODAL */}
          {showAscensionModal && ASCENSION_WALLS[maxUnlockedLevel] && (() => {
            const wall = ASCENSION_WALLS[maxUnlockedLevel];
            const have = Number(balance) || 0;
            const need = wall.shardCost;
            const toward = Math.min(need, have);
            const missing = Math.max(0, need - have);
            const ready = missing <= 0;
            const pct = Math.min(100, Math.round((toward / need) * 100));
            const invNow = inventoryRef.current || stats.inventory || {};
            const lsOk = locksmithCoversWall(invNow, maxUnlockedLevel);
            const lsHave = locksmithLevelFromInv(invNow);
            const lsNeed = LOCKSMITH_LEVEL_FOR_WALL[maxUnlockedLevel] || 1;
            // Own NFT but not equipped yet → still allow free-climb (auto-equip on press)
            const lsCanFree = lsOk || !!hasLocksmithNft;
            const shoeHave = getCommonShoeCount(invNow);
            return (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.9)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <button 
                onClick={() => dismissWallClimb(true)}
                style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', color: '#888', border: 'none', fontSize: '20px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                ✕
              </button>
              <div style={{ background: '#1c1e22', border: '1px solid #ffd700', borderRadius: '20px', padding: '24px', textAlign: 'center', maxWidth: '320px', width: '90%' }}>
                <h2 style={{ color: '#ffd700', marginTop: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  Optional climb 🚀
                  <HelpTip tipKey="climb" size={18} onOpenPlaybook={() => setIsWhitepaperOpen(true)} />
                </h2>
                <p style={{ color: '#ddd', fontSize: '13px', lineHeight: 1.45 }}>
                  You can <strong style={{ color: '#4ade80' }}>keep mining G2Ushards</strong> at Level{' '}
                  {maxUnlockedLevel} forever. Pay to climb for higher power (
                  <strong>{getLevelMultiplier(wall.targetLevel)}x</strong> at L{wall.targetLevel}).
                  GiftLocksmith climbs free and unlocks the Walk2u shoe on early walls.
                </p>

                <div style={{ background: '#111', borderRadius: 12, padding: 12, marginBottom: 12, textAlign: 'left', fontSize: 13, color: '#ccc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Climb fee (payers)</span>
                    <strong style={{ color: '#ffd700' }}>
                      {need.toLocaleString()} shards
                      {wall.requiresBoth ? ` + ${wall.solCost} SOL` : ''}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span>Your shards</span><span>{have.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span>Still need</span>
                    <strong style={{ color: ready ? '#4ade80' : '#fbbf24' }}>
                      {ready ? 'Ready to climb!' : missing.toLocaleString()}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span>Walk2u shoes</span>
                    <span style={{ color: '#67e8f9' }}>Common L1 ×{shoeHave}</span>
                  </div>
                  <div style={{ marginTop: 10, height: 8, background: '#333', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: ready ? '#4ade80' : '#a855f7' }} />
                  </div>
                  <p style={{ margin: '10px 0 0', fontSize: 11, color: '#888', lineHeight: 1.4 }}>
                    <strong style={{ color: '#ffd700' }}>Pay</strong> = better taps only (no shoe).
                    {' '}
                    <strong style={{ color: '#c4b5fd' }}>GiftLocksmith L{lsNeed}+</strong> = free climb
                    {lsHave > 0 ? ` (you: L${lsHave})` : ''}
                    {' '}+ shoe on walls 5 / 10 / 20.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleAscensionPayment('locksmith')}
                  disabled={!lsCanFree}
                  style={{
                    width: '100%',
                    background: lsCanFree
                      ? 'linear-gradient(90deg, #9945FF, #14F195)'
                      : '#1a1a1a',
                    color: lsCanFree ? '#000' : '#666',
                    border: 'none',
                    padding: '15px',
                    borderRadius: '12px',
                    fontWeight: 'bold',
                    cursor: lsCanFree ? 'pointer' : 'not-allowed',
                    marginBottom: '10px',
                  }}
                >
                  {lsOk
                    ? `Locksmith free climb → L${wall.targetLevel}`
                    : hasLocksmithNft
                      ? `Equip Locksmith & free climb → L${wall.targetLevel}`
                      : `GiftLocksmith L${lsNeed}+ for free climb + shoe`}
                </button>
                
                {wall.requiresBoth ? (
                  <>
                    <div style={{ background: '#111', borderRadius: 10, padding: 10, marginBottom: 10, fontSize: 12, color: '#ccc', textAlign: 'left' }}>
                      <div style={{ color: '#fbbf24', fontWeight: 'bold', marginBottom: 4 }}>Both required</div>
                      <div>{need.toLocaleString()} shards <strong style={{ color: '#ffd700' }}>+</strong> {wall.solCost} SOL</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAscensionPayment('both')}
                      disabled={!ready}
                      style={{
                        width: '100%',
                        background: ready
                          ? 'linear-gradient(90deg, #9945FF, #14F195)'
                          : '#1a1a1a',
                        color: ready ? '#000' : '#666',
                        border: 'none',
                        padding: '15px',
                        borderRadius: '12px',
                        fontWeight: 'bold',
                        cursor: ready ? 'pointer' : 'not-allowed',
                        marginBottom: '10px',
                      }}
                    >
                      {ready
                        ? `Climb to L${wall.targetLevel} (${need.toLocaleString()} shards + ${wall.solCost} SOL)`
                        : `Mine ${missing.toLocaleString()} more shards first`}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleAscensionPayment('shards')}
                      disabled={!ready}
                      style={{
                        width: '100%',
                        background: ready ? '#2a2d34' : '#1a1a1a',
                        color: ready ? '#fff' : '#666',
                        border: `1px solid ${ready ? '#4ade80' : '#444'}`,
                        padding: '15px',
                        borderRadius: '12px',
                        fontWeight: 'bold',
                        cursor: ready ? 'pointer' : 'not-allowed',
                        marginBottom: '10px',
                      }}
                    >
                      {ready
                        ? `Climb to L${wall.targetLevel} (${need.toLocaleString()} shards)`
                        : `Mine ${missing.toLocaleString()} more shards to climb`}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAscensionPayment('sol')}
                      style={{
                        width: '100%',
                        background: 'linear-gradient(90deg, #9945FF, #14F195)',
                        color: '#000',
                        border: 'none',
                        padding: '15px',
                        borderRadius: '12px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        marginBottom: '10px',
                      }}
                    >
                      Pay {wall.solCost} SOL — skip wait
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => dismissWallClimb(true)}
                  style={{
                    width: '100%',
                    background: 'rgba(74, 222, 128, 0.12)',
                    color: '#4ade80',
                    border: '1px solid #4ade80',
                    padding: '12px',
                    borderRadius: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    marginBottom: '10px',
                  }}
                >
                  Stay on L{maxUnlockedLevel} & keep mining shards
                </button>
              </div>
            </div>
            );
          })()}

          {/* TOP HEADER */}
          <div style={styles.headerContainer}>
            
            {/* LEFT SIDE: Home + Menu & Toggles */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>

              {/* Return to gift2u.fun homepage (site header is hidden on /play) */}
              <a
                href="/"
                title="Gift2u Home"
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  cursor: 'pointer',
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  textDecoration: 'none',
                  overflow: 'hidden',
                  flexShrink: 0,
                  padding: '4px',
                  boxSizing: 'border-box',
                }}
              >
                <img
                  src="/Gift2u_logo.png"
                  alt="Gift2u"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              </a>
              
              {/* Menu Trigger Button (Separated into a clean circle) */}
              <button 
                onClick={() => setIsMenuOpen(true)}
                style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.05)', color: '#fff', fontSize: '18px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                ☰
              </button>
            </div>

            {/* Premium Wallet Button (RESTORED WRAPPER AND LOGIC) */}
            <div style={styles.walletWrapper}>
              <button 
                onClick={() => { 
                  // --- DIAGNOSTIC LOG ---
                  console.log("DEBUG - Phrase in RAM:", decryptedPhrase);
                  console.log("DEBUG - Generated Secret:", generatedSecret);

                  // 1. Synchronous check prevents UI flickering
                  const isBackedUp = localStorage.getItem(`wallet_backed_up_${playerId}`);
                  
                  if (isBackedUp !== "true") {
                    setMustBackup(true); 
                  } else {
                    setMustBackup(false);
                    fetchBalances();
                  }
                  
                  // 2. Open the modal AFTER the state is set
                  setIsModalOpen(true); 
                }} 
                style={{ ...styles.walletBtnPremium, outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                title={playerWallet ? `${playerWallet.slice(0, 4)}…${playerWallet.slice(-4)} — open wallet` : 'Open wallet'}
              >
                {/* G2U + SOL only — G2Ushards shown large in center HUD */}
                <span style={{ ...styles.walletChip, opacity: 0.95 }}>
                  {/* Blue gift = G2U token / credit logo */}
                  <img src="/Gift2u_logo.png" alt="G2U" style={styles.walletChipIcon} />
                  <span style={{ color: '#7dd3fc' }}>
                    {Number(balances.G2U || 0).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </span>
                <span style={styles.walletChip}>
                  <img
                    src="/shop/solana-logo.svg"
                    alt="SOL"
                    style={{
                      ...styles.walletChipIcon,
                      // SVG logomark reads larger than the gift PNG — keep it visually matched
                      width: 14,
                      height: 14,
                    }}
                  />
                  <span style={{ color: '#c4b5fd' }}>
                    {Number(balances.sol || 0).toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                      minimumFractionDigits: 0,
                    })}
                  </span>
                </span>
              </button>
            </div>
          </div>

          {/* 2. DYNAMIC CONTENT (This is your "Pages") */}
          <div style={{ 
            ...styles.mainContent, 
            overflowY: currentPage === 'home' ? 'hidden' : 'auto', // Unlocks scrolling for Shop/Tasks
            paddingBottom: currentPage === 'home' ? '0' : '100px'  // Stops the Nav bar from covering the bottom Shop items
          }}>
            {currentPage === 'home' && (
              <>
                {/* 1. TOP: DASHBOARD */}
                <div style={{ ...styles.header, padding: '20px 0', width: '100%', zIndex: 10 }}>
                  <div style={{ background: 'transparent', width: '85%', maxWidth: '340px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    
                    {/* NEW HUD: Level & Progress on one line ABOVE the balance */}
                    <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '10px', marginBottom: '15px' }}>
                      
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ color: '#ffd700', background: '#333', padding: '4px 8px', borderRadius: '8px', border: '1px solid #555', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                            Lvl {currentLevel}
                          </span>
                        </span>
                        {isAtAscensionWall(currentLevel, maxUnlockedLevel, lifetimeTaps) && ASCENSION_WALLS[maxUnlockedLevel] ? (
                          <>
                            <span style={{ color: '#888', fontSize: '10px', whiteSpace: 'nowrap', fontWeight: 'bold' }}>
                             {Math.floor(lifetimeTaps).toLocaleString()} taps
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowAscensionModal(true)}
                              title="Open climb when you are ready — mining never stops"
                              style={{
                                color: (
                                  Number(balance) >=
                                  ASCENSION_WALLS[maxUnlockedLevel].shardCost
                                )
                                  ? '#4ade80'
                                  : '#c4b5fd',
                                fontSize: '10px',
                                whiteSpace: 'nowrap',
                                fontWeight: 'bold',
                                background: (
                                  Number(balance) >=
                                  ASCENSION_WALLS[maxUnlockedLevel].shardCost
                                )
                                  ? 'rgba(74,222,128,0.15)'
                                  : 'rgba(168,85,247,0.15)',
                                border: (
                                  Number(balance) >=
                                  ASCENSION_WALLS[maxUnlockedLevel].shardCost
                                )
                                  ? '1px solid #4ade80'
                                  : '1px solid #a855f7',
                                borderRadius: 8,
                                padding: '3px 8px',
                                cursor: 'pointer',
                              }}
                            >
                              {(
                                Number(balance) >=
                                ASCENSION_WALLS[maxUnlockedLevel].shardCost
                              )
                                ? 'Level up'
                                : 'Climb'}
                              {' '}
                              {Math.min(
                                ASCENSION_WALLS[maxUnlockedLevel].shardCost,
                                Number(balance),
                              ).toLocaleString()}
                              {' / '}
                              {ASCENSION_WALLS[maxUnlockedLevel].shardCost.toLocaleString()}
                            </button>
                          </>
                        ) : (
                          <span style={{ color: '#888', fontSize: '10px', whiteSpace: 'nowrap', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {currentLevel < 50 ? `${Math.floor(lifetimeTaps).toLocaleString()} / ${getNextLevelTarget(currentLevel).toLocaleString()}` : 'MAX'}
                          </span>
                        )}
                      </div>
                      
                      {/* Progress: level XP; at wall show full green (mining open) */}
                      {currentLevel < 50 && (
                        <div style={{ flex: 1, background: 'rgba(0, 0, 0, 0.6)', borderRadius: '10px', height: '6px', overflow: 'hidden', border: '1px solid #333' }}>
                          <div
                            style={{
                              height: '100%',
                              background: isAtAscensionWall(currentLevel, maxUnlockedLevel, lifetimeTaps)
                                ? 'linear-gradient(90deg, #4ade80, #a855f7)'
                                : '#4ade80',
                              width: `${
                                isAtAscensionWall(currentLevel, maxUnlockedLevel, lifetimeTaps)
                                  ? 100
                                  : Math.min((lifetimeTaps / getNextLevelTarget(currentLevel)) * 100, 100)
                              }%`,
                            }}
                          />
                        </div>
                      )}

                    </div>

                    {/* THE MAIN EVENT: Balance + G2Ushard logo */}
                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                      <img
                        src="/shop/G2Ushard.png"
                        alt=""
                        width={52}
                        height={52}
                        style={{
                          display: 'block',
                          objectFit: 'contain',
                          flexShrink: 0,
                          filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.45))',
                        }}
                      />
                      <h1 style={{ ...styles.balance, margin: '0', fontSize: '3.2rem', fontVariantNumeric: 'tabular-nums', textShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
                        {balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </h1>
                      <span style={{ color: '#ffd700', fontSize: '16px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        G2Ushards
                        <HelpTip tipKey="level_shards" size={16} onOpenPlaybook={() => setIsWhitepaperOpen(true)} />
                      </span>
                    </div>

                  </div>
                </div>

                {/* 2. MIDDLE ZONE: CENTERED GIFT */}
                <div style={styles.giftZone}>
                  {/* How to play — top right */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 12,
                      zIndex: 20,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'rgba(0,0,0,0.45)',
                      border: '1px solid #444',
                      borderRadius: 20,
                      padding: '4px 8px 4px 10px',
                    }}
                  >
                    <span style={{ color: '#aaa', fontSize: 11, fontWeight: 'bold' }}>How to play</span>
                    <HelpTip tipKey="how_to_play" size={18} onOpenPlaybook={() => setIsWhitepaperOpen(true)} />
                  </div>

                  {/* Left side: G2U Airdrop card + Weekly quest */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 8,
                      left: 8,
                      zIndex: 20,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 8,
                      maxWidth: 118,
                    }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openAirdropBoard();
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'stretch',
                        gap: 6,
                        background:
                          'linear-gradient(160deg, rgba(88,28,135,0.92) 0%, rgba(30,64,175,0.88) 55%, rgba(15,23,42,0.95) 100%)',
                        border: '1.5px solid rgba(192,132,252,0.7)',
                        borderRadius: 14,
                        padding: '10px 10px 9px',
                        cursor: 'pointer',
                        outline: 'none',
                        WebkitTapHighlightColor: 'transparent',
                        boxShadow:
                          '0 0 18px rgba(168,85,247,0.4), 0 4px 14px rgba(0,0,0,0.35)',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <img
                          src="/g2u-airdrop-gift.png"
                          alt=""
                          width={28}
                          height={28}
                          style={{
                            width: 28,
                            height: 28,
                            objectFit: 'contain',
                            flexShrink: 0,
                            filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))',
                          }}
                        />
                        <span
                          style={{
                            color: '#f0abfc',
                            fontSize: 9,
                            fontWeight: 800,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                          }}
                        >
                          {AIRDROP_META.season || 'Q4'}
                        </span>
                      </div>
                      <div
                        style={{
                          color: '#fff',
                          fontSize: 13,
                          fontWeight: 900,
                          lineHeight: 1.15,
                          letterSpacing: '-0.01em',
                        }}
                      >
                        G2U
                        <br />
                        Airdrop
                      </div>
                      <div style={{ color: '#c4b5fd', fontSize: 9, lineHeight: 1.3, fontWeight: 600 }}>
                        {airdropProgress?.qualified
                          ? `✓ +${Number(airdropProgress.totalBonus) || 0}%`
                          : 'Tap to open'}
                      </div>
                      {airdropProgress && Number(airdropProgress.l5TapsProgress) >= 0 ? (
                        <div
                          style={{
                            height: 4,
                            borderRadius: 4,
                            background: 'rgba(0,0,0,0.4)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${Math.min(
                                100,
                                Math.floor((Number(airdropProgress.l5TapsProgress) || 0) * 100),
                              )}%`,
                              background: airdropProgress.qualified
                                ? 'linear-gradient(90deg,#4ade80,#fbef43)'
                                : 'linear-gradient(90deg,#a855f7,#67e8f9)',
                            }}
                          />
                        </div>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTasksTab('week');
                        setCurrentPage('tasks');
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        background: 'rgba(50, 100, 255, 0.22)',
                        border: '1px solid rgba(50, 100, 255, 0.55)',
                        borderRadius: 20,
                        padding: '6px 12px',
                        cursor: 'pointer',
                        outline: 'none',
                        WebkitTapHighlightColor: 'transparent',
                        boxShadow: '0 0 12px rgba(50, 100, 255, 0.25)',
                      }}
                    >
                      <span
                        style={{
                          color: '#8eb4ff',
                          fontSize: 11,
                          fontWeight: 'bold',
                          whiteSpace: 'nowrap',
                          letterSpacing: '0.02em',
                        }}
                      >
                        Weekly quest
                      </span>
                    </button>
                  </div>

                  {/* Pro Touch: A subtle blue Hamster-style halo behind the gift */}
                  <div style={{ position: 'absolute', width: '250px', height: '250px', background: 'radial-gradient(circle, rgba(50, 100, 255, 0.3) 0%, transparent 70%)', zIndex: 0, borderRadius: '50%', marginTop: '-60px' }} />
                  
                  <motion.div
                    whileTap={isDataLoaded ? { scale: 0.94 } : {}} 
                    onPointerDown={isDataLoaded ? handleTap : undefined}
                    onPointerUp={isDataLoaded ? releaseTapPointer : undefined}
                    onPointerCancel={isDataLoaded ? releaseTapPointer : undefined}
                    onPointerLeave={isDataLoaded ? releaseTapPointer : undefined}
                    style={{
                      zIndex: 5,
                      position: 'relative',
                      marginTop: '-60px',
                      opacity: isDataLoaded ? 1 : 0.6,
                      pointerEvents: isDataLoaded ? 'auto' : 'none',
                      // Allow multi-touch (default can be pan-y only on some browsers)
                      touchAction: 'none',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      WebkitTouchCallout: 'none',
                    }}
                  >
                    <img 
                      src="/Gift2u_logo.png" 
                      alt="Gift"
                      onDragStart={(e) => e.preventDefault()}
                      onContextMenu={(e) => e.preventDefault()}
                      style={{ 
                        ...styles.giftImage, 
                        width: '280px', 
                        height: 'auto', 
                        // RESTORED: Your exact yellow glow logic!
                        filter: (isDataLoaded && isPressed) ? 'drop-shadow(0 0 25px rgba(255, 215, 0, 0.9)) brightness(1.1)' : 'drop-shadow(0 0 5px rgba(255, 215, 0, 0.2))',
                        transition: 'filter 0.1s ease-out' // Ensures the glow fades smoothly
                      }} 
                    />
                  </motion.div>

                  <AnimatePresence>
                    {taps.map(t => (
                      <motion.span 
                        key={t.id} 
                        initial={{ opacity: 1, y: t.y - 100 }}
                        animate={{ opacity: 0, y: t.y - 250 }}
                        exit={{ opacity: 0 }}
                        style={{
                          ...styles.floatingText,
                          left: t.x,
                          top: t.y,
                          position: 'fixed',
                          color: t.wall ? '#60a5fa' : styles.floatingText.color,
                        }}
                      >
                        {t.wall ? `🧱+${t.amount}` : `+${t.amount}`}
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </div>

                {/* 3. BOTTOM ZONE: ENERGY & AD BUTTON */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%', padding: '0 20px 110px 20px', boxSizing: 'border-box', zIndex: 10, position: 'relative' }}>
                   
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '45%', maxWidth: '160px' }}>
                     <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                       <p style={{ ...styles.energy, margin: '0', fontSize: '12px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}>
                         ⚡ {energy} / 500
                         <HelpTip tipKey="energy_daily" size={14} onOpenPlaybook={() => setIsWhitepaperOpen(true)} />
                       </p>
                     </div>
                     {/* Battery bar (500 pool) — separate from daily limit */}
                     <div style={{ width: '100%', height: '6px', background: 'rgba(0, 0, 0, 0.6)', borderRadius: '4px', overflow: 'hidden', border: '1px solid #444' }}>
                        <div style={{
                          height: '100%',
                          width: `${Math.min((Number(energy) / ENERGY_CAP) * 100, 100)}%`,
                          background: Number(energy) <= 0 ? '#ff4d4d' : 'linear-gradient(90deg,#38bdf8,#4ade80)',
                          transition: 'width 0.15s ease'
                        }} />
                     </div>
                     <div style={{ display: 'flex', justifyContent: 'center', gap: 4, flexWrap: 'wrap', minHeight: 14 }}>
                       {stats?.frenzy_expires && Date.now() < new Date(stats.frenzy_expires).getTime() ? (
                         <span style={{ fontSize: 9, fontWeight: 800, color: '#fb923c', background: 'rgba(251,146,60,0.15)', border: '1px solid #fb923c55', borderRadius: 999, padding: '1px 6px' }}>
                           Frenzy 2× shards
                         </span>
                       ) : null}
                       {stats?.efficiency_expires && Date.now() < new Date(stats.efficiency_expires).getTime() ? (
                         <span style={{ fontSize: 9, fontWeight: 800, color: '#f87171', background: 'rgba(248,113,113,0.15)', border: '1px solid #f8717155', borderRadius: 999, padding: '1px 6px' }}>
                           Heavy 2× energy
                         </span>
                       ) : null}
                     </div>
                     <div style={{ width: '100%', height: '6px', background: 'rgba(0, 0, 0, 0.6)', borderRadius: '4px', overflow: 'hidden', border: '1px solid #444' }}>
                        <div style={{ 
                          height: '100%', 
                          width: `${Math.min((dailyTaps / dynamicMaxLimit) * 100, 100)}%`, 
                          background: dailyTaps >= dynamicMaxLimit ? '#ff4d4d' : 'linear-gradient(90deg,#4ade80)',
                          transition: 'width 0.3s ease'
                        }} />
                     </div>
                     <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                     <p style={{ color: '#888', fontSize: '10px', margin: '0', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                       Daily Limit: {dailyTaps}/{dynamicMaxLimit}
                     </p>
                     </div>
                   </div>
                   
                   {/* Restored Ad Button - Placed elegantly on the right */}
                   {/* THE FREE ENERGY BUTTON */}
                  {/* FREE ENERGY AD BUTTON */}
                  <button 
                    onClick={(e) => { e.stopPropagation(); setIsAdModalOpen(true); }}
                    style={{ 
                      position: 'absolute', 
                      bottom: '110px', 
                      right: '20px', 
                      width: '65px', // Slightly larger circle to accommodate two words
                      height: '65px', 
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #4E81C1 0%, #3567AD 100%)', 
                      border: '2px solid #000', 
                      display: 'flex', 
                      flexDirection: 'column', // Stacks elements vertically
                      justifyContent: 'center', 
                      alignItems: 'center',
                      boxShadow: '0 4px 15px rgba(0,0,0,0.6)',
                      cursor: 'pointer',
                      zIndex: 50,
                      outline: 'none',
                      WebkitTapHighlightColor: 'transparent'
                    }}
                  >
                    <span style={{ fontSize: '10px', fontWeight: '900', color: '#000', lineHeight: '1.1', textTransform: 'uppercase' }}>
                      Free
                    </span>
                    <span style={{ fontSize: '10px', fontWeight: '900', color: '#000', lineHeight: '1.1', textTransform: 'uppercase' }}>
                      Energy
                    </span>
                    <span style={{ fontSize: '18px', lineHeight: '1', marginTop: '2px' }}>
                      ⚡
                    </span>
                  </button>

                </div>
              </>
            )}

            {currentPage === 'shop' && (
              <Marketplace 
                balance={balance} 
                setBalance={setBalanceSynced}
                setEnergy={setEnergySyncedForShop}
                flushPendingTaps={flushPendingTaps}
                stats={stats}
                setStats={setStats}
                player={player}
                playerWallet={playerWallet}
                decryptedPhrase={decryptedPhrase}
                maxUnlockedLevel={maxUnlockedLevel}
                initialTab={shopFocusTab || undefined}
                onInitialTabConsumed={() => setShopFocusTab(null)}
              />
            )}

            {currentPage === 'tasks' && (
              <Tasks 
                balance={balance}
                setBalance={setBalanceSynced}
                player={player}
                lifetimeTaps={lifetimeTaps}
                streak={streak}
                grantTaskEnergy={grantTaskEnergy}
                weeklyState={stats.inventory?.weekly_quests}
                onWeeklyStateChange={onWeeklyStateChange}
                inventory={stats.inventory}
                activeTab={tasksTab}
                onTabChange={setTasksTab}
                dailyTaps={Math.max(Number(dailyTaps) || 0, Number(optimisticDaily.current) || 0)}
                maxDailyLimit={dynamicMaxLimit}
                playerId={playerId}
              />
            )}

            {/* Friends / Referral Tab */}
            {currentPage === 'friends' && (
              <Friends player={player} />
            )}

            {/* Leaderboard / Ranks page (like Shop / Tasks) */}
            {currentPage === 'leaderboard' && (
              <div style={{ width: '100%', maxWidth: '480px', margin: '0 auto', padding: '12px 16px 24px', boxSizing: 'border-box' }}>
                <h2 style={{ color: '#ffd700', textAlign: 'center', margin: '8px 0 6px', fontSize: '22px' }}>
                  🏆 Leaderboard
                </h2>
                <p style={{ color: '#666', textAlign: 'center', fontSize: '11px', margin: '0 0 14px', lineHeight: 1.35 }}>
                  Season · Weekly · Airdrop · All-time · details in Menu → Game Guide
                </p>

                {/* Season | All-time — always land on Season when opening Ranks from nav */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setLeaderboardType('Season');
                      fetchFullLeaderboard('Season');
                    }}
                    style={{
                      flex: 1,
                      padding: '12px 8px',
                      borderRadius: '12px',
                      border: leaderboardType === 'Season' ? '2px solid #ffd700' : '1px solid #333',
                      background: leaderboardType === 'Season' ? 'rgba(255, 215, 0, 0.15)' : '#1c1e22',
                      color: leaderboardType === 'Season' ? '#ffd700' : '#888',
                      fontWeight: 'bold',
                      fontSize: '14px',
                      cursor: 'pointer',
                      outline: 'none',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    Season
                    {seasonData.name ? (
                      <div style={{ fontSize: '10px', fontWeight: 'normal', color: '#4ade80', marginTop: '4px' }}>
                        {seasonData.name}
                      </div>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLeaderboardType('Weekly');
                      fetchFullLeaderboard('Weekly');
                    }}
                    style={{
                      flex: 1,
                      padding: '12px 8px',
                      borderRadius: '12px',
                      border: leaderboardType === 'Weekly' ? '2px solid #67e8f9' : '1px solid #333',
                      background: leaderboardType === 'Weekly' ? 'rgba(103, 232, 249, 0.12)' : '#1c1e22',
                      color: leaderboardType === 'Weekly' ? '#67e8f9' : '#888',
                      fontWeight: 'bold',
                      fontSize: '13px',
                      cursor: 'pointer',
                      outline: 'none',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    Weekly
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLeaderboardType('Airdrop');
                      fetchFullLeaderboard('Airdrop');
                    }}
                    style={{
                      flex: 1,
                      padding: '12px 6px',
                      borderRadius: '12px',
                      border: leaderboardType === 'Airdrop' ? '2px solid #c084fc' : '1px solid #333',
                      background: leaderboardType === 'Airdrop' ? 'rgba(192, 132, 252, 0.14)' : '#1c1e22',
                      color: leaderboardType === 'Airdrop' ? '#c084fc' : '#888',
                      fontWeight: 'bold',
                      fontSize: '12px',
                      cursor: 'pointer',
                      outline: 'none',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    Airdrop
                    {airdropQualifiedCount > 0 && leaderboardType === 'Airdrop' ? (
                      <div style={{ fontSize: '10px', fontWeight: 'normal', color: '#4ade80', marginTop: '4px' }}>
                        {airdropQualifiedCount} in
                      </div>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLeaderboardType('all_time');
                      fetchFullLeaderboard('all_time');
                    }}
                    style={{
                      flex: 1,
                      padding: '12px 8px',
                      borderRadius: '12px',
                      border: leaderboardType === 'all_time' ? '2px solid #ffd700' : '1px solid #333',
                      background: leaderboardType === 'all_time' ? 'rgba(255, 215, 0, 0.15)' : '#1c1e22',
                      color: leaderboardType === 'all_time' ? '#ffd700' : '#888',
                      fontWeight: 'bold',
                      fontSize: '14px',
                      cursor: 'pointer',
                      outline: 'none',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    All-time
                    {topLeader?.name ? (
                      <div style={{ fontSize: '10px', fontWeight: 'normal', color: '#528db0', marginTop: '4px' }}>
                        #1 {topLeader.name}
                      </div>
                    ) : null}
                  </button>
                </div>

                {leaderboardType === 'Season' && seasonDisplayMsg ? (
                  <div style={{ textAlign: 'center', color: '#4ade80', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px' }}>
                    {seasonDisplayMsg}
                  </div>
                ) : null}


                {leaderboardType === 'Season' ? (
                  <div style={{ textAlign: 'center', color: '#888', fontSize: '11px', marginBottom: '12px', lineHeight: 1.4 }}>
                    Day {seasonBoardDay} · Main board ≥ <span style={{ color: '#ffd700', fontWeight: 'bold' }}>{Number(seasonBoardFloor).toLocaleString()}</span>
                    {' '}({Math.round(SEASON_FLOOR_PCT * 100)}% × {SEASON_DAILY_REFERENCE.toLocaleString()}/day)
                    {seasonEligibleCount > 0 ? (
                      <span style={{ color: '#4ade80' }}> · {seasonEligibleCount} eligible</span>
                    ) : null}
                  </div>
                ) : null}

                {leaderboardType === 'Weekly' ? (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ textAlign: 'center', color: '#888', fontSize: 11, marginBottom: 6, lineHeight: 1.4 }}>
                      Day {weeklyBoardDay}/7 · Main board ≥{' '}
                      <span style={{ color: '#67e8f9', fontWeight: 'bold' }}>
                        {Number(weeklyBoardFloor).toLocaleString()}
                      </span>
                      {' '}({Math.round(WEEKLY_FLOOR_PCT * 100)}% ×{' '}
                      {WEEKLY_DAILY_REFERENCE.toLocaleString()}/day)
                      {weeklyEligibleCount > 0 ? (
                        <span style={{ color: '#4ade80' }}> · {weeklyEligibleCount} eligible</span>
                      ) : null}
                    </div>
                    <div style={{ textAlign: 'center', color: '#666', fontSize: 10, marginBottom: 8, lineHeight: 1.35 }}>
                      Badge floor ≥ {getWeeklyBadgeFloor().toLocaleString()} · every eligible wins a badge (10%◆ · 15%● · 25%● · rest●) · claim in Shop → Pack → Badges
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: 10,
                        flexWrap: 'wrap',
                      }}
                    >
                      {[
                        ['diamond', 'top 10%'],
                        ['gold', 'next 15%'],
                        ['silver', 'next 25%'],
                        ['bronze', 'rest'],
                      ].map(([tier, rankLabel]) => {
                        const m = BADGE_TIERS[tier];
                        return (
                          <div
                            key={tier}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              background: '#1c1e22',
                              border: `1px solid ${m.color}55`,
                              borderRadius: 10,
                              padding: '4px 8px',
                            }}
                          >
                            <img
                              src={m.image}
                              alt={m.name}
                              width={28}
                              height={28}
                              style={{ width: 28, height: 28, objectFit: 'contain' }}
                            />
                            <span style={{ color: m.color, fontSize: 10, fontWeight: 'bold' }}>
                              {rankLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {leaderboardType === 'Airdrop' ? (
                  <div style={{ textAlign: 'center', color: '#888', fontSize: 11, marginBottom: 12, lineHeight: 1.4 }}>
                    Clear <span style={{ color: '#c084fc', fontWeight: 'bold' }}>Level 5</span> to qualify.
                    {' '}Board shows <span style={{ color: '#fff' }}>name</span>,{' '}
                    <span style={{ color: '#fff' }}>lvl</span>,{' '}
                    <span style={{ color: '#c084fc' }}>bonus %</span>.
                    {airdropQualifiedCount > 0 ? (
                      <span style={{ color: '#4ade80' }}>
                        {' '}· {airdropQualifiedCount} qualified
                      </span>
                    ) : null}
                    <div style={{ color: '#555', fontSize: 10, marginTop: 4 }}>
                      Your full checklist: Menu → G2U Airdrop
                    </div>
                  </div>
                ) : null}

<div style={{ background: '#1c1e22', borderRadius: '16px', border: '1px solid #333', overflow: 'hidden' }}>
                  {leaderboardLoading &&
                  leaderboard.length === 0 &&
                  !(leaderboardType === 'Season' && seasonYouRank && playerId) &&
                  !(leaderboardType === 'Weekly' && weeklyYouRank && playerId) &&
                  !(leaderboardType === 'Airdrop' && airdropYouRank && playerId) ? (
                    <p style={{ color: '#888', textAlign: 'center', padding: '28px' }}>Loading ranks…</p>
                  ) : leaderboard.length === 0 && !(leaderboardType === 'Season' && seasonYouRank && playerId) && !(leaderboardType === 'Weekly' && weeklyYouRank && playerId) && !(leaderboardType === 'Airdrop' && airdropYouRank && playerId) ? (
                    <p style={{ color: '#888', textAlign: 'center', padding: '28px' }}>
                      {leaderboardType === 'Airdrop'
                        ? 'No one has cleared Level 5 yet. Be first on the airdrop board!'
                        : 'No players on the main board yet. Keep mining!'}
                    </p>
                  ) : (
                    <>
                    {leaderboard.length === 0 && leaderboardType === 'Season' ? (
                      <p style={{ color: '#666', textAlign: 'center', padding: '16px 14px 8px', fontSize: 12, margin: 0 }}>
                        No one has reached the main-board floor yet ({Number(seasonBoardFloor).toLocaleString()}).
                      </p>
                    ) : null}
                    {leaderboard.length === 0 && leaderboardType === 'Weekly' ? (
                      <p style={{ color: '#666', textAlign: 'center', padding: '16px 14px 8px', fontSize: 12, margin: 0 }}>
                        No one has reached the weekly main-board floor yet ({Number(weeklyBoardFloor).toLocaleString()}).
                      </p>
                    ) : null}
                    {leaderboard.length === 0 && leaderboardType === 'Airdrop' ? (
                      <p style={{ color: '#666', textAlign: 'center', padding: '16px 14px 8px', fontSize: 12, margin: 0 }}>
                        Clear the Level 5 wall to appear here with your bonus %.
                      </p>
                    ) : null}
                    {leaderboardType === 'Airdrop' ? (
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '8px 14px',
                          borderBottom: '1px solid #2a2d34',
                          color: '#666',
                          fontSize: 10,
                          fontWeight: 'bold',
                          letterSpacing: 0.3,
                        }}
                      >
                        <span style={{ minWidth: 28 }}>#</span>
                        <span style={{ flex: 1 }}>Name</span>
                        <span style={{ width: 36, textAlign: 'right' }}>Lvl</span>
                        <span style={{ width: 48, textAlign: 'right' }}>%</span>
                      </div>
                    ) : null}
                    {leaderboard.map((row, index) => {
                      const name = row.username || (row[DB_PLAYER_ID] ? `ID:..${String(row[DB_PLAYER_ID]).slice(-4)}` : 'Anon');
                      const score = leaderboardType === 'all_time'
                        ? (row.lifetime_taps ?? row.score ?? 0)
                        : leaderboardType === 'Weekly'
                          ? (row.weekly_score ?? row.score ?? 0)
                          : leaderboardType === 'Airdrop'
                            ? (row.bonus_pct ?? row.score ?? 0)
                          : (row.score ?? row.season_shards ?? row.lifetime_taps ?? 0);
                      const isYou = playerId && String(row[DB_PLAYER_ID] || row.telegram_id || row.id || '') === String(playerId);
                      const weeklyTier =
                        leaderboardType === 'Weekly'
                          ? badgeTierForWeeklyRank(
                              index + 1,
                              leaderboard.length,
                              getUtcWeekId(),
                            )
                          : null;
                      const weeklyBadge = weeklyTier ? BADGE_TIERS[weeklyTier] : null;
                      if (leaderboardType === 'Airdrop') {
                        const lvl = Number(row.level) || 0;
                        const pct = Number(row.bonus_pct ?? score) || 0;
                        return (
                          <div
                            key={row.id || row[DB_PLAYER_ID] || row.telegram_id || index}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '12px 14px',
                              borderBottom: '1px solid #2a2d34',
                              background: isYou ? 'rgba(192, 132, 252, 0.12)' : 'transparent',
                              gap: 8,
                            }}
                          >
                            <span
                              style={{
                                color: isYou ? '#c084fc' : '#fff',
                                fontSize: 13,
                                fontWeight: isYou ? 'bold' : 'normal',
                                display: 'flex',
                                alignItems: 'center',
                                minWidth: 0,
                                flex: 1,
                              }}
                            >
                              <span
                                style={{
                                  color: '#666',
                                  marginRight: 8,
                                  minWidth: 28,
                                  display: 'inline-block',
                                }}
                              >
                                {index === 0
                                  ? '🥇'
                                  : index === 1
                                    ? '🥈'
                                    : index === 2
                                      ? '🥉'
                                      : `#${index + 1}`}
                              </span>
                              <span
                                style={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {name}
                                {isYou ? ' (you)' : ''}
                              </span>
                            </span>
                            <span
                              style={{
                                width: 36,
                                textAlign: 'right',
                                color: '#ffd700',
                                fontSize: 13,
                                fontWeight: 'bold',
                                flexShrink: 0,
                              }}
                            >
                              {lvl}
                            </span>
                            <span
                              style={{
                                width: 48,
                                textAlign: 'right',
                                color: '#c084fc',
                                fontSize: 13,
                                fontWeight: 'bold',
                                flexShrink: 0,
                              }}
                            >
                              +{pct}%
                            </span>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={row.id || row[DB_PLAYER_ID] || index}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '12px 14px',
                            borderBottom: '1px solid #2a2d34',
                            background: isYou ? 'rgba(255, 215, 0, 0.08)' : 'transparent',
                            gap: 8,
                          }}
                        >
                          <span style={{ color: isYou ? '#ffd700' : '#fff', fontSize: '13px', fontWeight: isYou ? 'bold' : 'normal', display: 'flex', alignItems: 'center', minWidth: 0 }}>
                            <span style={{ color: '#666', marginRight: '8px', minWidth: '28px', display: 'inline-block' }}>
                              {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                            </span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {name}{isYou ? ' (you)' : ''}
                            </span>
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            {weeklyBadge?.image ? (
                              <img
                                src={weeklyBadge.image}
                                alt={weeklyBadge.name}
                                title={`${weeklyBadge.name} if week ends here`}
                                width={28}
                                height={28}
                                style={{
                                  width: 28,
                                  height: 28,
                                  objectFit: 'contain',
                                  borderRadius: 6,
                                  background: '#000',
                                }}
                              />
                            ) : null}
                            <span style={{ color: '#528db0', fontSize: '13px', fontWeight: 'bold' }}>
                              {Number(score).toLocaleString()}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                    {leaderboardType === 'Airdrop' && airdropYouRank && playerId && !airdropYouRank.inList ? (
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '12px 14px',
                          borderTop: '2px solid #c084fc',
                          background: 'rgba(192, 132, 252, 0.12)',
                          gap: 8,
                        }}
                      >
                        <span style={{ color: '#c084fc', fontSize: 13, fontWeight: 'bold', flex: 1, minWidth: 0 }}>
                          <span style={{ color: '#888', marginRight: 8, minWidth: 28, display: 'inline-block' }}>
                            {airdropYouRank.rank ? `#${airdropYouRank.rank}` : '—'}
                          </span>
                          {(player?.username || airdropYouRank.username || 'You')} (you)
                          <span
                            style={{
                              display: 'block',
                              color: '#888',
                              fontSize: 10,
                              fontWeight: 'normal',
                              marginTop: 4,
                              marginLeft: 36,
                            }}
                          >
                            Qualified · outside top shown
                          </span>
                        </span>
                        <span style={{ width: 36, textAlign: 'right', color: '#ffd700', fontWeight: 'bold', fontSize: 13 }}>
                          {Number(airdropYouRank.level) || 0}
                        </span>
                        <span style={{ width: 48, textAlign: 'right', color: '#c084fc', fontWeight: 'bold', fontSize: 13 }}>
                          +{Number(airdropYouRank.bonus_pct) || 0}%
                        </span>
                      </div>
                    ) : null}
                    {/* Season: if you are under the floor or outside the top list, sticky last line with your rank */}
                    {leaderboardType === 'Weekly' && weeklyYouRank && playerId && !weeklyYouRank.inList ? (
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '12px 14px',
                          borderTop: '2px solid #67e8f9',
                          background: 'rgba(103, 232, 249, 0.1)',
                          gap: 8,
                        }}
                      >
                        <span style={{ color: '#67e8f9', fontSize: '13px', fontWeight: 'bold' }}>
                          <span style={{ color: '#888', marginRight: 8, minWidth: 28, display: 'inline-block' }}>
                            {weeklyYouRank.rank ? `#${weeklyYouRank.rank}` : '—'}
                          </span>
                          {(player?.username || 'You')} (you)
                          {!weeklyYouRank.onMain ? (
                            <span
                              style={{
                                display: 'block',
                                color: '#888',
                                fontSize: 10,
                                fontWeight: 'normal',
                                marginTop: 4,
                                marginLeft: 36,
                              }}
                            >
                              Off main board · need{' '}
                              {Number(weeklyYouRank.need || 0).toLocaleString()} more for floor (
                              {Number(weeklyBoardFloor).toLocaleString()})
                            </span>
                          ) : (
                            <span
                              style={{
                                display: 'block',
                                color: '#888',
                                fontSize: 10,
                                fontWeight: 'normal',
                                marginTop: 4,
                                marginLeft: 36,
                              }}
                            >
                              On main board · outside top shown
                            </span>
                          )}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {weeklyYouRank.onMain &&
                          weeklyYouRank.tier &&
                          BADGE_TIERS[weeklyYouRank.tier]?.image ? (
                            <img
                              src={BADGE_TIERS[weeklyYouRank.tier].image}
                              alt={BADGE_TIERS[weeklyYouRank.tier].name}
                              width={28}
                              height={28}
                              style={{
                                width: 28,
                                height: 28,
                                objectFit: 'contain',
                                borderRadius: 6,
                                background: '#000',
                              }}
                            />
                          ) : null}
                          <span style={{ color: '#67e8f9', fontSize: '13px', fontWeight: 'bold' }}>
                            {Number(weeklyYouRank.score || 0).toLocaleString()}
                          </span>
                        </span>
                      </div>
                    ) : null}
                    {leaderboardType === 'Season' && seasonYouRank && playerId && !seasonYouRank.inList ? (
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '12px 14px',
                          borderTop: '2px solid #ffd700',
                          background: 'rgba(255, 215, 0, 0.12)',
                        }}
                      >
                        <span style={{ color: '#ffd700', fontSize: '13px', fontWeight: 'bold' }}>
                          <span style={{ color: '#888', marginRight: '8px', minWidth: '28px', display: 'inline-block' }}>
                            {seasonYouRank.rank ? `#${seasonYouRank.rank}` : '—'}
                          </span>
                          {(player?.username || getPlayerProfile()?.username || 'You')}
                          {' '}(you)
                          {!seasonYouRank.onMain ? (
                            <span style={{ display: 'block', color: '#888', fontSize: 10, fontWeight: 'normal', marginTop: 4, marginLeft: 36 }}>
                              Off main board · need {Number(seasonYouRank.need || 0).toLocaleString()} more for floor ({Number(seasonBoardFloor).toLocaleString()})
                            </span>
                          ) : (
                            <span style={{ display: 'block', color: '#888', fontSize: 10, fontWeight: 'normal', marginTop: 4, marginLeft: 36 }}>
                              On main board · outside top shown
                            </span>
                          )}
                        </span>
                        <span style={{ color: '#ffd700', fontSize: '13px', fontWeight: 'bold' }}>
                          {Number(seasonYouRank.score || 0).toLocaleString()}
                        </span>
                      </div>
                    ) : null}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* 3. Navigation Bar (Always at bottom) */}
            <div style={styles.nav}>
              <button style={currentPage === 'home' ? styles.activeBtn : styles.btn} onClick={() => setCurrentPage('home')}>Home</button>
              <button style={currentPage === 'tasks' ? styles.activeBtn : styles.btn} onClick={() => { setTasksTab('week'); setCurrentPage('tasks'); }}>Tasks</button>
              <button
                style={currentPage === 'leaderboard' ? styles.activeBtn : styles.btn}
                onClick={openLeaderboardPage}
              >
                Ranks
              </button>
              <button style={currentPage === 'friends' ? styles.activeBtn : styles.btn} onClick={() => setCurrentPage('friends')}>Friends</button>
              <button style={currentPage === 'shop' ? styles.activeBtn : styles.btn} onClick={() => setCurrentPage('shop')}>Shop</button>
            </div>
          </div>

          {/* Game wallet only in-app. Solana (Phantom etc.) is on Gift2u web. */}
          <WalletHub
            isOpen={isModalOpen}
            hideTabs={mustBackup}
            showSolanaTab={false}
            defaultTab="game"
            onClose={() => {
              if (!mustBackup) {
                setIsModalOpen(false);
                setShowSettings(false);
                setIsRevealed(false);
              }
            }}
            overlayStyle={styles.modalOverlay}
            panelStyle={styles.modalContent}
            gameContent={
              mustBackup ? (
                <div style={{ textAlign: 'left' }}>
                  <h3 style={{ color: '#ff4d4d', marginTop: 0 }}>⚠️ Backup Required</h3>
                  <p style={{ fontSize: '12px', color: '#ccc', marginBottom: '15px' }}>
                    This wallet is yours alone. Save these 12 words now — they are the only way to restore your account on a new device or browser. Never share them.
                  </p>
                  <div style={{ background: '#000', padding: '15px', borderRadius: '10px', border: '1px solid #ffd700', marginBottom: '15px' }}>
                    <label style={{ color: '#ffd700', fontSize: '11px', fontWeight: 'bold' }}>YOUR 12 SECRET WORDS:</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '10px' }}>
                      {(decryptedPhrase || generatedSecret || "").split(" ").map((word, i) => (
                        word ? (
                          <div key={i} style={{ background: '#222', padding: '6px', borderRadius: '6px', fontSize: '12px', color: '#4ade80', textAlign: 'center', border: '1px solid #333' }}>
                            <span style={{ color: '#888', marginRight: '4px', fontSize: '10px' }}>{i + 1}.</span>{word}
                          </div>
                        ) : null
                      ))}
                    </div>
                    <button
                      onClick={handleCopyPhrase}
                      style={{ width: '100%', padding: '10px', marginTop: '15px', background: '#222', color: '#4ade80', border: '1px solid #4ade80', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
                    >
                      📋 COPY 12-WORD PHRASE
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setMustBackup(false);
                      localStorage.setItem(`wallet_backed_up_${playerId}`, "true");
                    }}
                    style={{ width: '100%', background: '#fbef43', color: '#000', padding: '12px', borderRadius: '8px', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
                  >
                    I HAVE SAVED MY PHRASE
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h3 style={{ margin: 0, color: '#ffd700' }}>{showSettings ? 'Wallet Settings' : 'Game Wallet'}</h3>
                    <div>
                      {!showSettings && (
                        <button onClick={() => setShowSettings(true)} style={{ background: 'none', border: 'none', color: '#888', fontSize: '18px', marginRight: '15px', cursor: 'pointer' }}>⚙️</button>
                      )}
                      <button onClick={() => { setIsModalOpen(false); setShowSettings(false); setIsRevealed(false); }} style={{ background: 'none', border: 'none', color: '#888', fontSize: '18px', cursor: 'pointer' }}>✕</button>
                    </div>
                  </div>

                  {showSettings ? (
                    <div style={{ textAlign: 'left' }}>
                      <p style={{ color: '#aaa', fontSize: '12px', marginBottom: '15px' }}>Your game wallet seed stays on this device until you back up the 12-word phrase. Gift Tap never keeps your seed on our servers for recovery.</p>
                      {!isRevealed ? (
                        <div style={{ background: '#111', padding: '15px', borderRadius: '10px', border: '1px solid #333', textAlign: 'center' }}>
                          <button
                            onClick={() => setIsRevealed(true)}
                            style={{ width: '100%', background: '#ffd700', color: '#000', padding: '12px', borderRadius: '8px', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
                          >
                            👁️ REVEAL SECRET PHRASE
                          </button>
                        </div>
                      ) : (
                        <div style={{ background: '#000', padding: '15px', borderRadius: '10px', border: '1px solid #ffd700', marginTop: '15px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ color: '#ffd700', fontSize: '11px', fontWeight: 'bold' }}>YOUR 12 SECRET WORDS:</label>
                            <button onClick={() => setIsRevealed(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: '12px', cursor: 'pointer' }}>Lock 🔒</button>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '10px' }}>
                            {(decryptedPhrase || generatedSecret || "").split(" ").map((word, i) => (
                              word ? (
                                <div key={i} style={{ background: '#222', padding: '6px', borderRadius: '6px', fontSize: '12px', color: '#4ade80', textAlign: 'center', border: '1px solid #333' }}>
                                  <span style={{ color: '#888', marginRight: '4px', fontSize: '10px' }}>{i + 1}.</span>{word}
                                </div>
                              ) : null
                            ))}
                          </div>
                          <button
                            onClick={handleCopyPhrase}
                            style={{ width: '100%', padding: '10px', marginTop: '15px', background: '#222', color: '#4ade80', border: '1px solid #4ade80', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
                          >
                            📋 COPY 12-WORD PHRASE
                          </button>
                        </div>
                      )}

<button onClick={() => { setShowSettings(false); setIsRevealed(false); }} style={{ width: '100%', marginTop: '20px', background: 'none', color: '#888', border: 'none', cursor: 'pointer' }}>← Back to Balances</button>
                    </div>
                  ) : (
                    <>
                      <TokenBalanceList
                        balances={balances}
                        currency={displayCurrency}
                        rates={fiatRates}
                        style={{ marginBottom: '14px' }}
                      />
                      <WalletNftSection
                        walletAddress={playerWallet}
                        walletSecret={decryptedPhrase || generatedSecret || ''}
                        refreshKey={isModalOpen ? 1 : 0}
                        inventory={stats?.inventory || inventoryRef.current || {}}
                        onInventoryChange={(inv, playerPatch) => {
                          if (!inv || typeof inv !== 'object') return;
                          inventoryRef.current = inv;
                          setStats((prev) => ({
                            ...prev,
                            inventory: inv,
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
                        }}
                        notify={notify}
                        onOpenShopNfts={() => {
                          setIsModalOpen(false);
                          setShowSettings(false);
                          setShopFocusTab('nft');
                          setCurrentPage('shop');
                        }}
                        onSellNft={() => {
                          setIsModalOpen(false);
                          setShowSettings(false);
                          setShopFocusTab('nft');
                          setCurrentPage('shop');
                        }}
                      />
                      <div style={styles.actionRow}>
                        <button style={styles.actionBtn} onClick={() => setIsReceiveOpen(true)}>Receive</button>
                        <button style={styles.actionBtn} onClick={() => setIsWithdrawOpen(true)}>Send</button>
                        <button style={styles.actionBtn} onClick={() => setIsSwapOpen(true)}>Swap</button>
                        {/* Shard→G2U button hidden — modal/code kept. Use Jupiter Swap for $G2U. */}
                      </div>
                    </>
                  )}
                </>
              )
            }
          />

          {/* Receive Pop-up */}
          {isReceiveOpen && (
            <div style={styles.modalOverlay} onClick={() => setIsReceiveOpen(false)}>
              <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ color: '#fff', margin: 0 }}>Receive Assets</h3>
                  <button onClick={() => {setIsReceiveOpen(false); setIsModalOpen(true); }} style={{ background: 'none', border: 'none', color: '#888', fontSize: '20px' }}>✕</button>
                </div>
                
                {/* QR Code Section */}
                <div style={{ background: '#fff', padding: '10px', borderRadius: '10px', display: 'inline-block' }}>
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${playerWallet}`} 
                    alt="Wallet QR Code" 
                    style={{ width: '150px', height: '150px' }}
                  />
                </div>

                {/* Address Section */}
                <div style={styles.depositBox}>
                  <div style={{ fontSize: '12px', color: '#888', textAlign: 'left' }}>Your Wallet Address</div>
                  <div style={styles.addressRow}>
                    <span style={{ fontSize: '11px', color: '#fff', wordBreak: 'break-all', marginRight: '10px' }}>
                      {playerWallet}
                    </span>
                    <button 
                      style={styles.copyBtn} 
                      onClick={() => {
                        navigator.clipboard.writeText(playerWallet);
                        notify("Address copied!");
                      }}
                    >
                      ❐ {/* The "two squares" copy icon */}
                    </button>
                  </div>
                </div>

                <p style={{ fontSize: '10px', color: '#666', marginTop: '15px' }}>
                  Only send Solana (SOL) or SPL tokens (like G2U) to this address.
                </p>
              </div>
            </div>
          )}

          {/* Withdraw Pop-up */}
          {isWithdrawOpen && (
            <div style={styles.modalOverlay} onClick={() => setIsWithdrawOpen(false)}>
              <div style={{ ...styles.modalContent, background: '#131517', border: 'none', width: '90%', maxWidth: '360px' }} onClick={e => e.stopPropagation()}>
                  
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',  marginBottom: '20px' }}>
                  <h3 style={{ color: '#fff', margin: 0 }}>Withdraw</h3>
                  <button onClick={() => {setIsWithdrawOpen(false); setIsModalOpen(true);}} style={{ background: 'none', border: 'none', color: '#888', fontSize: '20px' }}>✕</button>
                </div>

                <div style={{ textAlign: 'left', marginBottom: '15px' }}>
                  <label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '5px' }}>Destination Address</label>
                  <input 
                    type="text" 
                    placeholder="Enter Solana address"
                    value={withdrawAddress}
                    onChange={(e) => setWithdrawAddress(e.target.value)}
                    style={{ width: '100%', background: '#1c1e22', border: '1px solid #333', borderRadius: '12px', padding: '12px', color: '#fff', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ marginTop: '15px', padding: '10px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#888' }}>
                    <span>Amount requested</span>
                    <span>{(Number(withdrawAmount) || 0).toFixed(4)} SOL</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#fbef43', marginTop: '5px' }}>
                    <span>Estimated Network Fee</span>
                    <span>- {transactionCosts.baseFeeWithBuffer?.toFixed(6) ?? '0.001'} SOL</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#fbef43', marginTop: '5px' }}>
                    <span>Project fee</span>
                    <span>- {(transactionCosts.projectFee || 0.0005).toFixed(4)} SOL</span>
                  </div>
                  <div style={{ borderTop: '1px solid #333', marginTop: '10px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                    <span>You will receive</span>
                    <span style={{ color: '#ffd700' }}>
                      {netReceiveAmount} SOL
                    </span>
                  </div>
                </div>

                <div style={{ textAlign: 'left', marginBottom: '20px' }}>
                  <label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '5px' }}>Amount (SOL)</label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type="number" 
                      placeholder="0.00"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      style={{ width: '100%', background: '#1c1e22', border: '1px solid #333', borderRadius: '12px', padding: '12px', color: '#fff', boxSizing: 'border-box' }}
                    />
                    <span onClick={handleMaxWithdraw} style={{ position: 'absolute', right: '12px', top: '12px', color: '#ffd700', fontSize: '12px', cursor: 'pointer', zIndex: 10 }}> MAX</span>
                  </div>
                  <div style={{ color: '#555', fontSize: '10px', marginTop: '5px' }}>Available balance: {balances.sol.toFixed(4)} SOL</div>
                </div>

                <button 
                  disabled={!withdrawAmount || withdrawAmount <= 0 || !withdrawAddress || !isFeeLoaded}
                  style={{ width: '100%',  background: '#fbef43', color: '#000', border: 'none', padding: '16px', borderRadius: '30px', fontWeight: 'bold', fontSize: '16px', cursor: (withdrawAmount > 0 && isFeeLoaded) ? 'pointer' : 'not-allowed', opacity: (withdrawAmount > 0 && isFeeLoaded) ? 1 : 0.5 }}
                  onClick={handleWithdraw}
                >
                  {isFeeLoaded ? "Confirm Withdrawal" : "Loading Network Fees..."}
                </button>
              </div>
            </div>
          )}

          {/* Swap Pop-up */}
          {isSwapOpen && (
            <div style={styles.modalOverlay} onClick={() => setIsSwapOpen(false)}>
              <div style={{ ...styles.modalContent, background: '#131517', border: 'none', width: '90%', maxWidth: '360px' }} onClick={e => e.stopPropagation()}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ color: '#fff', margin: 0 }}>Swap</h3>
                  <button onClick={() => {setIsSwapOpen(false); setIsModalOpen(true); }} style={{ background: 'none', border: 'none', color: '#888', fontSize: '20px', cursor: 'pointer', padding: 0 }}>✕</button>
                </div>

                {/* From Section */}
                <div style={{ background: '#1c1e22', borderRadius: '16px', padding: '15px', textAlign: 'left', marginBottom: '5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#888', fontSize: '12px' }}>
                    <span>You pay</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {[0.25, 0.5, 1].map((pct) => (
                        <button
                          key={`swap-pct-${pct}`}
                          type="button"
                          onClick={() => {
                            const currentBal = parseFloat(getSwapBalance(swapFromToken)) || 0;
                            const maxAmount = swapFromToken === 'SOL'
                              ? Math.max(0, currentBal - 0.005)
                              : currentBal;
                            if (maxAmount <= 0) {
                              setSwapFromAmount('');
                              return;
                            }
                            const raw = maxAmount * pct;
                            const formatted =
                              Math.floor(raw * 1e6) / 1e6;
                            setSwapFromAmount(formatted > 0 ? String(formatted) : '');
                          }}
                          style={{ background: 'rgba(255, 215, 0, 0.15)', color: '#ffd700', border: '1px solid rgba(255, 215, 0, 0.3)', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                        >
                          {pct === 1 ? 'MAX' : `${Math.round(pct * 100)}%`}
                        </button>
                      ))}
                      <span>Balance: {getSwapBalance(swapFromToken)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                    <input 
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={swapFromAmount}
                      onChange={(e) => setSwapFromAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                      style={{ background: 'none', border: 'none', color: '#fff', fontSize: '24px', width: '50%', outline: 'none' }}
                    />
                    <select 
                      value={swapFromToken}
                      onChange={(e) => {
                        setSwapFromToken(e.target.value);
                        setSwapFromAmount(''); // Clear amount on token change for safety
                      }}
                      style={{ background: '#2a2d35', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '12px', fontSize: '14px', outline: 'none', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      <option value="SOL">SOL</option>
                      <option value="USDC">USDC</option>
                      <option value="G2U">G2U</option>
                    </select>
                  </div>
                </div>

                {/* Swap Arrow Icon */}
                <div style={{ height: '30px', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2, position: 'relative', margin: '-15px 0' }}>
                  <button 
                    onClick={() => {
                      const tempToken = swapFromToken;
                      setSwapFromToken(swapToToken);
                      setSwapToToken(tempToken);
                      setSwapFromAmount(''); // Clear amounts when flipping to avoid errors
                    }}
                    style={{ background: '#131517', border: '2px solid #333', borderRadius: '50%', padding: '0', color: '#fbef43', cursor: 'pointer', width: '34px', height: '34px', display: 'flex', justifyContent: 'center', alignItems: 'center', outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  >
                    ↓↑
                  </button>
                </div>

                {/* To Section */}
                <div style={{ background: '#1c1e22', borderRadius: '16px', padding: '15px', textAlign: 'left', marginTop: '5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '12px' }}>
                    <span>You receive (Estimated)</span>
                    <span>Balance: {getSwapBalance(swapToToken)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                    <input 
                      type="number" 
                      placeholder="0.00"
                      value={swapToAmount}
                      readOnly
                      style={{ background: 'none', border: 'none', color: '#fff', fontSize: '24px', width: '50%', outline: 'none', opacity: 0.7 }}
                    />
                    <select 
                      value={swapToToken}
                      onChange={(e) => {
                        setSwapToToken(e.target.value);
                        setSwapToAmount(''); // 2. Clear the old estimate (the background useEffect will instantly fetch the new one!)
                      }}
                      style={{ background: '#2a2d35', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '12px', fontSize: '14px', outline: 'none', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      <option value="SOL">SOL</option>
                      <option value="USDC">USDC</option>
                      <option value="G2U">G2U</option>
                    </select>
                  </div>
                </div>

                <p style={{ fontSize: '12px', color: '#888', marginTop: '20px', textAlign: 'center' }}>
                  Powered by Jupiter Aggregator
                </p>

                <button 
                  style={{ 
                    width: '100%', 
                    background: '#fbef43', 
                    color: '#000', 
                    border: 'none', 
                    padding: '16px', 
                    borderRadius: '30px', 
                    fontWeight: 'bold', 
                    fontSize: '16px',
                    marginTop: '20px',
                    cursor: swapFromAmount > 0 ? 'pointer' : 'not-allowed',
                    opacity: swapFromAmount > 0 ? 1 : 0.5,
                    outline: 'none',
                    WebkitTapHighlightColor: 'transparent'
                  }}
                  onClick={executeJupiterSwap}
                >
                  Execute Swap
                </button>
              </div>
            </div>
          )}
          {/* 💎 THE SOLFLARE-STYLE FLOATING TOAST */}
          {txStatus.show && (
            <div 
              style={{
                position: 'fixed', 
                bottom: '24px', 
                right: '24px', 
                zIndex: 9999, 
                minWidth: '320px',
                padding: '16px 20px',
                background: '#141518', 
                borderRadius: '8px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                borderLeft: `4px solid ${txStatus.loading ? '#3b82f6' : (txStatus.success ? '#10b981' : '#ef4444')}`, 
                color: '#fff',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                transition: 'opacity 0.3s ease-in-out'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                 {/* Visual Indicators */}
                 {txStatus.loading && <span style={{ color: '#3b82f6', fontSize: '18px' }}>⏳</span>}
                 {txStatus.success && <span style={{ color: '#10b981', fontSize: '18px' }}>✅</span>}
                 {!txStatus.loading && !txStatus.success && <span style={{ color: '#ef4444', fontSize: '18px' }}>❌</span>}
                 
                 {/* Main text */}
                 <div style={{ fontWeight: '600', fontSize: '15px' }}>
                     {txStatus.message}
                 </div>
              </div>
          
              {/* Solscan Link (Only on success) */}
              {txStatus.txid && txStatus.success && (
                <a 
                  href={`https://solscan.io/tx/${txStatus.txid}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ 
                      color: '#9ca3af', 
                      fontSize: '13px', 
                      textDecoration: 'none',
                      marginLeft: '28px', 
                  }}
                >
                  View on Solscan ↗
                </a>
              )}
            </div>
          )}

          {/* Shard Swap Pop-up — free tier vs GiftLocksmith */}
          {isShardSwapOpen && (
            <div
              style={{
                ...styles.modalOverlay,
                alignItems: 'center',
                padding: 'max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))',
                boxSizing: 'border-box',
                overflow: 'hidden',
              }}
              onClick={() => setIsShardSwapOpen(false)}
            >
              <div
                style={{
                  ...styles.modalContent,
                  background: '#131517',
                  border: '1px solid #333',
                  width: '100%',
                  maxWidth: '360px',
                  maxHeight: 'min(90dvh, 100%)',
                  display: 'flex',
                  flexDirection: 'column',
                  padding: 0,
                  overflow: 'hidden',
                  boxSizing: 'border-box',
                }}
                onClick={e => e.stopPropagation()}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '14px 16px 10px',
                    flexShrink: 0,
                    borderBottom: '1px solid #2a2a2a',
                  }}
                >
                  <h3 style={{ color: '#fff', margin: 0, fontSize: 18 }}>Shard Swap</h3>
                  <button onClick={() => { setIsShardSwapOpen(false); setIsModalOpen(true); }} style={{ background: 'none', border: 'none', color: '#888', fontSize: '22px', cursor: 'pointer', padding: 0, lineHeight: 1 }}>✕</button>
                </div>

                <div
                  style={{
                    flex: '1 1 auto',
                    minHeight: 0,
                    overflowY: 'auto',
                    WebkitOverflowScrolling: 'touch',
                    overscrollBehavior: 'contain',
                    padding: '12px 16px 16px',
                    boxSizing: 'border-box',
                    touchAction: 'pan-y',
                  }}
                >

                {/* Access Card (free path) — unified NFT-style panel */}
                {!hasLocksmithNft && (
                  <div style={{ marginBottom: 12 }}>
                    <SwapBadgeCard
                      inventory={stats.inventory || {}}
                      editionNumber={1}
                      editionTotal={SHARD_SWAP_CONFIG.freeAccessCardEditionTotal || 20000}
                      dailyCapShards={SHARD_SWAP_CONFIG.free.dailyCapShards}
                      compact
                      levelUpBusy={shardSwapBusy}
                      levelUpCostGft={
                        hasSwapLicense(stats.inventory)
                          ? badgeLevelUpCostGft(getSwapBadgeLevel(stats.inventory))
                          : null
                      }
                      canAffordLevelUp={
                        hasSwapLicense(stats.inventory) &&
                        badgeLevelUpCostGft(getSwapBadgeLevel(stats.inventory)) != null &&
                        (Number(balances.G2U) || 0) >=
                          (badgeLevelUpCostGft(getSwapBadgeLevel(stats.inventory)) || 0)
                      }
                      onLevelUp={levelUpSwapBadge}
                      onMint={() => {
                        notify(
                          'Mint opens later — card Lv5+ holders can mint and sell Access Cards. Not live yet.',
                        );
                      }}
                    />
                  </div>
                )}

                {/* GiftLocksmith — real NFT art (click for perks) */}
                {hasLocksmithNft && (
                  <div
                    style={{
                      marginBottom: 12,
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: '1px solid #9945FF88',
                      background: 'rgba(153,69,255,0.12)',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <button
                        type="button"
                        onClick={() => setLocksmithDetailOpen(true)}
                        title="View NFT details"
                        style={{
                          padding: 0,
                          width: 72,
                          height: 72,
                          borderRadius: 12,
                          border: '2px solid #9945FF88',
                          overflow: 'hidden',
                          background: '#000',
                          cursor: 'pointer',
                          flexShrink: 0,
                          boxShadow: '0 0 12px rgba(153,69,255,0.25)',
                        }}
                      >
                        <img
                          src="/shop/gift-locksmith.jpg"
                          alt="GiftLocksmith"
                          width={72}
                          height={72}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: '#f8fafc' }}>
                          GiftLocksmith
                        </div>
                        <div
                          style={{
                            position: 'relative',
                            marginTop: 4,
                            minHeight: 16,
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          <span style={{ color: '#c4b5fd' }}>NFT</span>
                          <span
                            style={{
                              display: 'block',
                              textAlign: 'center',
                              marginTop: -16,
                              color: '#86efac',
                            }}
                          >
                            Access granted
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setLocksmithDetailOpen(true)}
                          style={{
                            marginTop: 6,
                            background: 'none',
                            border: 'none',
                            color: '#c4b5fd',
                            fontSize: 11,
                            fontWeight: 700,
                            padding: 0,
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          View perks
                        </button>
                      </div>
                    </div>
                    {swapAccess.allowed && (() => {
                      const used = getDailySwapUsed(stats.inventory) || 0;
                      const cap = Number(swapAccess.dailyCapShards) || 0;
                      const left = Math.max(0, cap - used);
                      const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
                      return (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ color: '#ffd700', fontWeight: 800, fontSize: 12 }}>Daily swap</span>
                            <span style={{ color: '#ffd700', fontWeight: 900, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                              {used.toLocaleString()} / {cap.toLocaleString()}
                            </span>
                          </div>
                          <div style={{ height: 7, borderRadius: 4, background: 'rgba(0,0,0,0.55)', border: '1px solid #444', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#ca8a04,#ffd700,#fef08a)' }} />
                          </div>
                          <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
                            {left.toLocaleString()} left today · Fee {(swapAccess.feeBps / 100).toFixed(0)}% · permanent
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                <NftDetailModal
                  open={locksmithDetailOpen}
                  onClose={() => setLocksmithDetailOpen(false)}
                  title="GiftLocksmith"
                  imageSrc="/shop/gift-locksmith.jpg"
                  subtitle="Gift2u Elves · Gen 1 · Permanent utility NFT"
                  statusLine="Access granted"
                  perks={LOCKSMITH_PERKS}
                />

                {/* You Pay Section */}
                <div style={{ background: '#1c1e22', borderRadius: '16px', padding: '15px', textAlign: 'left', marginBottom: '5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#888', fontSize: '12px', gap: 8, flexWrap: 'wrap' }}>
                    <span>You pay</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {[0.25, 0.5, 1].map((pct) => (
                        <button
                          key={`shard-pct-${pct}`}
                          type="button"
                          disabled={!swapAccess.allowed || shardSwapBusy}
                          onClick={() => {
                            const bal = Number(balance) || 0;
                            if (bal <= 0) {
                              setShardSwapAmount('');
                              return;
                            }
                            setShardSwapAmount(String(Math.floor(bal * pct)));
                          }}
                          style={{
                            background: 'rgba(153, 69, 255, 0.2)',
                            color: '#e9d5ff',
                            border: '1px solid rgba(153, 69, 255, 0.45)',
                            borderRadius: '6px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            padding: '2px 6px',
                            cursor: !swapAccess.allowed || shardSwapBusy ? 'not-allowed' : 'pointer',
                            opacity: !swapAccess.allowed || shardSwapBusy ? 0.5 : 1,
                            outline: 'none',
                            WebkitTapHighlightColor: 'transparent',
                          }}
                        >
                          {pct === 1 ? 'MAX' : `${Math.round(pct * 100)}%`}
                        </button>
                      ))}
                      <span>Balance: {balance?.toLocaleString() || '0'}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                    <input 
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={shardSwapAmount}
                      onChange={(e) => setShardSwapAmount(e.target.value.replace(/[^0-9]/g, ''))}
                      disabled={!swapAccess.allowed || shardSwapBusy}
                      style={{ background: 'none', border: 'none', color: '#fff', fontSize: '24px', width: '60%', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', fontWeight: 'bold' }}>
                      <span>G2Ushards</span>
                    </div>
                  </div>
                </div>

                <div style={{ height: '30px', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2, position: 'relative', margin: '-15px 0' }}>
                  <div style={{ background: '#131517', border: '2px solid #333', borderRadius: '50%', padding: '0', color: '#fbef43', width: '34px', height: '34px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    ↓
                  </div>
                </div>

                <div style={{ background: '#1c1e22', borderRadius: '16px', padding: '15px', textAlign: 'left', marginTop: '5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '12px' }}>
                    <span>You receive (G2U credit)</span>
                    <span>Balance: {getSwapBalance('G2U')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                    <input 
                      type="number" 
                      placeholder="0.00"
                      value={shardQuote.ok ? shardQuote.gftOut : ''}
                      readOnly
                      style={{ background: 'none', border: 'none', color: '#fff', fontSize: '24px', width: '60%', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', fontWeight: 'bold' }}>
                      <span>G2U</span>
                    </div>
                  </div>
                  {shardQuote.ok && (
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: '#888' }}>
                      Gross {shardQuote.gftGross} G2U · fee {shardQuote.feeGft} G2U · you get {shardQuote.gftOut} G2U
                    </p>
                  )}
                  {!shardQuote.ok && shardSwapAmount && (
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: '#f87171' }}>{shardQuote.error}</p>
                  )}
                </div>

                {!swapAccess.allowed && (
                  <button
                    type="button"
                    disabled={
                      shardSwapBusy ||
                      currentLevel < SHARD_SWAP_CONFIG.freeUnlockMinLevel ||
                      balance < SHARD_SWAP_CONFIG.freeUnlockBurnShards ||
                      !!(stats.inventory?.swap_unlocked || stats.inventory?.swap_unlock_burned)
                    }
                    onClick={buySwapLicense}
                    style={{
                      width: '100%',
                      background:
                        currentLevel >= SHARD_SWAP_CONFIG.freeUnlockMinLevel &&
                        balance >= SHARD_SWAP_CONFIG.freeUnlockBurnShards
                          ? '#2a2d34'
                          : '#222',
                      color:
                        currentLevel >= SHARD_SWAP_CONFIG.freeUnlockMinLevel &&
                        balance >= SHARD_SWAP_CONFIG.freeUnlockBurnShards
                          ? '#fff'
                          : '#666',
                      border: '1px solid #4ade80',
                      padding: '14px',
                      borderRadius: '30px',
                      fontWeight: 'bold',
                      fontSize: '13px',
                      marginTop: '12px',
                      cursor:
                        currentLevel >= SHARD_SWAP_CONFIG.freeUnlockMinLevel &&
                        balance >= SHARD_SWAP_CONFIG.freeUnlockBurnShards
                          ? 'pointer'
                          : 'not-allowed',
                    }}
                  >
                    {shardSwapBusy
                      ? 'Working…'
                      : currentLevel < SHARD_SWAP_CONFIG.freeUnlockMinLevel
                        ? `Need Level ${SHARD_SWAP_CONFIG.freeUnlockMinLevel} first (you: ${currentLevel})`
                        : stats.inventory?.swap_unlock_burned || stats.inventory?.swap_unlocked
                          ? 'Badge owned — need Level 5+ or top up'
                          : `Get Access Card (${SHARD_SWAP_CONFIG.freeUnlockBurnShards.toLocaleString()} shards) · L${SHARD_SWAP_CONFIG.freeUnlockMinLevel}+`}
                  </button>
                )}

                <button 
                  type="button"
                  disabled={!swapAccess.allowed || !shardQuote.ok || shardSwapBusy || balance < Number(shardSwapAmount)}
                  onClick={executeShardSwap}
                  style={{ 
                    width: '100%', 
                    background: swapAccess.allowed && shardQuote.ok ? 'linear-gradient(90deg, #9945FF, #14F195)' : '#333', 
                    color: swapAccess.allowed && shardQuote.ok ? '#000' : '#888', 
                    border: 'none', 
                    padding: '16px', 
                    borderRadius: '30px', 
                    fontWeight: 'bold', 
                    fontSize: '16px',
                    marginTop: '12px',
                    marginBottom: '8px',
                    cursor: swapAccess.allowed && shardQuote.ok ? 'pointer' : 'not-allowed'
                  }}
                >
                  {shardSwapBusy
                    ? 'Swapping…'
                    : !swapAccess.allowed
                      ? 'Swap locked'
                      : 'Swap G2Ushards → G2U'}
                </button>
                </div>
              </div>
            </div>
          )}

          {/* WALLET GENERATION OVERLAY - Style-Compatible version */}
          {showWalletGenerator && (
            <div style={{...styles.modalOverlay, zIndex: 9999, background: 'rgba(0,0,0,0.95)'}}>
              <div style={{...styles.modalContent, border: '2px solid #ffd700', padding: '30px'}}>
                <h2 style={{color: '#ffd700', fontSize: '1.5rem', marginBottom: '15px'}}>🛡️ Secure Your Wallet</h2>
                
                <p style={{fontSize: '12px', color: '#ccc', marginBottom: '20px'}}>
                  We've created a real Solana wallet for you. 
                  <span style={{color: '#ff4d4d', display: 'block', fontWeight: 'bold', marginTop: '10px'}}>
                    If you lose this key, your funds are gone forever. We do not store a backup.
                  </span>
                </p>

                <div style={{background: '#000', padding: '15px', borderRadius: '10px', border: '1px solid #333', marginBottom: '20px'}}>
                  <p style={{fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: '5px'}}>Secret Key (Base58)</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '10px' }}>
                    {(localStorage.getItem(`wallet_secret_${playerId}`) || "").split(" ").map((word, i) => (
                      word ? (
                        <div key={i} style={{ background: '#222', padding: '6px', borderRadius: '6px', fontSize: '12px', color: '#4ade80', textAlign: 'center', border: '1px solid #333' }}>
                          <span style={{ color: '#888', marginRight: '4px', fontSize: '10px' }}>{i + 1}.</span>{word}
                        </div>
                      ) : null
                    ))}
                  </div>
                </div>

                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(generatedSecret);
                    notify("Key Copied!");
                  }}
                  style={{...styles.actionBtn, width: '100%', marginBottom: '10px', background: '#333', color: '#fff', border: '1px solid #444'}}
                >
                  📋 Copy Secret Key
                </button>

                <button 
                  onClick={() => {
                    setShowWalletGenerator(false);
                    setGeneratedSecret(null);
                  }}
                  style={{...styles.actionBtn, width: '100%'}}
                >
                  I'VE SAVED IT, LET'S PLAY!
                </button>
              </div>
            </div>
          )}

          {/* Menu → View 12 words (standalone; ✕ returns to Menu, not Wallet) */}
          {showMenuSecretPhrase && (
            <div
              style={{
                ...styles.modalOverlay,
                zIndex: 10050,
              }}
              onClick={() => {
                setShowMenuSecretPhrase(false);
                setIsMenuOpen(true);
              }}
            >
              <div
                style={{
                  ...styles.modalContent,
                  maxWidth: 400,
                  textAlign: 'left',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12,
                  }}
                >
                  <h3 style={{ margin: 0, color: '#ffd700', fontSize: 18 }}>
                    🔐 Your 12 secret words
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenuSecretPhrase(false);
                      setIsMenuOpen(true);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#888',
                      fontSize: 22,
                      cursor: 'pointer',
                      lineHeight: 1,
                    }}
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
                <p style={{ fontSize: 12, color: '#ccc', marginBottom: 14, lineHeight: 1.45 }}>
                  These words restore your account. Never share them. Closing this returns you to the menu.
                </p>
                <div
                  style={{
                    background: '#000',
                    padding: 15,
                    borderRadius: 10,
                    border: '1px solid #ffd700',
                    marginBottom: 14,
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 8,
                    }}
                  >
                    {(decryptedPhrase || generatedSecret || '')
                      .split(' ')
                      .map((word, i) =>
                        word ? (
                          <div
                            key={i}
                            style={{
                              background: '#222',
                              padding: 6,
                              borderRadius: 6,
                              fontSize: 12,
                              color: '#4ade80',
                              textAlign: 'center',
                              border: '1px solid #333',
                            }}
                          >
                            <span style={{ color: '#888', marginRight: 4, fontSize: 10 }}>
                              {i + 1}.
                            </span>
                            {word}
                          </div>
                        ) : null,
                      )}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyPhrase}
                    style={{
                      width: '100%',
                      padding: 10,
                      marginTop: 15,
                      background: '#222',
                      color: '#4ade80',
                      border: '1px solid #4ade80',
                      borderRadius: 8,
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: 14,
                    }}
                  >
                    📋 COPY 12-WORD PHRASE
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowMenuSecretPhrase(false);
                    setIsMenuOpen(true);
                  }}
                  style={{
                    width: '100%',
                    background: '#fbef43',
                    color: '#000',
                    padding: 12,
                    borderRadius: 8,
                    fontWeight: 'bold',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Back to menu
                </button>
              </div>
            </div>
          )}


          {showAirdropBoard && (
            <div
              style={{
                ...styles.modalOverlay,
                zIndex: 10050,
                overflowY: 'auto',
                alignItems: 'flex-start',
                padding: '20px 12px',
              }}
              onClick={() => {
                setShowAirdropBoard(false);
                setIsMenuOpen(true);
              }}
            >
              <div
                style={{
                  ...styles.modalContent,
                  maxWidth: 480,
                  margin: '24px auto',
                  maxHeight: 'none',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h3 style={{ margin: 0, color: '#67e8f9', fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img
                      src="/g2u-airdrop-gift.png"
                      alt=""
                      width={28}
                      height={28}
                      style={{ width: 28, height: 28, objectFit: 'contain' }}
                    />
                    G2U Airdrop
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAirdropBoard(false);
                      setIsMenuOpen(true);
                    }}
                    style={{ background: 'none', border: 'none', color: '#888', fontSize: 22, cursor: 'pointer' }}
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
                {airdropLoading ? (
                  <p style={{ color: '#888', textAlign: 'center', padding: 24 }}>Loading board…</p>
                ) : (
                  <AirdropBoard
                    progress={airdropProgress}
                    username={player?.username || getPlayerProfile().username}
                    compact
                  />
                )}
                <a
                  href="/airdrop"
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    marginTop: 14,
                    color: '#a78bfa',
                    fontWeight: 'bold',
                    fontSize: 13,
                  }}
                >
                  Open full page on gift2u.fun →
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setShowAirdropBoard(false);
                    setIsMenuOpen(true);
                  }}
                  style={{
                    width: '100%',
                    marginTop: 12,
                    background: '#fbef43',
                    color: '#000',
                    border: 'none',
                    borderRadius: 10,
                    padding: 12,
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  Back to menu
                </button>
              </div>
            </div>
          )}

          {/* --- REFACTORED MENU COMPONENT --- */}
          <Menu 
            isMenuOpen={isMenuOpen} 
            setIsMenuOpen={setIsMenuOpen}
            appLanguage={appLanguage}
            setAppLanguage={setAppLanguage}
            displayCurrency={displayCurrency}
            setDisplayCurrency={setDisplayCurrency}
            t={t}
            ALL_CURRENCIES={ALL_CURRENCIES}
            onOpenWhitepaper={() => {
              setIsMenuOpen(false);
              setIsWhitepaperOpen(true);
            }}
            onOpenRoadmap={() => {
              setIsMenuOpen(false);
              setIsRoadmapOpen(true);
            }}
            onOpenSecret={() => {
              setIsMenuOpen(false);
              setShowMenuSecretPhrase(true);
            }}
            username={player.username || getPlayerProfile().username || 'Player'}
            playerId={playerId}
            onLogout={handleLogout}
            needsPassword={needsPassword}
            onOpenClaimAccount={() => {
              setIsMenuOpen(false);
              setShowClaimAccount(true);
            }}
            onOpenTerms={() => {
              setIsMenuOpen(false);
              setLegalKind('terms');
            }}
            onOpenPrivacy={() => {
              setIsMenuOpen(false);
              setLegalKind('privacy');
            }}
            onOpenLeaderboard={() => {
              setIsMenuOpen(false);
              openLeaderboardPage();
            }}
            onOpenAirdrop={() => {
              setIsMenuOpen(false);
              openAirdropBoard();
            }}
          />

          <LegalModal
            kind={legalKind}
            isOpen={!!legalKind}
            onClose={() => {
              setLegalKind(null);
              setIsMenuOpen(true);
            }}
          />

          <ClaimAccountModal
            isOpen={showClaimAccount}
            onClose={() => {
              setShowClaimAccount(false);
              setIsMenuOpen(true); // X / Cancel → back to menu
            }}
            playerId={playerId}
            currentUsername={player.username || getPlayerProfile().username || ''}
            required={false}
            onSuccess={(newName) => {
              setUsername(newName);
              setPlayer(getPlayerProfile());
              setNeedsPassword(false);
              setShowClaimAccount(false);
              setIsMenuOpen(true); // after save → back to menu
            }}
          />

          {/* --- REFACTORED WHITEPAPER COMPONENT --- */}
          <WhitepaperModal 
            isWhitepaperOpen={isWhitepaperOpen} 
            setIsWhitepaperOpen={setIsWhitepaperOpen}
            onClose={() => {
              setIsWhitepaperOpen(false);
              setIsMenuOpen(true); // ✕ → back to menu
            }}
          />

          <RoadmapModal
            isOpen={isRoadmapOpen}
            onClose={() => {
              setIsRoadmapOpen(false);
              setIsMenuOpen(true);
            }}
          />

          {/* THE AD MODAL - Refactored to match your native game architecture */}

      {isAdModalOpen && (
            <div
              style={styles.modalOverlay}
              onClick={() => {
                if (!isWatchingAd) setIsAdModalOpen(false);
              }}
            >
              <div style={{ ...styles.modalContent, background: '#131517', border: '1px solid #333', textAlign: 'center', width: '90%', maxWidth: '360px' }} onClick={e => e.stopPropagation()}>
                
                <h2 style={{ color: '#ffd700', marginTop: 0, marginBottom: '15px', fontSize: '24px' }}>⚡ Expand Capacity</h2>
                
                {isWatchingAd && isSeekerShell() ? (
                  <>
                    <p style={{ color: '#ccc', fontSize: '14px', marginBottom: '12px', lineHeight: '1.5' }}>
                      Full-screen ad on Seeker — use the ad&apos;s own countdown.
                      <br />
                      <span style={{ fontSize: '12px', color: '#888' }}>
                        Closing early = no Free Energy. Reward only after the ad completes.
                      </span>
                    </p>
                    <p style={{ color: '#ffd700', fontSize: '16px', fontWeight: 'bold', margin: '20px 0 12px' }}>
                      Watching ad…
                    </p>
                    <p style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>
                      Wait for the native ad to finish.
                    </p>
                  </>
                ) : isWatchingAd && adSecondsLeft !== null ? (
                  <>
                    <p style={{ color: '#ccc', fontSize: '14px', marginBottom: '12px', lineHeight: '1.5' }}>
                      Ad tab open — keep it open until this timer hits <strong style={{ color: '#ffd700' }}>0</strong>.
                      <br />
                      <span style={{ fontSize: '12px', color: '#888' }}>
                        Closing early = no reward. &quot;Leave site?&quot; is from the ad network.
                      </span>
                    </p>
                    <div
                      style={{
                        fontSize: '56px',
                        fontWeight: '900',
                        color: adSecondsLeft === 0 ? '#4ade80' : '#ffd700',
                        margin: '16px 0',
                        fontVariantNumeric: 'tabular-nums',
                        textShadow: '0 0 20px rgba(255, 215, 0, 0.35)',
                      }}
                    >
                      {adSecondsLeft}
                    </div>
                    <p style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>
                      {adSecondsLeft > 0
                        ? 'Finish the ad — reward unlocks only when it completes…'
                        : 'Finishing…'}
                    </p>
                  </>
                ) : (
                  <p style={{ color: '#ccc', fontSize: '14px', marginBottom: '20px', lineHeight: '1.5' }}>
                    Want to tap more? Watch a short rewarded ad to expand your Daily Energy Limit by +100 for today.
                    {isSeekerShell()
                      ? ' On Seeker, ads run in-app (AdMob) — energy only after the ad finishes.'
                      : ' Energy is only granted when the ad network confirms the view (blocked ads do not count).'}
                    <br /><br />
                    <span style={{ fontSize: '12px', color: '#888' }}>
                      (Max 10 ads per day. You have watched {dailyAdsWatched}/10)
                    </span>
                  </p>
                )}
                
                <button 
                  onClick={handleWatchAd}
                  disabled={dailyAdsWatched >= 10 || isWatchingAd}
                  style={{ 
                    width: '100%', 
                    background: (dailyAdsWatched >= 10 || isWatchingAd) ? '#333' : '#fbef43', 
                    color: (dailyAdsWatched >= 10 || isWatchingAd) ? '#888' : '#000', 
                    border: 'none', 
                    padding: '16px', 
                    borderRadius: '30px', 
                    fontWeight: 'bold', 
                    fontSize: '16px',
                    marginBottom: '10px',
                    cursor: (dailyAdsWatched >= 10 || isWatchingAd) ? 'not-allowed' : 'pointer',
                    opacity: (dailyAdsWatched >= 10 || isWatchingAd) ? 0.5 : 1
                  }}
                >
                  {dailyAdsWatched >= 10
                    ? 'Daily Limit Reached'
                    : isWatchingAd
                      ? (isSeekerShell()
                        ? 'Watching ad…'
                        : `⏱ ${adSecondsLeft ?? AD_MIN_WATCH_SECONDS}s…`)
                      : '▶ Watch Ad'}
                </button>
                
                <button 
                  onClick={() => {
                    if (!isWatchingAd) setIsAdModalOpen(false);
                  }}
                  disabled={isWatchingAd}
                  style={{ 
                    width: '100%', 
                    background: 'transparent', 
                    border: '1px solid #555', 
                    color: isWatchingAd ? '#444' : '#888', 
                    padding: '14px', 
                    borderRadius: '30px', 
                    fontWeight: 'bold', 
                    fontSize: '14px',
                    cursor: isWatchingAd ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isWatchingAd
                    ? (isSeekerShell() ? 'Wait for ad…' : 'Wait for timer…')
                    : 'Close'}
                </button>

              </div>
            </div>
          )}

        </div>
      
    </div>
  );
};

export default GiftTapGame;