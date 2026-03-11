import { useState, useEffect, useCallback, useMemo } from 'react';
import { Connection, PublicKey, clusterApiUrl, Keypair, Transaction, SystemProgram, ComputeBudgetProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { supabase } from './supabaseClient';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import BetaGate from './BetaGate';
import Marketplace from './Marketplace';
import Tasks from './Tasks';
import bs58 from "bs58";

// Drop these at the very top of GiftTap.jsx, right under your imports
export const calculateLevel = (taps) => {
  if (taps < 50000) return Math.floor(taps / 10000); 
  if (taps < 110000) return 5 + Math.floor((taps - 50000) / 12000); 
  if (taps < 335000) return 10 + Math.floor((taps - 110000) / 15000); 
  if (taps < 835000) return 25 + Math.floor((taps - 335000) / 20000); 
  return 50; 
};

export const getNextLevelTarget = (level) => {
  if (level < 5) return (level + 1) * 10000;
  if (level < 10) return 50000 + ((level - 4) * 12000);
  if (level < 25) return 110000 + ((level - 9) * 15000);
  if (level < 50) return 335000 + ((level - 24) * 20000);
  return null; 
};

export const getLevelMultiplier = (level) => {
  if (level <= 1) return 1;          
  if (level === 2) return 1.025;        
  return 1.025 + ((level - 2) * 0.025);  
};

const GiftTapGame = () => {

  const styles = {
    container: { position: 'fixed', top: 0, left: 0, height: '100%', width: '100%', background: '#1a1a1a', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden', touchAction: 'manipulation' },
    walletWrapper: { display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start', flexShrink: 0, background: '#222', color: '#fff' },
    header: { marginTop: '10px', textAlign: 'center' },
    balance: { fontSize: '2.5rem', color: '#ffd700', margin: 0 },
    energy: { color: '#ffd700', fontWeight: 'bold' },
    giftZone: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', position: 'relative' },
    giftImage: { width: '220px', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'manipulation' },
    floatingText: { position: 'fixed', color: '#ffd700', fontSize: '2rem', fontWeight: 'bold', pointerEvents: 'none', animation: 'floatUp 1s forwards', zIndex: 999 },
    nav: { height: '80px', position: 'fixed', bottom: 0, zIndex: 100, left: 0, width: '100%', display: 'flex', justifyContent: 'space-around', background: '#333', borderTop: '2px solid #ffd700', paddingBottom: 'env(safe-area-inset-bottom)' },
    btn: { background: 'none', border: 'none', color: 'white', fontWeight: 'bold' },
    modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    modalContent: { background: '#222', padding: '25px', borderRadius: '15px', width: '85%', maxWidth: '400px', border: '2px solid #ffd700', textAlign: 'center' },
    balanceRow: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #333' },
    actionRow: { display: 'flex', gap: '10px', marginTop: '20px' },
    actionBtn: { flex: 1, padding: '12px', borderRadius: '10px', background: '#ffd700', color: '#000', fontWeight: 'bold', border: 'none' },
    closeBtn: { marginTop: '20px', background: 'none', color: '#888', border: 'none', cursor: 'pointer' },
    walletBtn: { background: '#222', color: '#fff', border: '1px solid #ffd700', padding: '8px 12px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', minWidth: '100px', display: 'flex', flexDirection: 'column', alignItems: 'center', LineHeight: '1.1' },
    leaderBadge: { display: 'block', fontSize: '0.7rem', color: '#528db0', marginTop: '2px', fontWeight: 'normal', opacity: 0.9, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' },
    activeTab: { background: '#222', color: '#528db0', width: '110px', height: '50px', whiteSpace: 'nowrap', fontSize: '11px', padding: '5px', borderRadius: '12px', justifyContent: 'center', border: '1px solid #ffd700', fontWeight: 'bold', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '0' },
    tab: { background: '#222', width: '110px', height: '50px', color: '#fff', whiteSpace: 'nowrap', padding: '5px', borderRadius: '12px',justifyContent: 'center', fontSize: '11px', border: '1px solid #333', display: 'flex', alignItems: 'center', flexDirection: 'column' },
    shopItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0', borderBottom: '1px solid #333' },
    buyBtn: { background: '#ffd700', color: '#000', border: 'none', padding: '8px 12px', borderRadius: '10px', fontWeight: 'bold' },
    tabContainer: { display: 'flex', gap: '8px'},
    progressContainer: { width: '200px', height: '10px', background: '#333', borderRadius: '5px', margin: '10px auto', overflow: 'hidden', border: '1px solid #444' },
    progressBar: { height: '100%', transition: 'width 0.3s ease-in-out', boxShadow: '0 0 10px rgba(255, 215, 0, 0.3)' },
    mainContent: { flex: 1, width: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto', alignItems: 'center' },
    shopPage: { width: '100%', padding: '20px', boxSizing: 'border-box' },
    depositBox: { background: '#111', padding: '15px', borderRadius: '12px', marginTop: '15px', border: '1px solid #333' },
    addressRow: { display: 'flex', justifyContent: 'space-between',  alignItems: 'center', marginTop: '8px', background: '#000', padding: '10px', borderRadius: '8px' },
    copyBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#ffd700' },
    toast: { position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)', background: '#333', color: '#ffd700', padding: '12px 24px', borderRadius: '25px', border: '1px solid #ffd700', zIndex: 2000, boxShadow: '0 4px 15px rgba(0,0,0,0.5)', fontSize: '14px', fontWeight: 'bold', transition: 'all 0.3s ease' }
  };

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
  const [tapPower, setTapPower] = useState(1);
  const [currentPage, setCurrentPage] = useState('home'); // 'home', 'shop', 'tasks', 'friends'
  const [activeTab, setActiveTab] = useState('home'); // Use this for page switching
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isSwapOpen, setIsSwapOpen] = useState(false);
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

  const tgUser = useMemo(() => {
    return window.Telegram?.WebApp?.initDataUnsafe?.user || { id: "test_local_user", first_name: "Local" };
  }, []);

  const connection = useMemo(() => {
    const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL;
    return new Connection(rpcUrl || clusterApiUrl('mainnet-beta'), 'confirmed');
  }, []);

  const GIFT_TREASURY_WALLET = new PublicKey("8G7uEcPS6dwA5wW9bGoqi98EzBunF8trjbbFJkgkvBPm");

  // 2. FETCH TOP LEADER (Individual Badge)
  const fetchTopLeader = useCallback(async () => {
    try {
      const { data } = await supabase.from('leaderboard_all_time').select('*').limit(1).maybeSingle();
      if (data) {
        setTopLeader({
          name: data.username || (data.telegram_id ? `ID:..${String(data.telegram_id).slice(-4)}` : 'Anon'),
          score: data.shard_balance
        });
      }
    } catch (err) { console.error("Badge fetch error:", err); }
  }, []);

  // 3. FETCH FULL LEADERBOARD (Modal)
  const fetchFullLeaderboard = async (typeOverride) => {
    // Use the override if provided, otherwise fallback to state
    const targetType = typeOverride || leaderboardType; 
    const tableName = targetType === 'all_time' ? 'leaderboard_all_time' : 'leaderboard_season';
    
    const { data } = await supabase.from(tableName).select('*').limit(20);
    setLeaderboard(data || []);
    setIsLeaderboardOpen(true);
  };

  const syncPlayer = useCallback(async () => {
    setIsLoading(true);
    try {
      const userId = String(tgUser.id);
      
      // 1. Fetch player data
      const { data: player } = await supabase
        .from('players')
        .select('*')
        .eq('telegram_id', userId)
        .maybeSingle();

      // CASE A: Player exists AND already has a wallet address
      if (player && player.wallet_address) {
        setHasAccess(player.has_beta_access || false);
        setPlayerWallet(player.wallet_address);
        setBalances({ 
          sol: player.sol_balance || 0, 
          GFT: player.gft_token_balance || 0, 
          GFTshards: Number(player.shard_balance) || 0, 
          usdc: player.usdc_balance || 0 
        });
        setBalance(Number(player.shard_balance));
        setTapPower(player.tap_power || 1);
        setMaxDailyLimit(player.max_daily_limit || 1000);
        // Load Backpack and Timers
        setStats({
          inventory: player.inventory || {},
          frenzy_expires: player.frenzy_expires || null,
          efficiency_expires: player.efficiency_expires || null,
          energy_boost_expires: player.energy_boost_expires || null
        });

        // Daily Reset Logic
        const today = new Date().toISOString().split('T')[0];
        if (player.last_tap_date !== today) {
          setDailyTaps(0);
          setLastTapDate(today);
        } else {
          setDailyTaps(player.daily_taps || 0);
          setLastTapDate(player.last_tap_date);
          setStreak(player.current_streak || 0);
        }
          
        // Energy Recovery Logic
        const lastDate = new Date(player.last_updated).getTime();
        const now = new Date().getTime();
        const secondsPassed = Math.floor((now - lastDate) / 1000);
        const recovered = Math.floor(secondsPassed / 1.8); 
        // Apply Expanded Battery logic to max energy cap
        const maxEnergy = (player.energy_boost_expires && now < new Date(player.energy_boost_expires).getTime()) ? 1500 : 500;
        setEnergy(Math.min((player.last_energy || 0) + recovered, maxEnergy));
        
        setIsDataLoaded(true);
      } 
      // CASE B: New Player OR Player without a wallet
      else {
        console.log("No wallet found, generating...");
        
        // This is the FIXED fetch call (No more '...')
        const response = await fetch('https://ncwlbwzxfpcnxkyrmdck.supabase.co/functions/v1/create-user-wallet', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({ 
            telegram_id: userId,
            username: tgUser.username || tgUser.first_name || 'Player'
          })
        });

        const result = await response.json();

        if (result && result.publicKey) {
          if (result.secretKey) {
            localStorage.setItem(`wallet_secret_${userId}`, result.secretKey);
          }
          setPlayerWallet(result.publicKey);
          setIsDataLoaded(true);
        } else {
          setHasAccess(false);
        }
      }

      await fetchTopLeader();
    } catch (err) {
      console.error("Sync Error:", err.message);
    } finally {
      setIsLoading(false);
    }
  }, [tgUser, fetchTopLeader]);

  const initializeNewPlayer = async (inputCode) => {
    setIsLoading(true);
    try {
      // 1. Verify Code
      const { data: codeData, error: codeError } = await supabase
        .from('invite_codes')
        .select('*')
        .eq('code', inputCode)
        .maybeSingle();

      if (codeError || !codeData || codeData.is_used) {
        alert("❌ Invalid or already used code!");
        setIsLoading(false);
        return; 
      }

      const userId = String(tgUser.id);
      const userName = tgUser.username || tgUser.first_name || 'Player';

      // 2. LOCK CODE IMMEDIATELY
      await supabase
        .from('invite_codes')
        .update({ is_used: true, used_by: userId })
        .eq('code', inputCode);

      // 3. EXACT SAME FETCH AS SYNCPLAYER (This guarantees the Secret Phrase)
      const response = await fetch('https://ncwlbwzxfpcnxkyrmdck.supabase.co/functions/v1/create-user-wallet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ telegram_id: userId, username: userName })
      });

      const newWallet = await response.json();

      // ADD THIS ONE LINE:
      console.log("🚨 RAW EDGE RESPONSE:", newWallet);

      if (newWallet && newWallet.publicKey) {
        // 4. Save Secret Silently (No Popup yet, just storing it for the Wallet Modal)
        if (newWallet.secretKey) {
          localStorage.setItem(`wallet_secret_${userId}`, newWallet.secretKey);
          console.log("✅ Secret phrase successfully caught and saved!");
        } else {
          console.error("❌ Edge Function returned no Secret Key!", newWallet);
        }

        // 5. Update game state to enter the game
        setPlayerWallet(newWallet.publicKey);
        setBalance(0);
        setEnergy(500);
        setHasAccess(true);
        setIsDataLoaded(true);
      }
    } catch (err) {
      console.error("Init Error:", err);
      alert("Error during initialization.");
    } finally {
      setIsLoading(false);
    }
  };

  // 5. EFFECTS
  useEffect(() => { syncPlayer(); }, [syncPlayer]);

  useEffect(() => {
    const ticker = setInterval(() => {
      // Dynamic max energy based on timers
      const maxE = (stats.energy_boost_expires && new Date() < new Date(stats.energy_boost_expires)) ? 1500 : 500;
      setEnergy((prev) => (prev < maxE ? prev + 1 : maxE));
    }, 1500);
    return () => clearInterval(ticker);
  }, [stats.energy_boost_expires]);

  // Inside your main GiftTap component:
  useEffect(() => {
    async function verifyPlayerStreak(userId) {
      // Safety check: Don't run if it's the local test user or undefined
      if (!userId || userId === "test_local_user") return;

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

    // IMPORTANT: We are now actually CALLING the function using your tgUser variable!
    // This stops the Vercel "unused function" crash.
    verifyPlayerStreak(tgUser?.id); 

  }, [tgUser?.id]);

  // 6. SAVE PROGRESS
  const saveToDatabase = async (b, e, dt, ltd, strk) => {
    // 1. Don't save if we don't have a valid user ID
    if (!tgUser?.id || tgUser.id === "test_local_user") return;

    clearTimeout(window.saveTimeout);

    window.saveTimeout = setTimeout(async () => {
      const { error } = await supabase.from('players').update({
        telegram_id: String(tgUser.id),
        username: tgUser.username || tgUser.first_name,
        shard_balance: b,
        season_shards: b,
        last_energy: e,
        daily_taps: dt, // Make sure these columns exist in Supabase!
        last_tap_date: ltd,
        current_streak: strk, // <--- Now it saves the streak!
        last_updated: new Date().toISOString()
      })
      .eq('telegram_id', String(tgUser.id)); // Match their specific row

      if (error) {
      console.error("🔴 SUPABASE UPDATE FAILED:", error.message);
      } else {
         console.log("✅ SAVE SUCCESSFUL! Streaks and Dates updated.");
      }
    }, 800); // Slightly faster save
  };

  const handleTap = (e) => {
    const todayObj = new Date();
    const today = todayObj.toISOString().split('T')[0];
  
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
      saveToDatabase(balance, energy, 0, today, currentStreak);
    }

    if (currentDailyTaps >= maxDailyLimit) {
      alert("Daily limit reached! Upgrade your limit in the shop.");
      return;
    }

    if (energy <= 0 || !isDataLoaded) return;

    // --- NEW: THE MATH ENGINE ---
    const currentLevel = calculateLevel(balance); 
    const baseRate = getLevelMultiplier(currentLevel); 

    let payoutMultiplier = 1;
    let costMultiplier = 1;
    const now = new Date();

    // Check 90-Second Frenzy Timer
    if (stats.frenzy_expires && now < new Date(stats.frenzy_expires)) {
      payoutMultiplier *= 2; 
    }

    // Check Heavy Hands Timer
    if (stats.efficiency_expires && now < new Date(stats.efficiency_expires)) {
      payoutMultiplier *= 2;
      costMultiplier *= 2; // Drains energy twice as fast!
    }

    // Prevent going into negative energy or over daily limit on a multi-click
    if (energy - costMultiplier < 0 || currentDailyTaps + costMultiplier > maxDailyLimit) {
        return; // Wait for energy or limit reset
    }

    const shardsEarned = baseRate * payoutMultiplier;
    const nextBalance = balance + shardsEarned;
    const nextEnergy = energy - costMultiplier;
    const nextDaily = currentDailyTaps + costMultiplier;

    setIsPressed(true);
    setTimeout(() => setIsPressed(false), 100);

    setBalance(nextBalance);
    setEnergy(nextEnergy);
    setDailyTaps(nextDaily);
    saveToDatabase(nextBalance, nextEnergy, nextDaily, today, currentStreak);
    
    const id = Date.now();
    setTaps(t => [...t, { id, x: e.clientX, y: e.clientY, amount: shardsEarned }]);
    setTimeout(() => setTaps(t => t.filter(tap => tap.id !== id)), 500);
  };

  // --- SEAMLESS SYNC (Instant Phone-to-Laptop) ---
  useEffect(() => {
    if (!isDataLoaded || !tgUser?.id || tgUser.id === "test_local_user") return;

    const channel = supabase
      .channel(`main-page-sync-${tgUser.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'players' },
        async (payload) => {
          // 1. Update your personal balance (Seamless Sync)
          if (payload.new.telegram_id === String(tgUser.id)) {
            setBalance(Number(payload.new.shard_balance));
            setEnergy(Number(payload.new.last_energy));
            setTapPower(payload.new.tap_power);
            setMaxDailyLimit(payload.new.max_daily_limit);
            setStats({
              inventory: payload.new.inventory || {},
              frenzy_expires: payload.new.frenzy_expires,
              efficiency_expires: payload.new.efficiency_expires,
              energy_boost_expires: payload.new.energy_boost_expires
            });
          }

          // 2. Update the Top Leader Badge (The fix for the main page)
          // We check the 'leaderboard_all_time' view to see who the new #1 is
          const { data } = await supabase
            .from('leaderboard_all_time')
            .select('*')
            .limit(1)
            .maybeSingle();
          
          if (data) {
            setTopLeader({
              name: data.username || `ID:..${String(data.telegram_id).slice(-4)}`,
              score: data.shard_balance
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isDataLoaded, tgUser.id]);

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
      const baseFee = 20000 / 1e9;
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

      /// 3. --- PASTE THE UPSERT CODE HERE ---
      const { error: upsertError } = await supabase.from('players').upsert({
        telegram_id: String(tgUser.id),
        wallet_address: playerWallet, // Add this line to fix the error!
        sol_balance: realSol,
        usdc_balance: realUsdc,
        username: tgUser.username || tgUser.first_name || 'Player'
      }, { onConflict: 'telegram_id' })
          .select();

      if (upsertError) {
          console.error("❌ SYNC ERROR:", error.message);
      } else {
          console.log("✅ Sync Successful for ID:", tgUser.id, data);
      }
      
    } catch (err) { 
      console.error("Balance/Fee fetch failed", err); 
    }
  }, [playerWallet, connection, balance, tgUser.id]); // Added 'balance' to dependencies

  // --- BLOCKCHAIN-TO-DATABASE SYNC ---
  useEffect(() => {
    if (isModalOpen && playerWallet && isDataLoaded && !showSettings) {
      console.log("Wallet Dashboard opened: Syncing real balances...");
      fetchBalances();
    }
  }, [isModalOpen, playerWallet, isDataLoaded, fetchBalances, showSettings]);

  const inviteLink = `https://t.me/Gift2uTapBot?start=${tgUser.id}`;

  const handleInvite = () => {
    const text = "🎁 Join me on Gift! Tap to earn shards and move your way up the leaderboard!";
    const url = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(text)}`;
    window.Telegram.WebApp.openTelegramLink(url);
  };

  // 2. Create the execution function
  const handleWithdraw = async () => {
      if (!withdrawAddress || !withdrawAmount) return;
      
      setTxStatus({ loading: true, message: '🔗 Signing with your local key...' });

      try {
          // 1. Get the player's secret key from their local storage
          const storedSecret = localStorage.getItem(`wallet_secret_${tgUser.id}`);
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

  if (isLoading) return <div style={styles.container}>Loading Gift...</div>;

  return (
    <div style={{ backgroundColor: '#000', minHeight: '100vh', width: '100%' }}>
      
      {!hasAccess ? (
        /* 1. Show ONLY the BetaGate if they aren't authorized */
        <BetaGate 
          telegramId={tgUser?.id} 
          onAccessGranted={(code) => initializeNewPlayer(code)} 
        />
      ) : (
        /* 2. Show the ACTUAL GAME if they have access */
        <div style={{ ...styles.container, flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
          
          {/* 1. TOP HEADER (Leaderboard & Wallet) - Consistent across all pages */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', width: '100%', boxSizing: 'border-box' }}>
            <div style={styles.tabContainer}>
              <button 
                style={leaderboardType === 'all_time' ? styles.activeTab : styles.tab}
                onClick={() => { setLeaderboardType('all_time'); fetchFullLeaderboard('all_time'); }}
              >
                All-Time Leader
                <span style={styles.leaderBadge}>🏆 {topLeader.name}: {topLeader.score.toLocaleString()}</span>
              </button>
              <button style={leaderboardType === 'season' ? styles.activeTab : styles.tab} onClick={() => setLeaderboardType('season')}>
                ⏳ Season 1
              </button>
            </div>

            <div style={styles.walletWrapper}>
              <button 
                onClick={() => { 
                  setIsModalOpen(true); 
                  // Check if they have done the mandatory backup
                  const isBackedUp = localStorage.getItem(`wallet_backed_up_${tgUser.id}`);
                  if (!isBackedUp) {
                    setMustBackup(true); // Force the mandatory popup
                  } else {
                    fetchBalances();
                  }
                }} 
                style={styles.walletBtn}
              >
                {playerWallet?.slice(0, 4)}...{playerWallet?.slice(-4)}
              </button>
            </div>
          </div>

          {/* 2. DYNAMIC CONTENT (This is your "Pages") */}
          <div style={styles.mainContent}>
            {currentPage === 'home' && (
              <>
                <div style={styles.header}>
                  <h1 style={styles.balance}>{balance} GFTshards</h1>
                  <p style={styles.energy}>⚡ {energy} / 500</p>
                  <div style={styles.progressContainer}>
                    <div 
                      style={{ 
                        ...styles.progressBar, 
                        width: `${Math.min((dailyTaps / maxDailyLimit) * 100, 100)}%`,
                        background: dailyTaps >= maxDailyLimit ? '#ff4d4d' : '#ffd700'
                      }} 
                    />
                  </div>
                </div>
              

                <div onClick={handleTap} style={styles.giftZone}>
                  <img src="/Gift2u_logo.png" alt="Gift"  onDragStart={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()} style={{ ...styles.giftImage, filter: isPressed ? 'drop-shadow(0 0 15px rgba(255, 215, 0, 0.8)) brightness(1.1)' : 'drop-shadow(0 0 5px rgba(255, 215, 0, 0.2))', transform: isPressed ? 'scale(0.95)' : 'scale(1)', transition: 'transform 0.05s cubic-bezier(0.34, 1.56, 0.64, 1)' }} />
                  {taps.map(t => <span key={t.id} style={{ ...styles.floatingText, left: t.x, top: t.y }}>+{t.amount.toFixed(2)}</span>)}
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
                tgUser={tgUser}
                playerWallet={playerWallet}
              />
            )}

            {currentPage === 'tasks' && (
              <Tasks 
                balance={balance} 
                setBalance={setBalance} 
                tgUser={tgUser} 
              />
            )}

            {currentPage === 'friends' && (
              <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <h2 style={{ color: '#888' }}>Friends Coming Soon...</h2>
              </div>
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
                      <span style={{color: '#528db0'}}>{player.shard_balance?.toLocaleString()}</span>
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
                
                {/* --- MANDATORY BACKUP SCREEN (First Visit Only) --- */}
                {mustBackup ? (
                  <div style={{ textAlign: 'left' }}>
                    <h3 style={{ color: '#ff4d4d', marginTop: 0 }}>⚠️ Action Required</h3>
                    <p style={{ fontSize: '12px', color: '#ccc' }}>Before you can use your wallet, you must secure your Secret Phrase. Create a local password to lock it.</p>
                    
                    <div style={{ background: '#111', padding: '15px', borderRadius: '10px', border: '1px solid #333', marginBottom: '15px' }}>
                      <label style={{ color: '#888', fontSize: '11px' }}>CREATE WALLET PASSWORD:</label>
                      <input 
                        type="password" 
                        value={setupPwd}
                        onChange={(e) => setSetupPwd(e.target.value)}
                        placeholder="Enter a strong password"
                        style={{ width: '100%', marginTop: '5px', padding: '10px', borderRadius: '8px', background: '#000', border: '1px solid #555', color: '#fff', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div style={{ background: '#000', padding: '15px', borderRadius: '10px', border: '1px solid #ffd700', marginBottom: '15px' }}>
                      <label style={{ color: '#ffd700', fontSize: '11px', fontWeight: 'bold' }}>YOUR SECRET PHRASE:</label>
                      <code style={{ color: '#4ade80', fontSize: '11px', wordBreak: 'break-all', display: 'block', marginTop: '5px' }}>
                        {localStorage.getItem(`wallet_secret_${tgUser.id}`) || "❌ Error: Key not found. Please clear browser cache and try again."}
                      </code>
                    </div>

                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(localStorage.getItem(`wallet_secret_${tgUser.id}`));
                        alert("Copied!");
                      }}
                      style={{ width: '100%', background: '#333', color: '#fff', padding: '10px', borderRadius: '8px', marginBottom: '10px', border: '1px solid #555' }}
                    >
                      📋 Copy Phrase
                    </button>

                    <button 
                      disabled={setupPwd.length < 4}
                      onClick={() => {
                        // Save the password and mark as backed up
                        localStorage.setItem(`wallet_pwd_${tgUser.id}`, setupPwd);
                        localStorage.setItem(`wallet_backed_up_${tgUser.id}`, "true");
                        setMustBackup(false);
                        fetchBalances();
                      }}
                      style={{ width: '100%', background: '#fbef43', color: '#000', padding: '12px', borderRadius: '8px', fontWeight: 'bold', border: 'none', opacity: setupPwd.length < 4 ? 0.5 : 1 }}
                    >
                      I HAVE SAVED MY PHRASE & PASSWORD
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
                        <p style={{ color: '#aaa', fontSize: '12px', marginBottom: '15px' }}>Enter your password to reveal your Secret Phrase.</p>
                        
                        {!isRevealed ? (
                          <div style={{ background: '#111', padding: '15px', borderRadius: '10px', border: '1px solid #333' }}>
                            <input 
                              type="password" 
                              value={walletPwd}
                              onChange={(e) => setWalletPwd(e.target.value)}
                              placeholder="Your password"
                              style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#000', border: '1px solid #444', color: '#fff', boxSizing: 'border-box' }}
                            />
                            <button 
                              onClick={() => {
                                const savedPwd = localStorage.getItem(`wallet_pwd_${tgUser.id}`);
                                if (savedPwd === walletPwd) {
                                  setIsRevealed(true);
                                } else {
                                  alert("Incorrect password!");
                                }
                              }}
                              style={{ width: '100%', marginTop: '15px', background: '#ffd700', color: '#000', padding: '10px', borderRadius: '8px', fontWeight: 'bold', border: 'none' }}
                            >
                              Unlock Wallet
                            </button>
                          </div>
                        ) : (
                          <div style={{ background: '#111', padding: '15px', borderRadius: '10px', border: '1px solid #ffd700' }}>
                            <p style={{ color: '#ff4d4d', fontSize: '12px', fontWeight: 'bold', margin: '0 0 10px 0' }}>⚠️ NEVER SHARE THIS PHRASE</p>
                            <code style={{ color: '#4ade80', fontSize: '11px', wordBreak: 'break-all', display: 'block', marginBottom: '15px', padding: '10px', background: '#000', borderRadius: '5px' }}>
                              {localStorage.getItem(`wallet_secret_${tgUser.id}`)}
                            </code>
                            <button 
                              onClick={() => { navigator.clipboard.writeText(localStorage.getItem(`wallet_secret_${tgUser.id}`)); alert("Copied!"); }}
                              style={{ width: '100%', background: '#333', color: '#fff', border: '1px solid #555', padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
                            >
                              📋 Copy Phrase
                            </button>
                          </div>
                        )}
                        <button onClick={() => { setShowSettings(false); setIsRevealed(false); setWalletPwd(''); }} style={{ width: '100%', marginTop: '20px', background: 'none', color: '#888', border: 'none', cursor: 'pointer' }}>← Back to Balances</button>
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
                          <button style={styles.actionBtn} onClick={() => { setIsModalOpen(false); setIsReceiveOpen(true); }}>Receive</button>
                          <button style={styles.actionBtn} onClick={() => { setIsModalOpen(false); setIsWithdrawOpen(true); }}>Send</button>
                          <button style={styles.actionBtn} onClick={() => { setIsModalOpen(false); setIsSwapOpen(true); }}>Swap</button>
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
                <h3 style={{ color: '#ffd700', marginBottom: '10px' }}>Receive Assets</h3>
                
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
                
                <button onClick={() => setIsReceiveOpen(false)} style={styles.closeBtn}>Close</button>
              </div>
            </div>
          )}

          {/* Withdraw Pop-up */}
          {isWithdrawOpen && (
            <div style={styles.modalOverlay} onClick={() => setIsWithdrawOpen(false)}>
              <div style={{ ...styles.modalContent, background: '#131517', border: 'none', width: '90%', maxWidth: '360px' }} onClick={e => e.stopPropagation()}>
                  
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <h3 style={{ color: '#fff', margin: 0 }}>Withdraw</h3>
                  <button onClick={() => setIsWithdrawOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: '20px' }}>✕</button>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#ff4d4d', marginTop: '5px' }}>
                    <span>Network Fee</span>
                    <span>- {transactionCosts.baseFeeWithBuffer?.toFixed(6) ?? '0.000000'} SOL</span>
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

          {txStatus.message && (
            <div style={{
              ...styles.toast, 
              backgroundColor: txStatus.message.includes('✅') ? '#1a472a' : '#4a1111',
              borderColor: txStatus.message.includes('✅') ? '#4ade80' : '#ff4d4d'
            }}>
              <div style={{ textAlign: 'center', color: '#fff' }}>
                {txStatus.message}
              </div>
              
              {/* Only render the Solscan link if a signature exists */}
              {txStatus.signature && (
                <div style={{ marginTop: '8px', textAlign: 'center', fontSize: '12px' }}>
                  <a 
                    href={`https://solscan.io/tx/${txStatus.signature}`} 
                    target="_blank" 
                    rel="noreferrer" 
                    style={{ color: '#4ade80', textDecoration: 'underline' }}
                  >
                    View on Solscan
                  </a>
                </div>
              )}
            </div>
          )}
          {/* Swap Pop-up */}
          {isSwapOpen && (
            <div style={styles.modalOverlay} onClick={() => setIsSwapOpen(false)}>
              <div style={{ ...styles.modalContent, background: '#131517', border: 'none', width: '90%', maxWidth: '360px' }} onClick={e => e.stopPropagation()}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <h3 style={{ color: '#fff', margin: 0 }}>Swap</h3>
                  <button onClick={() => setIsSwapOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: '20px' }}>✕</button>
                </div>

                {/* From Section */}
                <div style={{ background: '#1c1e22', borderRadius: '16px', padding: '15px', textAlign: 'left', marginBottom: '5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '12px' }}>
                    <span>You pay</span>
                    <span>Balance: {balances.sol.toFixed(4)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                    <input 
                      type="number" 
                      placeholder="0.00"
                      value={swapFromAmount}
                      onChange={(e) => setSwapFromAmount(e.target.value)}
                      style={{ background: 'none', border: 'none', color: '#fff', fontSize: '24px', width: '60%', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff' }}>
                      <span>SOL</span>
                    </div>
                  </div>
                </div>

                {/* Swap Arrow Icon */}
                <div style={{ height: '30px', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2, position: 'relative', margin: '-15px 0' }}>
                  <div style={{ background: '#131517', border: '2px solid #333', borderRadius: '50%', padding: '5px', color: '#fbef43' }}>
                    ↓
                  </div>
                </div>

                {/* To Section */}
                <div style={{ background: '#1c1e22', borderRadius: '16px', padding: '15px', textAlign: 'left', marginTop: '5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '12px' }}>
                    <span>You receive</span>
                    <span>Balance: {balance.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                    <input 
                      type="number" 
                      placeholder="0.00"
                      value={swapToAmount}
                      readOnly
                      style={{ background: 'none', border: 'none', color: '#fff', fontSize: '24px', width: '60%', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff' }}>
                      <span>GFT</span>
                    </div>
                  </div>
                </div>

                <p style={{ fontSize: '12px', color: '#888', marginTop: '20px' }}>
                  1 SOL ≈ 1,000,000 GFT
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
                    opacity: swapFromAmount > 0 ? 1 : 0.5
                  }}
                  onClick={() => {
                    alert(`Swapping ${swapFromAmount} SOL for GFT...`);
                  }}
                >
                  Review Swap
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
                  <code style={{fontSize: '11px', color: '#4ade80', wordBreak: 'break-all'}}>
                    {generatedSecret}
                  </code>
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

        </div>
        
      )}
      
    </div>
  );
};

export default GiftTapGame;