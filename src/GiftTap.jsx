import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Connection, PublicKey, clusterApiUrl, Keypair, Transaction, SystemProgram, ComputeBudgetProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL, VersionedTransaction } from '@solana/web3.js';
import { supabase } from './supabaseClient';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import BetaGate from './BetaGate';
import Marketplace from './Marketplace';
import Tasks from './Tasks';
import Friends from './Friends';
import Menu from './Menu';
import WhitepaperModal from './WhitepaperModal';
import { showRewardedAdWaterfall } from './adService';
import bs58 from "bs58";
import CryptoJS from 'crypto-js';
import { keypairFromMnemonic } from './solanaWallet';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getPlayerProfile,
  setPlayerId,
  setUsername,
  captureReferralFromUrl,
  consumeReferralId,
  getInviteLink,
  vaultSaltFor,
  DB_PLAYER_ID,
} from './playerIdentity';
// DB_PLAYER_ID === 'telegram_id' (legacy Supabase column — still the player primary key)

const TOKEN_MINTS = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  GFT: "YOUR_GFT_MINT_ADDRESS_HERE" // <-- Replace with real GFT mint
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
  if (taps < 375000) return 10 + Math.floor((taps - 125000) / 25000); 
  if (taps < 875000) return 20 + Math.floor((taps - 375000) / 50000); 
  if (taps < 2875000) return 30 + Math.floor((taps - 875000) / 100000); 
  return 50; 
};

export const getPaywallCap = (maxUnlockedLevel) => {
  if (maxUnlockedLevel <= 4) return 50000;
  if (maxUnlockedLevel <= 9) return 125000;
  if (maxUnlockedLevel <= 19) return 375000;
  if (maxUnlockedLevel <= 29) return 875000;
  if (maxUnlockedLevel <= 49) return 2875000;
  return Infinity; 
};

export const getNextLevelTarget = (currentLevel) => {
  if (currentLevel < 5) return (currentLevel + 1) * 10000;
  if (currentLevel < 10) return 50000 + ((currentLevel + 1 - 5) * 15000);
  if (currentLevel < 20) return 125000 + ((currentLevel + 1 - 10) * 25000);
  if (currentLevel < 30) return 375000 + ((currentLevel + 1 - 20) * 50000);
  if (currentLevel < 50) return 875000 + ((currentLevel + 1 - 30) * 100000);
  return 2875000; // Max level cap
};

export const getLevelMultiplier = (level) => {
  if (level >= 50) return 2.00;
  if (level >= 30) return 1.75;
  if (level >= 20) return 1.50;
  if (level >= 10) return 1.30;
  if (level >= 5) return 1.15;
  return 1.00;
};

