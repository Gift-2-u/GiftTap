import { useState, useEffect, useCallback, useMemo } from 'react';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { supabase } from './supabaseClient';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import BetaGate from './BetaGate';
import Upgrades from './Upgrades';
import Tasks from './Tasks';

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
    nav: { height: '80px', width: '100%', display: 'flex', justifyContent: 'space-around', background: '#333', borderTop: '2px solid #ffd700', paddingBottom: 'env(safe-area-inset-bottom)' },
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

  const tgUser = useMemo(() => {
    return window.Telegram?.WebApp?.initDataUnsafe?.user || { id: "test_local_user", first_name: "Local" };
  }, []);

  const connection = useMemo(() => {
    const rpcUrl = import.meta.env.VITE_SOLANA_RPC_URL;
    
    console.log("DEBUG RPC URL:", rpcUrl); 
    // If this prints "undefined" as a string, the build failed to find the secret.
    
    return new Connection(rpcUrl || clusterApiUrl('mainnet-beta'), 'confirmed');
  }, []);
  // This is where all project fees will be sent to fund the Gift launch
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

  // 4. SYNC PLAYER LOGIC (Fixed Brackets)
  const syncPlayer = useCallback(async () => {
    setIsLoading(true);
    try {
      const userId = String(tgUser.id);
      
      // Your original fetch logic
      const { data: player } = await supabase
        .from('players')
        .select('*')
        .eq('telegram_id', userId)
        .maybeSingle();

      if (player && player.wallet_address, player.has_beta_access) {
        // Check if they have the beta flag
        setHasAccess(player.has_beta_access || false);
        setPlayerWallet(player.wallet_address);
        setBalance(Number(player.shard_balance));
        setTapPower(player.tap_power || 1);
        setMaxDailyLimit(player.max_daily_limit || 1000);

        // Handle Daily Reset
        const today = new Date().toISOString().split('T')[0];
        if (player.last_tap_date !== today) {
          setDailyTaps(0);
          setLastTapDate(today);
        } else {
          setDailyTaps(player.daily_taps || 0);
          setLastTapDate(player.last_tap_date);
        }
          
        // Your original Energy Recovery Calculation
        const lastDate = new Date(player.last_updated).getTime();
        const now = new Date().getTime();
        const secondsPassed = Math.floor((now - lastDate) / 1000);
        const recovered = Math.floor(secondsPassed / 1.5); // Back to your 1.5s logic
          
        setEnergy(Math.min(player.last_energy + recovered, 500));
        setIsDataLoaded(true);
        
      } else {
        // NEW USER: Show Beta Gate
        setHasAccess(false);
      }
      await fetchTopLeader();
    } catch (err) {
      console.error("Sync Error:", err.message);
    } finally {
      setIsLoading(false);
    }
  }, [tgUser, fetchTopLeader]);

  const initializeNewPlayer = async (inputCode) => {
      
      try {
        // --- STEP 1: VERIFY BETA CODE ---
        const { data: codeData, error: codeError } = await supabase
            .from('invite_codes')
            .select('*')
            .eq('code', inputCode)
            .maybeSingle();

        if (codeError || !codeData) {
            alert("❌ Invalid or already used code!");
            setIsLoading(false);
            return; // Stop here if code is bad
        }

        setIsLoading(true); // Show main loading screen

        const userId = String(tgUser.id);
        const userName = tgUser.username || tgUser.first_name || 'Player';

        // 1. Keep your original working call
        const { data: newWallet } = await supabase.functions.invoke('create-user-wallet', {
          body: { 
            telegram_id: userId,
            username: userName 
          }
        });

        if (newWallet) {
          // 2. Use UPSERT instead of UPDATE. 
          // This is the fix for the "Null ID" bug. 
          // If the Edge Function made a row with a null ID, this creates a GOOD row with your real ID.
          const { error: upsertError } = await supabase.from('players').upsert({
              telegram_id: userId,
              username: userName,
              wallet_address: newWallet.publicKey,
              has_beta_access: true,
              shard_balance: 0,
              last_energy: 500,
              last_updated: new Date().toISOString()
          }, { onConflict: 'telegram_id' });

          if (upsertError) {
              console.error("UPSERT ERROR:", upsertError);
          }

          // 3. Mark Code as Used (If you are using the Gate)
          if (inputCode) {
            await supabase
              .from('invite_codes')
              .update({ is_used: true, used_by: userId })
              .eq('code', inputCode);
          }

          setPlayerWallet(newWallet.publicKey);
          setBalance(0);
          setEnergy(500);
          setHasAccess(true);
          setIsDataLoaded(true);
        }
      } catch (err) {
        console.error("Init Error:", err);
      } finally {
        setIsLoading(false);
      }
  };

  // 5. EFFECTS
  useEffect(() => { syncPlayer(); }, [syncPlayer]);

  useEffect(() => {
    const ticker = setInterval(() => {
      setEnergy((prev) => (prev < 500 ? prev + 1 : 500));
    }, 1500);
    return () => clearInterval(ticker);
  }, []);

  // 6. SAVE PROGRESS
  const saveToDatabase = async (b, e, dt, ltd) => {
    // 1. Don't save if we don't have a valid user ID
    if (!tgUser?.id || tgUser.id === "test_local_user") return;

    clearTimeout(window.saveTimeout);

    window.saveTimeout = setTimeout(async () => {
      const { error } = await supabase.from('players').upsert({
        telegram_id: String(tgUser.id),
        username: tgUser.username || tgUser.first_name,
        shard_balance: b,
        season_shards: b,
        last_energy: e,
        daily_taps: dt, // Make sure these columns exist in Supabase!
        last_tap_date: ltd,
        last_updated: new Date().toISOString()
      }, { onConflict: 'telegram_id' });

      if (error) {
        console.error("❌ SAVE ERROR:", error.message);
        // Fallback: Try saving by wallet if TG ID fails
        await supabase.from('players').update({ shard_balance: b, last_energy: e }).eq('wallet_address', playerWallet);
      }
    }, 800); // Slightly faster save
  };

  const handleTap = (e) => {
    const today = new Date().toISOString().split('T')[0];
  
    // 1. Reset logic if it's a new day
    let currentDailyTaps = dailyTaps;
    if (lastTapDate !== today) {
      currentDailyTaps = 0;
      setDailyTaps(0);
      setLastTapDate(today);
      saveToDatabase(balance, energy, 0, today);
    }

    // 2. CHECK LIMIT (1000)
    if (currentDailyTaps >= 1000) {
      alert("Daily limit reached! Upgrade your boost to tap more.");
      return;
    }

    if (energy <= 0 || !isDataLoaded) return;

    const nextBalance = balance + 1;
    const nextEnergy = energy - 1;
    const nextDaily = currentDailyTaps + 1;

    setIsPressed(true);
    setTimeout(() => setIsPressed(false), 100); // Reset after 100ms

    setBalance(nextBalance);
    setEnergy(nextEnergy);
    setDailyTaps(nextDaily);
    saveToDatabase(nextBalance, nextEnergy, nextDaily, lastTapDate);

    saveToDatabase(nextBalance, nextEnergy, nextDaily, today);
    
    const id = Date.now();
    setTaps(t => [...t, { id, x: e.clientX, y: e.clientY }]);
    setTimeout(() => setTaps(t => t.filter(tap => tap.id !== id)), 500);
  };

  // --- SEAMLESS SYNC (Instant Phone-to-Laptop) ---
  useEffect(() => {
    if (!isDataLoaded || !tgUser?.id || tgUser.id === "test_local_user") return;

    const channel = supabase
      .channel(`main-page-sync-${tgUser.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'players',
        },
        async (payload) => {
          // 1. Update your personal balance (Seamless Sync)
          if (payload.new.telegram_id === String(tgUser.id)) {
            setBalance(Number(payload.new.shard_balance));
            setEnergy(Number(payload.new.last_energy));
            setTapPower(payload.new.tap_power);
            setMaxDailyLimit(payload.new.max_daily_limit);
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
      const [solBalance, latestBlock ] = await Promise.all([
        connection.getBalance(pubKey),
        connection.getLatestBlockhash('confirmed')
      ]);
      const baseFee = 20000 / 1e9;
      const baseFeeWithBuffer = baseFee * 1.25; // Your 25% safety buffer

      const getTokenBal = async (mint) => {
        try {
          const ata = getAssociatedTokenAddressSync(mint, pubKey);
          const bal = await connection.getTokenAccountBalance(ata);
          return bal.value.uiAmount || 0;
        } catch { return 0; }
      };

      setBalances({
        sol: solBalance / 1e9,
        GFT: 0,
        GFTshards: balance, // Pulls from your 'balance' state
        usdc: await getTokenBal(usdcMint),
      });

      // Set Fees separately
      setTransactionCosts({
        baseFeeWithBuffer: baseFeeWithBuffer, 
        projectFee: 0.0005 // Your fixed Gift launch fee
      });
      
    } catch (err) { 
      console.error("Balance/Fee fetch failed", err); 
    }
  }, [playerWallet, connection, balance]); // Added 'balance' to dependencies

  const inviteLink = `https://t.me/Gift2uTapBot?start=${tgUser.id}`;

  const handleInvite = () => {
    const text = "🎁 Join me on Gift! Tap to earn shards and move your way up the leaderboard!";
    const url = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(text)}`;
    window.Telegram.WebApp.openTelegramLink(url);
  };

  // 2. Create the execution function
  const handleWithdraw = async () => {
    console.log("Withdrawal initiated for:", withdrawAmount, "to:", withdrawAddress);
    if (!withdrawAddress || !withdrawAmount) return;

    setTxStatus({ loading: false, message: 'Processing withdrawal...' });
    
    try {
        // Replace this URL with your actual Supabase Project URL
        const response = await fetch('https://ncwlbwzxfpcnxkyrmdck.supabase.co/functions/v1/withdraw-sol', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // If you use a JWT/Anon Key, add it here:
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({
                telegram_id: userTelegramId, // Make sure you have this variable
                amount: parseFloat(withdrawAmount),
                toAddress: withdrawAddress
            })
        });

        const result = await response.json();

        if (result.error) throw new Error(result.error);
      
        setTxStatus({ loading: false, message: '✅ Success! Your SOL is on the way.' });
          
        // Auto-close after 3 seconds
        setTimeout(() => {
          setTxStatus({ loading: false, message: '' });
          setIsWithdrawOpen(false);
          setWithdrawAmount('');
        }, 3000);
      
    } catch (err) {
      setTxStatus({ loading: false, message: `❌ Error: ${err.message}` });
    }
  };

  // 5. SHOP LOGIC
  const buyUpgrade = async (type, cost, bonus) => {
    if (balance < cost) return alert("Not enough Shards!");
    
    const updates = type === 'power' 
      ? { tap_power: tapPower + bonus, shard_balance: balance - cost }
      : { max_daily_limit: maxDailyLimit + bonus, shard_balance: balance - cost };

    const { error } = await supabase.from('players').update(updates).eq('telegram_id', String(tgUser.id));
    
    if (!error) {
      setBalance(prev => prev - cost);
      if (type === 'power') setTapPower(prev => prev + bonus);
      else setMaxDailyLimit(prev => prev + bonus);
      alert("Upgrade successful!");
    } else {
      console.error("Upgrade Error:", error.message);
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
              <button onClick={() => { setIsModalOpen(true); fetchBalances(); }} style={styles.walletBtn}>
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
                  {taps.map(t => <span key={t.id} style={{ ...styles.floatingText, left: t.x, top: t.y }}>+1</span>)}
                </div>
              </>
            )}

            {currentPage === 'shop' && (
              <Upgrades 
                balance={balance} 
                setBalance={setBalance}
                stats={{ tap_power: tapPower, max_daily_limit: maxDailyLimit }}
                setStats={(newStats) => {
                  if (newStats.tap_power) setTapPower(newStats.tap_power);
                  if (newStats.max_daily_limit) setMaxDailyLimit(newStats.max_daily_limit);
                }}
                tgUser={tgUser}
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
            <div style={styles.modalOverlay} onClick={() => setIsModalOpen(false)}>
              <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                <h3>Wallet Dashboard</h3>
                <p style={{ fontSize: '12px', color: '#888', marginBottom: '15px' }}>
                  Wallet Balance.
                </p>
                <div style={styles.balanceRow}><span>SOL:</span> <span>{balances.sol.toFixed(4)}</span></div>
                <div style={styles.balanceRow}><span>GFT Shards:</span> <span>{balance.toLocaleString()}</span></div>
                <div style={styles.balanceRow}><span>USDC:</span> <span>${balances.usdc.toFixed(2)}</span></div>
                <div style={styles.actionRow}>
                  <button style={{ ...styles.actionBtn }} 
                  onClick={() => { setIsModalOpen(false); setIsReceiveOpen(true); }}
                  >Receive</button>
                  <button style={styles.actionBtn}
                  onClick={() => { setIsModalOpen(false); setIsWithdrawOpen(true); }}
                  >Send</button>
                  <button style={styles.actionBtn}
                  onClick={() => { setIsModalOpen(false); setIsSwapOpen(true); }}
                  >Swap</button>
                </div>
                <button onClick={() => setIsModalOpen(false)} style={styles.closeBtn}>Close</button>
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
                    <span>Gift Launch Support</span>
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
                    <span onClick={() => setWithdrawAmount(balances.sol)} style={{ position: 'absolute', right: '12px', top: '12px', color: '#ffd700', fontSize: '12px', cursor: 'pointer', zIndex: 10 }}> MAX</span>
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

          {/* Display the status message if it exists */}
          {txStatus.message && (
            <div style={{ 
              marginTop: '10px', 
              padding: '10px', 
              borderRadius: '8px', 
              backgroundColor: txStatus.message.includes('✅') ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 255, 255, 0.05)',
              color: txStatus.message.includes('❌') ? '#ff4d4d' : '#fff',
              fontSize: '14px',
              textAlign: 'center'
            }}>
              {txStatus.message}
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

          {status.show && (
            <div style={styles.toast}>
              {status.message}
            </div>
          )}

        </div>
        
      )}
      
    </div>
  );
};

export default GiftTapGame;