export const ASCENSION_WALLS = {
  4: { targetLevel: 5, shardCost: 15000, solCost: 0.025, newCap: 9 },
  9: { targetLevel: 10, shardCost: 25000, solCost: 0.05, newCap: 19 },
  19: { targetLevel: 20, shardCost: 50000, solCost: 0.10, newCap: 29 },
  29: { targetLevel: 30, shardCost: 100000, solCost: 0.20, newCap: 49 },
  49: { targetLevel: 50, shardCost: 250000, solCost: 0.50, newCap: 50 }
};

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
      padding: '8px 14px', 
      borderRadius: '20px', 
      cursor: 'pointer', 
      fontWeight: 'bold', 
      fontSize: '12px', 
      display: 'flex', 
      alignItems: 'center', 
      gap: '8px', 
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)', // Sleek drop shadow
      outline: 'none', 
      WebkitTapHighlightColor: 'transparent'
    },
    walletDot: { width: '8px', height: '8px', background: '#4ade80', borderRadius: '50%', boxShadow: '0 0 8px rgba(74, 222, 128, 0.6)' },
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

  // Web player identity FIRST (local UUID). Never Telegram WebApp.
  // DB still stores this under column telegram_id (see DB_PLAYER_ID).
  const [player, setPlayer] = useState(() => {
    captureReferralFromUrl();
    return getPlayerProfile();
  });
  const playerId = String(player.id);

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
  const [balances, setBalances] = useState({ sol: 0, GFT: 0, GFTshards: 0, usdc: 0 });
  const [leaderboardType, setLeaderboardType] = useState('all_time');
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [dailyTaps, setDailyTaps] = useState(0);
  const [streak, setStreak] = useState(0);
  const [lastTapDate, setLastTapDate] = useState(new Date().toISOString().split('T')[0]);
  const [isPressed, setIsPressed] = useState(false);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [maxDailyLimit, setMaxDailyLimit] = useState(1000);
  const [seasonTimeLeft, setSeasonTimeLeft] = useState('');
  const [tapPower, setTapPower] = useState(1);
  const [currentPage, setCurrentPage] = useState('home'); // 'home', 'shop', 'tasks', 'friends'
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
  const [currentLevel, setCurrentLevel] = useState(0);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [itemToBuy, setItemToBuy] = useState(null);
  const touchLock = useRef(false);
  const optimisticTaps = useRef(lifetimeTaps);
  const [decryptedPhrase, setDecryptedPhrase] = useState("");
  // Settings Menu State
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState('USD'); 
  const [solFiatRates, setSolFiatRates] = useState({}); // Now an empty object that fills dynamically
  const [appLanguage, setAppLanguage] = useState('EN');
  const [isWhitepaperOpen, setIsWhitepaperOpen] = useState(false);
  const [swapFromToken, setSwapFromToken] = useState('SOL');
  const [swapToToken, setSwapToToken] = useState('GFT');
  const [isShardSwapOpen, setIsShardSwapOpen] = useState(false);
  const [shardSwapAmount, setShardSwapAmount] = useState('');
  const [isEstimating, setIsEstimating] = useState(false);
  const [userRank, setUserRank] = useState(null);
  const [seasonShards, setSeasonShards] = useState(0);
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const [isAdModalOpen, setIsAdModalOpen] = useState(false);
  const [dailyAdsWatched, setDailyAdsWatched] = useState(0);
  const pendingShards = useRef(0);
  const pendingCost = useRef(0);

  const handleWatchAd = async (e) => {
    if (e) e.stopPropagation(); // Stop click-through to Gift
    if (isWatchingAd) return;
    if (dailyAdsWatched >= 10) {
      alert("Daily limit reached! (10/10)");
      return;
    }

    setIsWatchingAd(true);
    const adStartTime = Date.now();

    try {
      const result = await showRewardedAdWaterfall();
      const elapsed = (Date.now() - adStartTime) / 1000;

      // --- 1. STRICT SECURITY CHECK (Time + Result) ---
      if (result && result.success && elapsed >= 13) {
        
        const newMaxLimit = maxDailyLimit + 100;
        const newAdsCount = dailyAdsWatched + 1;
        const today = new Date().toISOString().split('T')[0];
        
        // Calculate midnight for the temporary boost
        const midnightTonight = new Date();
        midnightTonight.setHours(23, 59, 59, 999);

        // --- 2. THE PROTECTIVE UPDATE ---
        // We include EVERY boost field so Supabase never resets your 2000 SOL boost.
        const dbUpdates = {
          max_daily_limit: newMaxLimit,
          daily_ads_watched: newAdsCount,
          last_ad_date: today,
          // 🚨 PROTECT THE SOL BOOST (Keep them in the update)
          limit_boost_amount: stats.limit_boost_amount,
          limit_boost_expires: stats.limit_boost_expires,
          // Synchronize the Ad Energy Boost fields too
          ad_energy_boost: (stats.ad_energy_boost || 0) + 100,
          ad_energy_expires: midnightTonight.toISOString(),
          last_updated: new Date().toISOString()
        };

        const { error } = await supabase
          .from('players')
          .update(dbUpdates)
          .eq(DB_PLAYER_ID, playerId);

        if (error) throw error;

        // --- 3. UPDATE UI ---
        setMaxDailyLimit(newMaxLimit);
        setDailyAdsWatched(newAdsCount);
        if (setStats) setStats({ ...stats, ...dbUpdates });
        setIsAdModalOpen(false);

        alert("✅ Verified! +100 Energy Capacity added.");
      } else {
        alert("⚠️ Ad Interrupted: Watch the full video to get the reward!");
      }
    } catch (err) {
      console.error("Ad Error:", err);
      alert("No ads available. Please try again later.");
    } finally {
      setIsWatchingAd(false);
    }
  };

  const getSwapBalance = (token) => {
    if (token === 'SOL') return balances.sol?.toFixed(4) || '0.0000';
    if (token === 'USDC') return balances.usdc?.toFixed(2) || '0.00'; // Adjust if your USDC state name is different
    if (token === 'GFT') return balances.GFT?.toLocaleString() || '0.00';
    return '0.00';
  };

  const ALL_CURRENCIES = [
    'USD', 'EUR', 'CAD', 'GBP', 'AUD', 'JPY', 'CNY', 'INR', 'PHP', 'IDR', 
    'BRL', 'MXN', 'ARS', 'NGN', 'ZAR', 'TRY', 'AED', 'SGD', 'HKD', 'NZD', 
    'KRW', 'THB', 'VND', 'MYR', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK'
  ];

  // Fetch real-time SOL price for ALL currencies instantly
  useEffect(() => {
    const fetchFiatPrices = async () => {
      try {
        // Automatically formats the array into a comma-separated string for the API
        const coinString = ALL_CURRENCIES.join(',').toLowerCase();
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=${coinString}`);
        const data = await res.json();
        
        if (data && data.solana) {
          // Dynamically map the API response to uppercase keys
          const rates = {};
          ALL_CURRENCIES.forEach(currency => {
            const lowerKey = currency.toLowerCase();
            if (data.solana[lowerKey]) {
              rates[currency] = data.solana[lowerKey];
            }
          });
          setSolFiatRates(rates);
        }
      } catch (err) {
        console.error("Failed to fetch global fiat prices:", err);
      }
    };
    fetchFiatPrices();
  }, []);

  // The Translation Engine Dictionary
  const TRANSLATIONS = {
    EN: {
      menu: "Menu",
      language: "Language",
      currency: "Currency",
      secret: "View Secret Phrase",
      rules: "Whitepaper & Rules"
    },
    FR: {
      menu: "Menu",
      language: "Langue",
      currency: "Devise",
      secret: "Voir la phrase secrète",
      rules: "Livre blanc & Règles"
    }
    // You can add ES, PT, etc., as you expand!
  };
  // Universal Translation Formatter
  // Usage: t('currency') -> returns "Currency" (if EN) or "Devise" (if FR)
  const t = (key) => {
    return TRANSLATIONS[appLanguage]?.[key] || TRANSLATIONS['EN'][key] || key;
  };

  // Keep the ref synced if lifetimeTaps changes from the database load
  useEffect(() => { 
    optimisticTaps.current = lifetimeTaps; 
  }, [lifetimeTaps]);

  const connection = useMemo(() => {
    const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL;
    return new Connection(rpcUrl || clusterApiUrl('mainnet-beta'), 'confirmed');
  }, []);

  const GIFT_TREASURY_WALLET = new PublicKey("8G7uEcPS6dwA5wW9bGoqi98EzBunF8trjbbFJkgkvBPm");

  // 2. FETCH TOP LEADER (Individual Badge)
  const fetchTopLeader = useCallback(async () => {
    try {
      const { data } = await supabase.from('leaderboard_all_time').select('*').order('lifetime_taps', { ascending: false }).limit(1).maybeSingle();
      if (data) {
        setTopLeader({
          name: data.username || (data[DB_PLAYER_ID] ? `ID:..${String(data[DB_PLAYER_ID]).slice(-4)}` : 'Anon'),
          score: data.lifetime_taps
        });
      }
    } catch (err) { console.error("Badge fetch error:", err); }
  }, []);

  // 3. FETCH FULL LEADERBOARD (Modal)
  const fetchFullLeaderboard = async (typeOverride) => {
    const targetType = typeOverride || leaderboardType;
    const tableName = targetType === 'all_time' ? 'leaderboard_all_time' : 'leaderboard_season';
    const sortColumn = targetType === 'all_time' ? 'lifetime_taps' : 'score';
    
    // Add this to ensure the list is ranked from #1 to #100
    const { data } = await supabase
      .from(tableName)
      .select('*')
      .order(sortColumn, { ascending: false }) // Sorts by total effort
      .limit(100);
      
    setLeaderboard(data || []);
    setIsLeaderboardOpen(true);
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
    setIsLoading(true);
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
        setHasAccess(playerRow.has_beta_access || false);
        setPlayerWallet(playerRow.wallet_address);
        
        setBalances({ 
          sol: playerRow.sol_balance || 0, 
          GFT: playerRow.gft_token_balance || 0, 
          GFTshards: Number(playerRow.shard_balance) || 0, 
          usdc: playerRow.usdc_balance || 0 
        });
        setBalance(Number(playerRow.shard_balance));
        setTapPower(playerRow.tap_power || 1);
        setMaxDailyLimit(playerRow.max_daily_limit || 1000);
        
        // Load Backpack and Timers
        setStats({
          inventory: playerRow.inventory || {},
          frenzy_expires: playerRow.frenzy_expires || null,
          efficiency_expires: playerRow.efficiency_expires || null,
          energy_boost_expires: playerRow.energy_boost_expires || null,
          premium_multiplier: playerRow.premium_multiplier || 1,
          premium_multiplier_expires: playerRow.premium_multiplier_expires || null,
          limit_boost_amount: playerRow.limit_boost_amount || 0,
          limit_boost_expires: playerRow.limit_boost_expires || null
        });
        
        setLifetimeTaps(Number(playerRow.lifetime_taps) || 0);
        setSeasonShards(Number(playerRow.season_shards) || 0); 
        setMaxUnlockedLevel(playerRow.max_unlocked_level || 4); 
        setCurrentLevel(calculateLevel(Number(playerRow.lifetime_taps) || 0));
        // 🚨 ADD THIS LINE TO LOAD ENERGY FROM DB
        setEnergy(Number(playerRow.last_energy) || 0);

        // Daily Reset Logic
        const today = new Date().toISOString().split('T')[0];
        setLastTapDate(playerRow.last_tap_date || today);
        setStreak(playerRow.current_streak || 0);

        if (playerRow.last_tap_date !== today) {
          setDailyTaps(0);
        } else {
          setDailyTaps(playerRow.daily_taps || 0);
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

        // A. Energy Recovery Math
        const recovered = Math.max(0, Math.floor(secondsPassed / 4)); 
        // If dbEnergy is 0, we fallback to 500 to keep the game playable as it was before
        const dbEnergy = (Number(playerRow.last_energy) > 0) ? Number(playerRow.last_energy) : 500;
        setEnergy(Math.min(dbEnergy + recovered, 500));
        
        // 🚨 NEW: B. Weekend Bot (Offline Farming) Multi-Day Math
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
                
                // 2. ASCENSION WALL CHECK
                if (calculateLevel(projectedLifetime) > playerMaxLevel) {
                    
                    // 3. INLINE CAP MATH (No external functions needed to prevent crashes)
                    let paywallCap = 50000;
                    if (playerMaxLevel <= 4) paywallCap = 50000;
                    else if (playerMaxLevel <= 9) paywallCap = 125000;
                    else if (playerMaxLevel <= 19) paywallCap = 375000;
                    else if (playerMaxLevel <= 29) paywallCap = 875000;
                    else if (playerMaxLevel <= 49) paywallCap = 2875000;
                    else paywallCap = 999999999999;

                    // Trim the earnings to perfectly hit the wall without passing it
                    offlineShardsEarned = Math.max(0, paywallCap - currentLifetimeTaps);
                    projectedLifetime = paywallCap;
                    
                    console.log("Bot hit the ascension wall and safely stopped mining.");
                }

                if (offlineShardsEarned > 0) {
                    // 1. Update React UI instantly (Balance, Limits, and Leaderboard Stats!)
                    setBalance(prev => prev + offlineShardsEarned);
                    setDailyTaps(simDailyTaps); 
                    setLifetimeTaps(prev => prev + offlineShardsEarned); // <-- NEW: Updates Level XP visually
                    setSeasonShards(prev => prev + offlineShardsEarned); // <-- NEW: Updates Beta Season visually (if you use this state)
                    
                    // 2. Save to Supabase (Add shards to ALL tracking columns)
                    supabase
                      .from('players')
                      .update({ 
                          shard_balance: Number(playerRow.shard_balance) + offlineShardsEarned,
                          daily_taps: simDailyTaps,
                          lifetime_taps: projectedLifetime,
                          season_shards: Number(playerRow.season_shards) + offlineShardsEarned, // <-- NEW: Pushes to Beta Leaderboard
                          last_tap_date: todayStr, 
                          last_updated: new Date().toISOString() // Reset the clock
                      })
                      .eq(DB_PLAYER_ID, userId)
                      .then(({ error }) => {
                          if (error) console.error("Bot sync failed:", error);
                      });

                    // Fire the welcome back popup!
                    setTimeout(() => {
                        alert(`🤖 Welcome back! Your Bot farmed ${offlineShardsEarned.toLocaleString()} Shards while you were away!`);
                        // If the bot drove them directly into the wall, show the Ascension Modal immediately
                        if (calculateLevel(projectedLifetime) >= maxUnlockedLevel) {
                             setShowAscensionModal(true);
                        }
                    }, 1000);
                } else {
                    // Bot active but mined 0 (Limit was maxed before they left)
                    supabase.from('players').update({ last_updated: new Date().toISOString() }).eq(DB_PLAYER_ID, userId).then();
                    setShowAscensionModal(true);
                }
            } else {
              // Bot active but mined 0 (Limit was maxed before they left)
              supabase.from('players').update({ last_updated: new Date().toISOString() }).eq(DB_PLAYER_ID, userId).then();
            }
        } else {
            // No bot active or expired before last login (THE HEARTBEAT SYNC)
            supabase.from('players').update({ last_updated: new Date().toISOString() }).eq(DB_PLAYER_ID, userId).then();
        }

        // 🚨 THE DECRYPTION FIX: Load the wallet into the UI from the Cloud
        if (playerRow.encrypted_vault) {
          const unlockedSecret = decryptWallet(playerRow.encrypted_vault, invisibleKey);
          if (unlockedSecret) {
            setDecryptedPhrase(unlockedSecret); // Session unlocked silently!
          }
        }

        setIsDataLoaded(true);
        return;
      } 
      // ==========================================
      // CASE B: NEW PLAYER (No Wallet Found)
      // ==========================================
      else if (!playerRow) {
        console.log("No wallet found, generating...");
        
        const response = await fetch('https://ncwlbwzxfpcnxkyrmdck.supabase.co/functions/v1/create-user-wallet', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({ 
            telegram_id: userId, // edge fn arg — value is web playerId, not TG
            username: player.username || player.first_name || 'Player'
          })
        });

        const result = await response.json();

        if (result && result.publicKey) {
          let encryptedVault = null;
          const rawSecret = result.mnemonic || result.secretKey;

          if (rawSecret) {
            encryptedVault = encryptWallet(rawSecret, invisibleKey);
            setDecryptedPhrase(rawSecret); // Set active memory
            
            // Nuke the temporary local storage so we never rely on it again
            localStorage.removeItem(`wallet_secret_${userId}`);
            localStorage.removeItem(`wallet_pwd_${userId}`);
          }

          // FORCE CREATE THE PLAYER ROW IN SUPABASE (With Encrypted Vault)
          const { error: insertError } = await supabase
            .from('players')
            .upsert({
              [DB_PLAYER_ID]: userId,
              wallet_address: result.publicKey,
              encrypted_vault: encryptedVault,
              username: player.username || player.first_name || 'Player',
              has_beta_access: false,
              shard_balance: 0,
              season_shards: 0,
              lifetime_taps: 0,
              sol_balance: 0,
              usdc_balance: 0
            }, { onConflict: DB_PLAYER_ID });

          if (insertError) {
            console.error("❌ Failed to create new player row:", insertError.message);
          }

          setPlayerWallet(result.publicKey);
          // 🚨 LOCK 2: Force the browser to burn the old ghost receipt
          localStorage.removeItem(`wallet_backed_up_${userId}`);
          setHasAccess(false); // Grant access to the new player
          setMustBackup(true); // Trigger your original backup warning
          setIsDataLoaded(true);
        } else {
          console.error("Wallet generation failed.");
          setHasAccess(true);
        }
      }

      await fetchTopLeader();
    } catch (err) {
      console.error("Sync Error:", err.message);
    } finally {
      setIsLoading(false);
    }
  }, [playerId, player.username, player.first_name, fetchTopLeader]);

  const initializeNewPlayer = async () => {
    setIsLoading(true);
    try {
      const userId = playerId;
      const userName = player.username || player.first_name || 'Player';

      // --- 1. REFERRAL & ECONOMY LOGIC ---
      const referrerId = consumeReferralId(); 
      const REFERRER_BONUS = 2000;
      const JOINER_BONUS = 500;
      const startingShards = referrerId ? JOINER_BONUS : 0;

      // --- 2. GENERATE SECURE WALLET (EDGE FUNCTION) ---
      const response = await fetch('https://ncwlbwzxfpcnxkyrmdck.supabase.co/functions/v1/create-user-wallet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ telegram_id: userId, username: userName })  // edge fn arg name (player key value)
      });

      const newWallet = await response.json();
      console.log("🚨 RAW EDGE RESPONSE:", newWallet);

      if (newWallet && newWallet.publicKey) {
        let encryptedVault = null;

        // --- 3. INVISIBLE KEY ENCRYPTION ---
        if (newWallet.mnemonic) {
          const rawSecret = newWallet.mnemonic;
          const invisibleKey = vaultSaltFor(userId); 
          encryptedVault = encryptWallet(rawSecret, invisibleKey);

          setDecryptedPhrase(rawSecret); // Unlocks active RAM session
          setGeneratedSecret(rawSecret); // Keeps UI working
          
          localStorage.removeItem(`wallet_secret_${userId}`);
          localStorage.removeItem(`wallet_pwd_${userId}`);
        }

        // --- 4. THE SAFE SAVE (Check, then Insert or Update) ---
      
      // First, see if the player row already exists
      const { data: existingPlayer } = await supabase
        .from('players')
        .select(DB_PLAYER_ID)
        .eq(DB_PLAYER_ID, userId)
        .maybeSingle();

      const playerData = {
        [DB_PLAYER_ID]: userId,
        username: userName,
        has_beta_access: true, // Permanently unlocks the gate
        encrypted_vault: encryptedVault,
        shard_balance: startingShards, 
        season_shards: 0,              
        lifetime_taps: 0,              
        referred_by: referrerId ? String(referrerId) : null,
      };

      if (!existingPlayer) {
        // If brand new, INSERT them
        const { error: insertError } = await supabase
          .from('players')
          .insert([{ ...playerData, created_at: new Date().toISOString() }]);
          
        if (insertError) throw insertError;
      } else {
        // If they already exist, just UPDATE their row
        const { error: updateError } = await supabase
          .from('players')
          .update(playerData)
          .eq(DB_PLAYER_ID, userId);
          
        if (updateError) throw updateError;
      }

        // --- 5. THE SECURE REFERRER PAYOUT ---
        if (referrerId && referrerId !== userId) {
          try {
            const { data: referrerData } = await supabase
              .from('players')
              .select('shard_balance')
              .eq(DB_PLAYER_ID, String(referrerId))
              .maybeSingle();

            if (referrerData) {
              const newBalance = (Number(referrerData.shard_balance) || 0) + REFERRER_BONUS;

              await supabase
                .from('players')
                .update({ 
                  shard_balance: newBalance 
                  // 🚨 NOTICE: We do NOT update season_shards or lifetime_taps here.
                  // This keeps the leaderboards "Pure Effort Only".
                })
                .eq(DB_PLAYER_ID, String(referrerId));
                
              console.log(`✅ Paid ${REFERRER_BONUS} Shards to referrer: ${referrerId}`);
            }
          } catch (rewardError) {
            console.error("Critical error paying referrer:", rewardError);
          }
        }
        
        // --- 6. UNLOCK THE GAME UI ---
        setPlayerWallet(newWallet.publicKey);
        setBalance(startingShards);
        setEnergy(500);
        setHasAccess(true);
        setIsDataLoaded(true);
      }
    } catch (err) {
      console.error("Init Error:", err);
      alert("Error during initialization. Please reload.");
    } finally {
      setIsLoading(false);
    }
  };


  /** Restore a Telegram / other-device account via 12-word phrase → wallet_address lookup. */
  const restoreAccountFromMnemonic = async (mnemonic) => {
    const cleaned = (mnemonic || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!cleaned || cleaned.split(" ").length < 12) {
      alert("Enter your full 12-word secret phrase.");
      return false;
    }
    setIsLoading(true);
    try {
      let keypair;
      try {
        keypair = keypairFromMnemonic(cleaned);
      } catch {
        alert("Invalid secret phrase. Check the words and try again.");
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
        alert("No Gift Tap account found for this phrase. You can create a new account instead.");
        return false;
      }

      // Bind this browser to the existing player key (legacy telegram_id column)
      setPlayerId(String(row[DB_PLAYER_ID]));
      if (row.username) setUsername(row.username);
      setPlayer(getPlayerProfile());

      const invisibleKey = vaultSaltFor(String(row[DB_PLAYER_ID]));
      const encryptedVault = encryptWallet(cleaned, invisibleKey);
      await supabase
        .from("players")
        .update({ encrypted_vault: encryptedVault })
        .eq(DB_PLAYER_ID, String(row[DB_PLAYER_ID]));

      setDecryptedPhrase(cleaned);
      setPlayerWallet(publicKey);
      setHasAccess(!!row.has_beta_access);
      alert("Account restored! Loading your progress...");
      // syncPlayer will re-run via playerId change
      return true;
    } catch (err) {
      console.error("Restore failed:", err);
      alert(`Restore failed: ${err.message || err}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  };


  // 5. EFFECTS
  useEffect(() => { syncPlayer(); }, [syncPlayer]);

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

  useEffect(() => {
    const ticker = setInterval(() => {
      setEnergy((prev) => (prev < 500 ? prev + 1 : 500 ));
    }, 2000);
    return () => clearInterval(ticker);
  }, [stats.energy_boost_expires]);

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
        if (data && data.streak !== undefined) {
          setStreak(data.streak);
        }

      } catch (err) {
        // WE ARE NOW USING THE 'err' VARIABLE! This stops Vercel from crashing.
        console.error("Streak Verify Error:", err.message);
      }
    }

    // IMPORTANT: We are now actually CALLING the function using your player variable!
    // This stops the Vercel "unused function" crash.
    verifyPlayerStreak(playerId); 

  }, [playerId]);

  // 6. SAVE PROGRESS
  const saveToDatabase = (b, e, dt, ltd, strk, ltt, mul, s) => {
    
    // 1. Don't save if we don't have a valid user ID
    if (!playerId) return;

    clearTimeout(window.saveTimeout);

    window.saveTimeout = setTimeout(async () => {
      const { data, error } = await supabase.from('players').update({
        [DB_PLAYER_ID]: playerId,
        username: player.username || player.first_name || 'Player',
        shard_balance: b,
        season_shards: s,
        last_energy: e,
        daily_taps: dt, // Make sure these columns exist in Supabase!
        last_tap_date: ltd,
        current_streak: strk, // <--- Now it saves the streak!
        lifetime_taps: ltt,
        max_unlocked_level: mul,
        max_daily_limit: maxDailyLimit, // This is your 2000 (Base + Ads)
        limit_boost_amount: stats.limit_boost_amount,
        limit_boost_expires: stats.limit_boost_expires,
        last_updated: new Date().toISOString()
      })
      .eq(DB_PLAYER_ID, playerId) // Match their specific row
      .select(); // Added .select() so Supabase actually returns the 'data' for your check

      // 🚨 OPTION A: THE FRONTEND CATCH
      if (error) {
        if (error.message && error.message.includes('PAYWALL_LOCKED')) {
          // The Server Bouncer blocked it. Instantly open the paywall!
          setShowAscensionModal(true); 
        } else {
          console.error("🚨 SUPABASE REJECTION:", error);
          alert(`Save Failed: ${error.message} \nCode: ${error.code}`); 
        }
      } else if (!data || data.length === 0) {
        alert(`Save Failed: No matching player found for ${playerId}`);
      } else {
        console.log("✅ SAVE SUCCESS:");
      }
    }, 800); // Slightly faster save
  };

  const handleTap = (e) => {
      // 🚨 DOUBLE LOCK: Stop execution if React hasn't finished fetching Supabase data
      if (!isDataLoaded) return;
      // 🚨 THE DEFINITIVE GHOST CLICK ASSASSIN
      if (e.type === 'touchstart') {
        touchLock.current = true;
        setTimeout(() => { touchLock.current = false; }, 500);
      } else if ((e.type === 'mousedown' || e.type === 'click') && touchLock.current) {
        return; 
      }

      // 🚨 FIX: Define 'now' immediately so buffs don't crash the function
      const now = new Date(); 
      
      // SCAN FOR MULTIPLE FINGERS
      let tapPoints = [];
      if (e.type === 'touchstart') {
        for (let i = 0; i < e.changedTouches.length; i++) {
          tapPoints.push({ x: e.changedTouches[i].clientX, y: e.changedTouches[i].clientY });
        }
      } else {
        tapPoints.push({ x: e.clientX, y: e.clientY });
      }

      const today = now.toISOString().split('T')[0];
    
      // ... [Your daily streak and limit logic stays exactly the same here] ...
      let currentDailyTaps = dailyTaps;
      let currentStreak = Math.max(1, streak);

      if (lastTapDate !== today) {
        const yesterdayObj = new Date();
        yesterdayObj.setDate(yesterdayObj.getDate() - 1);
        const yesterday = yesterdayObj.toISOString().split('T')[0];

        if (lastTapDate === yesterday) currentStreak += 1;
        else if (lastTapDate < yesterday) currentStreak = 1;

        currentDailyTaps = 0;
        setDailyTaps(0);
        setLastTapDate(today);
        setStreak(currentStreak);
        saveToDatabase(balance, energy, 0, today, currentStreak, lifetimeTaps, maxUnlockedLevel, seasonShards);
      }
      // 1. CALCULATE THE TRUE LIMIT (Surgical Fix)
      let currentMaxLimit = Number(maxDailyLimit) || 1000;
      const clickTime = new Date();

      // Add the Ad Boost (+1000)
      if (stats.energy_boost_expires && clickTime < new Date(stats.energy_boost_expires)) {
        currentMaxLimit += 1000;
      }
      // Add the Premium Boost (+2000)
      if (stats.limit_boost_expires && clickTime < new Date(stats.limit_boost_expires)) {
        currentMaxLimit += (Number(stats.limit_boost_amount) || 0);
      }

      // 2. THE CHECK (Using your live 'dailyTaps' state)
      if (dailyTaps >= currentMaxLimit) {
        alert("Daily limit reached! Wait for tomorrow or use a boost.");
        return;
      }

      if (energy <= 0 || !isDataLoaded) return;

      // 🚨 FIX: Use the synchronous Ref to prevent rapid-click bypasses
      const safeLifetimeTaps = Number(optimisticTaps.current) || 0;

      // --- ASCENSION WALL CHECK ---
      if (currentLevel >= maxUnlockedLevel && calculateLevel(safeLifetimeTaps + 1) > maxUnlockedLevel) {
        setShowAscensionModal(true);
        return; 
      }

      const baseRate = getLevelMultiplier(currentLevel); 
      let payoutMultiplier = 1;
      let costMultiplier = 1;

      // 2. Apply active buffs (This will no longer crash!)
      if (stats.frenzy_expires && now < new Date(stats.frenzy_expires)) payoutMultiplier *= 2; 
      if (stats.efficiency_expires && now < new Date(stats.efficiency_expires)) {
        payoutMultiplier *= 2;
        costMultiplier *= 2; 
      }
      if (stats.premium_multiplier_expires && now < new Date(stats.premium_multiplier_expires)) {
        payoutMultiplier *= (stats.premium_multiplier || 1); 
      }

      // 3. CALCULATE VALID FINGERS
      const availableByEnergy = Math.floor(energy / costMultiplier);
      const availableByDailyLimit = Math.floor((currentMaxLimit - currentDailyTaps) / costMultiplier);
      const validTaps = Math.min(tapPoints.length, availableByEnergy, availableByDailyLimit);

      if (validTaps <= 0) return; 

      // 4. MULTIPLY BY FINGER COUNT & ASCENSION CLAMP
      const targetTaps = getNextLevelTarget(currentLevel);
      const isAtLevelCap = currentLevel >= maxUnlockedLevel;

      const rawShardsEarned = (baseRate * payoutMultiplier) * validTaps;
      let shardsEarned = Math.round(rawShardsEarned * 1000) / 1000;
      const perTapAmount = Math.round((baseRate * payoutMultiplier) * 1000) / 1000; 
      
      // --- THE CLAMP ---
      if (isAtLevelCap && (safeLifetimeTaps + shardsEarned) >= targetTaps) {
        shardsEarned = Math.max(0, targetTaps - safeLifetimeTaps);
        
        if ((safeLifetimeTaps + shardsEarned) === targetTaps) {
          setShowAscensionModal(true);
        }
        
        if (shardsEarned <= 0) return; 
      }

      // 🚨 FIX: Update the optimistic ref INSTANTLY so the next rapid tap is blocked
      optimisticTaps.current += shardsEarned;

      const nextBalance = Math.round((balance + shardsEarned) * 1000) / 1000;
      const nextLifetimeTaps = Math.round((safeLifetimeTaps + shardsEarned) * 1000) / 1000;
      // ADD THIS LINE: Calculate the new season total
      const nextSeasonShards = Math.round((seasonShards + shardsEarned) * 1000) / 1000;

      const totalCost = costMultiplier * validTaps;
      let nextEnergy = energy - totalCost;
      const nextDaily = currentDailyTaps + totalCost;

      // --- FREE ENERGY RESET ON BASE LEVEL UP ---
      if (!isAtLevelCap) {
        const newCalculatedLevel = calculateLevel(nextLifetimeTaps);
        if (newCalculatedLevel > currentLevel && newCalculatedLevel <= maxUnlockedLevel) {
          nextEnergy = currentMaxLimit; 
          setCurrentLevel(newCalculatedLevel);
        }
      }

      setIsPressed(true);
      setTimeout(() => setIsPressed(false), 100);

      // --- RAPID TAP UI FIX ---
      setBalance(prev => Math.round((Number(prev) + shardsEarned) * 1000) / 1000);
      setLifetimeTaps(prev => Math.round((Number(prev) + shardsEarned) * 1000) / 1000);
      setSeasonShards(prev => Math.round((Number(prev) + shardsEarned) * 1000) / 1000); 
      setEnergy(prev => Math.max(0, prev - totalCost));
      setDailyTaps(prev => prev + totalCost);

      // Send the trigger to save (No absolute totals passed anymore)
      // Make sure this exact line is at the bottom of handleTap:
      saveToDatabase(nextBalance, nextEnergy, nextDaily, today, currentStreak, nextLifetimeTaps, maxUnlockedLevel, nextSeasonShards); 
      
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

  const handleAscensionPayment = async (method) => {
    const wallData = ASCENSION_WALLS[maxUnlockedLevel];
    if (!wallData) return;

    if (method === 'shards') {
      if (balance < wallData.shardCost) {
        alert("Not enough Shards!");
        return;
      }
      
      const newBalance = balance - wallData.shardCost;
      const newCap = wallData.newCap;
      const newLevel = wallData.targetLevel;
      
      setBalance(newBalance);
      setMaxUnlockedLevel(newCap);
      setCurrentLevel(newLevel);
      setEnergy(maxDailyLimit); 
      setShowAscensionModal(false);
      
      await saveToDatabase(newBalance, maxDailyLimit, dailyTaps, lastTapDate, streak, lifetimeTaps, newCap);
      alert(`Ascended to Level ${newLevel}! Tap Power Increased.`);
      
    } else if (method === 'sol') {
      try {
        // --- 1. ZERO-DELAY INSTANT DECRYPTION ---
        let storedSecret = decryptedPhrase || generatedSecret;
        
        // Failsafe: If React memory is lagging, fetch and unlock straight from the Supabase vault
        if (!storedSecret) {
          const { data, error } = await supabase
            .from('players')
            .select('encrypted_vault')
            .eq(DB_PLAYER_ID, playerId)
            .single();

          if (data && data.encrypted_vault) {
            const invisibleKey = vaultSaltFor(playerId);
            storedSecret = decryptWallet(data.encrypted_vault, invisibleKey);
          }
        }

        if (!storedSecret) {
          throw new Error("Wallet connection lost. Please completely refresh the game to resync your session.");
        }

        // Temporary alert so the player knows the transaction is processing
        alert(`Initiating SOL transaction for Level ${wallData.targetLevel}... Please wait.`);

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

        // --- 7. If the payment clears, unlock the tier and save to database ---
        const newCap = wallData.newCap;
        const newLevel = wallData.targetLevel;
        
        setMaxUnlockedLevel(newCap);
        setCurrentLevel(newLevel);
        setEnergy(maxDailyLimit); 
        setShowAscensionModal(false);
        
        // Pass the current 'balance' because we didn't burn any shards
        await saveToDatabase(balance, maxDailyLimit, dailyTaps, lastTapDate, streak, lifetimeTaps, newCap);
        alert(`Payment successful! Ascended to Level ${newLevel}! Tap Power Increased.`);

      } catch (err) {
        console.error("SOL Payment Error:", err);
        alert(`Transaction Failed: ${err.message || "An error occurred during the SOL payment."}`);
      }
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
            
            // 🚨 THE SMART GUARD 🚨
            // We check the incoming taps against the live React state
            setLifetimeTaps((prevTaps) => {
              const incomingTaps = Number(payload.new.lifetime_taps);

              // If the database has MORE taps, you played on another device.
              // We allow the sync to overwrite the screen.
              if (incomingTaps > prevTaps) {
                setBalance(Number(payload.new.shard_balance));
                setEnergy(Number(payload.new.last_energy));
                setTapPower(payload.new.tap_power);
                setMaxDailyLimit(payload.new.max_daily_limit);
                setSeasonShards(Number(payload.new.season_shards));
                // 🚨 THE FIX: Tell the secondary device to update its Daily Limit Bar!
                setDailyTaps(Number(payload.new.daily_taps));
                setStats({
                  inventory: payload.new.inventory || {},
                  frenzy_expires: payload.new.frenzy_expires,
                  efficiency_expires: payload.new.efficiency_expires,
                  energy_boost_expires: payload.new.energy_boost_expires
                });
                return incomingTaps; // Update local taps to match DB
              }

              // If incoming taps are the same (like when the Wallet saves),
              // we IGNORE the game stats so your recovering energy isn't reset.
              return prevTaps; 
            });
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
        GFT: 0,
        GFTshards: balance, // Pulls from your 'balance' state
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
          last_updated: new Date().toISOString(),
          // 🚨 Notice: We REMOVE energy/balance/boost from here. 
          // This tells Supabase: "Don't touch the game progress, only the money."
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
      alert("Balance is too low to cover the 0.001 SOL transaction fee.");
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
        'GFT': 'Paste_Your_GFT_Token_Account_Here',
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
  const now = new Date();
  let dynamicMaxLimit = maxDailyLimit; // Default is 1000

  // Add 1000 if 24hr Expanded Battery is active
  if (stats.energy_boost_expires && now < new Date(stats.energy_boost_expires)) {
    dynamicMaxLimit += 1000;
  }
  // Add 2000 or 5000 if a Premium SOL Contract is active
  if (stats.limit_boost_expires && now < new Date(stats.limit_boost_expires)) {
    dynamicMaxLimit += (stats.limit_boost_amount || 0);
  }

  const handleCopyPhrase = async () => {
    // Pure state-only retrieval. Zero browser storage.
    const phraseToCopy = decryptedPhrase || generatedSecret;
    
    if (!phraseToCopy) {
      alert("Error: No secret phrase found to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(phraseToCopy);
      alert("✅ 12-Word Phrase Copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy text: ", err);
      alert("❌ Clipboard access denied. Please write it down manually.");
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
          .select('season_name, is_season_active, season_start_time, season_end_time')
          .eq('id', 1)
          .single();

        if (error) throw error;

        if (data) {
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

  if (isLoading) return <div style={styles.container}>Loading Gift...</div>;

  return (
    <div style={{ backgroundColor: '#000', minHeight: '100vh', width: '100%' }}>
      
      {!hasAccess ? (
        /* 1. Show ONLY the BetaGate if they aren't authorized */
        <BetaGate 
          playerId={playerId} 
          onAccessGranted={(code) => initializeNewPlayer(code)}
          onRestoreAccount={restoreAccountFromMnemonic}
        />
      ) : (
        /* 2. Show the ACTUAL GAME if they have access */
        <div style={{ ...styles.container, flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
          
          {/* ASCENSION WALL MODAL */}
          {showAscensionModal && ASCENSION_WALLS[maxUnlockedLevel] && (
            <div style={{ position: 'relative', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.9)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              {/* Drop this inside your Ascension Modal's main content <div> */}
              <button 
                onClick={() => setShowAscensionModal(false)}
                style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', color: '#888', border: 'none', fontSize: '20px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                ✕
              </button>
              <div style={{ background: '#1c1e22', border: '1px solid #ffd700', borderRadius: '20px', padding: '30px', textAlign: 'center', maxWidth: '300px' }}>
                <h2 style={{ color: '#ffd700', marginTop: 0 }}>Tier Complete! 🏆</h2>
                <p style={{ color: '#ddd', fontSize: '14px' }}>
                  You've hit the Level {maxUnlockedLevel} wall. To ascend to Level {ASCENSION_WALLS[maxUnlockedLevel].targetLevel} and permanently increase your tap power to <strong>{getLevelMultiplier(ASCENSION_WALLS[maxUnlockedLevel].targetLevel)}x</strong>, you must pay the Ascension Fee.
                </p>
                
                <button 
                  onClick={() => handleAscensionPayment('shards')}
                  style={{ width: '100%', background: '#2a2d34', color: '#fff', border: '1px solid #4ade80', padding: '15px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', marginBottom: '10px' }}
                >
                  Burn {ASCENSION_WALLS[maxUnlockedLevel].shardCost.toLocaleString()} Shards
                </button>
                
                <button 
                  onClick={() => handleAscensionPayment('sol')}
                  style={{ width: '100%', background: 'linear-gradient(90deg, #9945FF, #14F195)', color: '#000', border: 'none', padding: '15px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Pay {ASCENSION_WALLS[maxUnlockedLevel].solCost} SOL
                </button>
              </div>
            </div>
          )}

          {/* TOP HEADER */}
          <div style={styles.headerContainer}>
            
            {/* LEFT SIDE: Menu & Toggles Grouped Together */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              
              {/* Menu Trigger Button (Separated into a clean circle) */}
              <button 
                onClick={() => setIsMenuOpen(true)}
                style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.05)', color: '#fff', fontSize: '18px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent' }}
              >
                ☰
              </button>

              {/* Sleek Toggle Pill */}
              <div style={styles.toggleWrapper}>
                <button 
                  style={{ ...(leaderboardType === 'all_time' ? styles.activeToggleBtn : styles.toggleBtn), outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                  onClick={() => { setLeaderboardType('all_time'); fetchFullLeaderboard('all_time'); }}
                >
                  <span>🏆 All-Time</span>
                  {/* Auto-formats large numbers (e.g., 5000 becomes 5k) so it fits beautifully */}
                  <span style={styles.leaderBadgePremium}>
                    {topLeader.name}: {topLeader.score > 999 ? (topLeader.score / 1000).toFixed(1) + 'k' : topLeader.score}
                  </span>
                </button>
                <button 
                  style={{ ...(leaderboardType === 'Season' ? styles.activeToggleBtn : styles.toggleBtn), outline: 'none', WebkitTapHighlightColor: 'transparent' }} 
                  onClick={() => { setLeaderboardType('Season'); fetchFullLeaderboard('Season'); }}
                >
                  {/* 🚨 THE FIX: Use the dynamic name from Supabase */}
                  <span>{seasonData.name || "Loading..."}</span>

                  {/* Make sure this variable matches whatever you named the ticking clock state from our last step (e.g., seasonDisplayMsg) */}
                  <span style={{...styles.leaderBadgePremium, color: '#4ade80', fontWeight: 'bold'}}>
                    {seasonDisplayMsg}
                  </span>
                </button>
              </div>
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
              >
                <div style={styles.walletDot}></div>
                {playerWallet?.slice(0, 4)}...{playerWallet?.slice(-4)}
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
                        <span style={{ color: '#ffd700', background: '#333', padding: '4px 8px', borderRadius: '8px', border: '1px solid #555', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                          Lvl {currentLevel}
                        </span>
                        <span style={{ color: '#888', fontSize: '10px', whiteSpace: 'nowrap', fontWeight: 'bold' }}>
                          {currentLevel < 50 ? `${Math.floor(lifetimeTaps).toLocaleString()} / ${getNextLevelTarget(currentLevel).toLocaleString()}` : 'MAX'}
                        </span>
                      </div>
                      
                      {/* Progress Bar takes up the remaining horizontal space */}
                      {currentLevel < 50 && (
                        <div style={{ flex: 1, background: 'rgba(0, 0, 0, 0.6)', borderRadius: '10px', height: '6px', overflow: 'hidden', border: '1px solid #333' }}>
                          <div style={{ height: '100%', background: '#4ade80', width: `${Math.min((lifetimeTaps / getNextLevelTarget(currentLevel)) * 100, 100)}%` }} />
                        </div>
                      )}

                    </div>

                    {/* THE MAIN EVENT: Balance */}
                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: '8px' }}>
                      <h1 style={{ ...styles.balance, margin: '0', fontSize: '3.2rem', fontVariantNumeric: 'tabular-nums', textShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
                        {balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </h1>
                      <span style={{ color: '#ffd700', fontSize: '16px', fontWeight: 'bold' }}>GFTshards</span>
                    </div>

                  </div>
                </div>

                {/* 2. MIDDLE ZONE: CENTERED GIFT */}
                <div style={styles.giftZone}>
                  {/* Pro Touch: A subtle blue Hamster-style halo behind the gift */}
                  <div style={{ position: 'absolute', width: '250px', height: '250px', background: 'radial-gradient(circle, rgba(50, 100, 255, 0.3) 0%, transparent 70%)', zIndex: 0, borderRadius: '50%', marginTop: '-60px' }} />
                  
                  <motion.div
                    whileTap={isDataLoaded ? { scale: 0.94 } : {}} 
                    onPointerDown={isDataLoaded ? handleTap : undefined}
                    style={{ zIndex: 5, position: 'relative', marginTop: '-60px', // 3. Optional: Dim the button and physically disable clicks while loading
                      opacity: isDataLoaded ? 1 : 0.6,
                      pointerEvents: isDataLoaded ? 'auto' : 'none' }}
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
                        style={{ ...styles.floatingText, left: t.x, top: t.y, position: 'fixed' }}
                      >
                        +{t.amount}
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </div>

                {/* 3. BOTTOM ZONE: ENERGY & AD BUTTON */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%', padding: '0 20px 110px 20px', boxSizing: 'border-box', zIndex: 10, position: 'relative' }}>
                   
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '45%', maxWidth: '160px' }}>
                     <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                       <p style={{ ...styles.energy, margin: '0', fontSize: '12px', whiteSpace: 'nowrap' }}>⚡ {energy} / 500</p>
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
                     <p style={{ color: '#888', fontSize: '10px', margin: '0', fontWeight: 'bold' }}>Daily Limit: {dailyTaps}/{dynamicMaxLimit}</p>
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
                setBalance={setBalance}
                setEnergy={setEnergy} 
                stats={stats}
                setStats={setStats}
                player={player}
                playerWallet={playerWallet}
                decryptedPhrase={decryptedPhrase}
              />
            )}

            {currentPage === 'tasks' && (
              <Tasks 
                balance={balance} 
                setBalance={setBalance} 
                player={player} 
              />
            )}

            {/* Friends / Referral Tab */}
            {currentPage === 'friends' && (
              <Friends player={player} />
            )}

            {/* 3. Navigation Bar (Always at bottom) */}
            <div style={styles.nav}>
              <button style={currentPage === 'home' ? styles.activeBtn : styles.btn} onClick={() => setCurrentPage('home')}>Home</button>
              <button style={currentPage === 'tasks' ? styles.activeBtn : styles.btn} onClick={() => setCurrentPage('tasks')}>Tasks</button>
              <button style={currentPage === 'friends' ? styles.activeBtn : styles.btn} onClick={() => setCurrentPage('friends')}>Friends</button>
              <button style={currentPage === 'shop' ? styles.activeBtn : styles.btn} onClick={() => setCurrentPage('shop')}>Shop</button>
            </div>
          </div>

          {/* Leaderboard Modal */}
          {isLeaderboardOpen && (
            <div style={styles.modalOverlay} onClick={() => setIsLeaderboardOpen(false)}>
              <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                <h3>🏆 Top Players</h3>
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {leaderboard.map((player, index) => (
                    <div key={index} style={styles.balanceRow}>
                      <span>{index + 1}. {player.username || 'Anon'}</span>
                      <span style={{color: '#528db0'}}>{(player.score || player.lifetime_taps || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => setIsLeaderboardOpen(false)} style={styles.closeBtn}>Close</button>
              </div>
            </div>
          )}

          {/* Wallet Modal */}
          {isModalOpen && (
            <div style={styles.modalOverlay} onClick={() => { 
              if (!mustBackup) { setIsModalOpen(false); setShowSettings(false); setIsRevealed(false); }
            }}>
              <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                
                {/* --- ONE-TIME MANDATORY BACKUP NOTICE --- */}
                {mustBackup ? (
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
                        localStorage.setItem(`wallet_backed_up_${playerId}`, "true"); // Flags that they saw it
                      }}
                      style={{ width: '100%', background: '#fbef43', color: '#000', padding: '12px', borderRadius: '8px', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
                    >
                      I HAVE SAVED MY PHRASE
                    </button>
                  </div>
                ) : (
                  // --- NORMAL WALLET DASHBOARD (After Backup) ---
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                      <h3 style={{ margin: 0, color: '#ffd700' }}>{showSettings ? 'Wallet Settings' : 'Wallet Dashboard'}</h3>
                      <div>
                        {!showSettings && (
                          <button onClick={() => setShowSettings(true)} style={{ background: 'none', border: 'none', color: '#888', fontSize: '18px', marginRight: '15px', cursor: 'pointer' }}>⚙️</button>
                        )}
                        <button onClick={() => { setIsModalOpen(false); setShowSettings(false); setIsRevealed(false); }} style={{ background: 'none', border: 'none', color: '#888', fontSize: '18px', cursor: 'pointer' }}>✕</button>
                      </div>
                    </div>

                    {showSettings ? (
                      <div style={{ textAlign: 'left' }}>
                        <p style={{ color: '#aaa', fontSize: '12px', marginBottom: '15px' }}>Your wallet is stored only on this device until you back up the 12-word phrase. Gift Tap never keeps your seed.</p>
                        
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
                          /* --- THE UNLOCKED 12-WORD GRID --- */
                          <div style={{ background: '#000', padding: '15px', borderRadius: '10px', border: '1px solid #ffd700', marginTop: '15px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <label style={{ color: '#ffd700', fontSize: '11px', fontWeight: 'bold' }}>YOUR 12 SECRET WORDS:</label>
                              <button 
                                onClick={() => setIsRevealed(false)} 
                                style={{ background: 'none', border: 'none', color: '#888', fontSize: '12px', cursor: 'pointer' }}
                              >
                                Lock 🔒
                              </button>
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
                        <p style={{ fontSize: '12px', color: '#888', marginBottom: '15px' }}>Wallet Balance.</p>
                        <div style={{ marginTop: '10px' }}>
                          {Object.entries(balances).map(([key, value]) => (
                            <div key={key} style={styles.balanceRow}>
                              <span style={{ textTransform: 'uppercase', color: '#888', fontSize: '12px' }}>{key}:</span>
                              <span style={{ fontWeight: 'bold' }}>{key === 'GFTshards' ? value.toLocaleString() : value.toFixed(4)}</span>
                            </div>
                          ))}
                        </div>
                        <div style={styles.actionRow}>
                          <button style={styles.actionBtn} onClick={() => setIsReceiveOpen(true)}>Receive</button>
                          <button style={styles.actionBtn} onClick={() => setIsWithdrawOpen(true)}>Send</button>
                          <button style={styles.actionBtn} onClick={() => setIsSwapOpen(true)}>Swap</button>
                          <button style={styles.actionBtn} onClick={() => setIsShardSwapOpen(true)}>Shard</button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

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
                        alert("Address copied!");
                      }}
                    >
                      ❐ {/* The "two squares" copy icon */}
                    </button>
                  </div>
                </div>

                <p style={{ fontSize: '10px', color: '#666', marginTop: '15px' }}>
                  Only send Solana (SOL) or SPL tokens (like GFT) to this address.
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>Balance: {getSwapBalance(swapFromToken)}</span>
                      {/* THE NEW MAX BUTTON */}
                      <button 
                        onClick={() => {
                          const currentBal = parseFloat(getSwapBalance(swapFromToken)) || 0;
                          // Secure logic: Leave 0.005 SOL buffer for gas fees so transaction doesn't fail
                          const maxAmount = swapFromToken === 'SOL' 
                            ? Math.max(0, currentBal - 0.005) 
                            : currentBal;
                          
                          setSwapFromAmount(maxAmount > 0 ? maxAmount.toString() : '');
                        }}
                        style={{ background: 'rgba(255, 215, 0, 0.15)', color: '#ffd700', border: '1px solid rgba(255, 215, 0, 0.3)', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                      >
                        MAX
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                    <input 
                      type="number" 
                      placeholder="0.00"
                      value={swapFromAmount}
                      onChange={(e) => setSwapFromAmount(e.target.value)}
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
                      <option value="GFT">GFT</option>
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
                      <option value="GFT">GFT</option>
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

          {/* Shard Swap Pop-up (One-way conversion) */}
          {isShardSwapOpen && (
            <div style={styles.modalOverlay} onClick={() => setIsShardSwapOpen(false)}>
              <div style={{ ...styles.modalContent, background: '#131517', border: 'none', width: '90%', maxWidth: '360px' }} onClick={e => e.stopPropagation()}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ color: '#fff', margin: 0 }}>Shard Swap</h3>
                  <button onClick={() => { setIsShardSwapOpen(false); setIsModalOpen(true); }} style={{ background: 'none', border: 'none', color: '#888', fontSize: '20px', cursor: 'pointer', padding: 0 }}>✕</button>
                </div>

                {/* You Pay Section (Hardcoded to Shards) */}
                <div style={{ background: '#1c1e22', borderRadius: '16px', padding: '15px', textAlign: 'left', marginBottom: '5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '12px' }}>
                    <span>You pay</span>
                    {/* Using 'balance' because it holds your off-chain game score */}
                    <span>Balance: {balance?.toLocaleString() || '0'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                    <input 
                      type="number" 
                      placeholder="0"
                      value={shardSwapAmount}
                      onChange={(e) => setShardSwapAmount(e.target.value)}
                      style={{ background: 'none', border: 'none', color: '#fff', fontSize: '24px', width: '60%', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', fontWeight: 'bold' }}>
                      <span>GFTshards</span>
                    </div>
                  </div>
                </div>

                {/* Down Arrow (Not clickable, one-way flow) */}
                <div style={{ height: '30px', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2, position: 'relative', margin: '-15px 0' }}>
                  <div style={{ background: '#131517', border: '2px solid #333', borderRadius: '50%', padding: '0', color: '#fbef43', width: '34px', height: '34px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    ↓
                  </div>
                </div>

                {/* You Receive Section (Hardcoded to real GFT) */}
                <div style={{ background: '#1c1e22', borderRadius: '16px', padding: '15px', textAlign: 'left', marginTop: '5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '12px' }}>
                    <span>You receive</span>
                    {/* Reusing the helper function so it doesn't say [object Object] */}
                    <span>Balance: {getSwapBalance('GFT')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                    <input 
                      type="number" 
                      placeholder="0.00"
                      value={shardSwapAmount ? (shardSwapAmount / 1000) : ''} /* Adjust 1000 to your actual conversion rate later */
                      readOnly
                      style={{ background: 'none', border: 'none', color: '#fff', fontSize: '24px', width: '60%', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', fontWeight: 'bold' }}>
                      <span>GFT</span>
                    </div>
                  </div>
                </div>

                <p style={{ fontSize: '12px', color: '#888', marginTop: '20px', textAlign: 'center' }}>
                  Official conversion rate to be announced.
                </p>

                {/* Locked Action Button */}
                <button 
                  disabled={true}
                  style={{ 
                    width: '100%', 
                    background: '#333', 
                    color: '#888', 
                    border: 'none', 
                    padding: '16px', 
                    borderRadius: '30px', 
                    fontWeight: 'bold', 
                    fontSize: '16px',
                    marginTop: '20px',
                    cursor: 'not-allowed'
                  }}
                >
                  Unlocks at Token Launch
                </button>
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
                    alert("Key Copied!");
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

          {/* --- REFACTORED MENU COMPONENT --- */}
          <Menu 
            isMenuOpen={isMenuOpen} 
            setIsMenuOpen={setIsMenuOpen}
            appLanguage={appLanguage}
            setAppLanguage={setAppLanguage}
            displayCurrency={displayCurrency}
            setDisplayCurrency={setDisplayCurrency}
            t={t}
            ALL_CURRENCIES={ALL_CURRENCIES} // <--- Add this new line
            onOpenWhitepaper={() => setIsWhitepaperOpen(true)}
            onOpenSecret={() => { setMustBackup(true); setIsModalOpen(true); }}
          />

          {/* --- REFACTORED WHITEPAPER COMPONENT --- */}
          <WhitepaperModal 
            isWhitepaperOpen={isWhitepaperOpen} 
            setIsWhitepaperOpen={setIsWhitepaperOpen} 
          />

          {/* THE AD MODAL - Refactored to match your native game architecture */}
          {isAdModalOpen && (
            <div style={styles.modalOverlay} onClick={() => setIsAdModalOpen(false)}>
              <div style={{ ...styles.modalContent, background: '#131517', border: '1px solid #333', textAlign: 'center', width: '90%', maxWidth: '360px' }} onClick={e => e.stopPropagation()}>
                
                <h2 style={{ color: '#ffd700', marginTop: 0, marginBottom: '15px', fontSize: '24px' }}>⚡ Expand Capacity</h2>
                
                <p style={{ color: '#ccc', fontSize: '14px', marginBottom: '20px', lineHeight: '1.5' }}>
                  Want to tap more? Watch a short ad to permanently expand your Daily Energy Limit by +100 for today!
                  <br /><br />
                  <span style={{ fontSize: '12px', color: '#888' }}>
                    (Max 10 ads per day. You have watched {dailyAdsWatched}/10)
                  </span>
                </p>
                
                <button 
                  onClick={handleWatchAd}
                  disabled={dailyAdsWatched >= 10}
                  style={{ 
                    width: '100%', 
                    background: dailyAdsWatched >= 10 ? '#333' : '#fbef43', 
                    color: dailyAdsWatched >= 10 ? '#888' : '#000', 
                    border: 'none', 
                    padding: '16px', 
                    borderRadius: '30px', 
                    fontWeight: 'bold', 
                    fontSize: '16px',
                    marginBottom: '10px',
                    cursor: dailyAdsWatched >= 10 ? 'not-allowed' : 'pointer',
                    opacity: dailyAdsWatched >= 10 ? 0.5 : 1
                  }}
                >
                  {dailyAdsWatched >= 10 ? "Daily Limit Reached" : "▶ Watch Ad"}
                </button>
                
                <button 
                  onClick={() => setIsAdModalOpen(false)}
                  style={{ 
                    width: '100%', 
                    background: 'transparent', 
                    border: '1px solid #555', 
                    color: '#888', 
                    padding: '14px', 
                    borderRadius: '30px', 
                    fontWeight: 'bold', 
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  Close
                </button>

              </div>
            </div>
          )}

        </div>
        
      )}
      
    </div>
  );
};

export default GiftTapGame;