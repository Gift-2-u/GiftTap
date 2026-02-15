import { Buffer } from 'buffer';
window.Buffer = window.Buffer || Buffer;
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { supabase } from './supabaseClient';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import BetaGate from './BetaGate';
import Upgrades from './Upgrades';

const GiftTapGame = () => {

  const styles = {
    container: { position: 'fixed', top: 0, left: 0, height: '100%', width: '100%', background: '#1a1a1a', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden', touchAction: 'manipulation' },
    walletWrapper: { padding: '20px', width: '100%', display: 'flex', justifyContent: 'flex-end' },
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
    walletBtn: { background: 'rgba(255, 215, 0, 0.1)', color: '#ffd700', border: '1px solid #ffd700', padding: '8px 15px', borderRadius: '20px', fontWeight: 'bold' },
    leaderBadge: { display: 'block', fontSize: '0.7rem', color: '#5578da', marginTop: '4px', fontWeight: 'normal', opacity: 0.9 },
    activeTab: { background: '#ffffff', color: '#000', padding: '10px 20px', borderRadius: '10px', border: 'none', fontWeight: 'bold', flex: 1 },
    tab: { background: '#333', color: '#fff', padding: '10px 20px', borderRadius: '10px', border: 'none', flex: 1 },
    shopItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0', borderBottom: '1px solid #333' },
    buyBtn: { background: '#ffd700', color: '#000', border: 'none', padding: '8px 12px', borderRadius: '10px', fontWeight: 'bold' },
    tabContainer: { display: 'flex', gap: '10px', width: '90%', marginBottom: '20px', marginTop: '10px' },
    progressContainer: { width: '200px', height: '10px', background: '#333', borderRadius: '5px', margin: '10px auto', overflow: 'hidden', border: '1px solid #444' },
    progressBar: { height: '100%', transition: 'width 0.3s ease-in-out', boxShadow: '0 0 10px rgba(255, 215, 0, 0.3)' },
    mainContent: { flex: 1, width: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto', alignItems: 'center' },
    shopPage: { width: '100%', padding: '20px', boxSizing: 'border-box' }
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
  const [balances, setBalances] = useState({ sol: 0, gft: 0, usdc: 0 });
  const [leaderboardType, setLeaderboardType] = useState('all_time');
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [dailyTaps, setDailyTaps] = useState(0);
  const [lastTapDate, setLastTapDate] = useState(null);
  const [isPressed, setIsPressed] = useState(false);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [maxDailyLimit, setMaxDailyLimit] = useState(1000);
  const [tapPower, setTapPower] = useState(1);
  const [currentPage, setCurrentPage] = useState('home'); // 'home', 'shop', 'tasks', 'friends'

  const tgUser = useMemo(() => {
    return window.Telegram?.WebApp?.initDataUnsafe?.user || { id: "test_local_user", first_name: "Local" };
  }, []);

  const connection = useMemo(() => new Connection(clusterApiUrl('mainnet-beta')), []);

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
  const saveToDatabase = async (b, e, daily, date) => {
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

  const fetchBalances = useCallback(async () => {
    if (!playerWallet) return;
    try {
      const pubKey = new PublicKey(playerWallet);
      const solBalance = await connection.getBalance(pubKey);
      const usdcMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

      const getTokenBal = async (mint) => {
        try {
          const ata = getAssociatedTokenAddressSync(mint, pubKey);
          const bal = await connection.getTokenAccountBalance(ata);
          return bal.value.uiAmount || 0;
        } catch { return 0; }
      };

      setBalances({
        sol: solBalance / 1e9,
        gft: 0,
        usdc: await getTokenBal(usdcMint)
      });
    } catch (err) { console.error("Balance fetch failed", err); }
  }, [playerWallet, connection]);

  const inviteLink = `https://t.me/Gift2uTapBot?start=${tgUser.id}`;

  const handleInvite = () => {
    const text = "🎁 Join me on Gift! Tap to earn shards and move your way up the leaderboard!";
    const url = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(text)}`;
    window.Telegram.WebApp.openTelegramLink(url);
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
        <div style={styles.container}>
          
          <div style={styles.walletWrapper}>
            <button onClick={() => { setIsModalOpen(true); fetchBalances(); }} style={styles.walletBtn}>
              {playerWallet?.slice(0, 4)}...{playerWallet?.slice(-4)}
            </button>
          </div>

          <div style={styles.tabContainer}>
            <button 
              style={leaderboardType === 'all_time' ? styles.activeTab : styles.tab}
              onClick={() => { setLeaderboardType('all_time'); fetchFullLeaderboard('all_time'); }}
            >
              🌎 All-Time
              <span style={styles.leaderBadge}>🏆 {topLeader.name}: {topLeader.score.toLocaleString()}</span>
            </button>
            <button style={leaderboardType === 'season' ? styles.activeTab : styles.tab} onClick={() => setLeaderboardType('season')}>
              ⏳ Season 1
            </button>
          </div>

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

          {/* 2. DYNAMIC CONTENT (This is your "Pages") */}
          <div style={styles.mainContent}>
            {currentPage === 'home' && (
              <div onClick={handleTap} style={styles.giftZone}>
                <img src="/Gift2u_logo.png" alt="Gift"  onDragStart={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()} style={{ ...styles.giftImage, filter: isPressed ? 'drop-shadow(0 0 15px rgba(255, 215, 0, 0.8)) brightness(1.1)' : 'drop-shadow(0 0 5px rgba(255, 215, 0, 0.2))', transform: isPressed ? 'scale(0.95)' : 'scale(1)', transition: 'transform 0.05s cubic-bezier(0.34, 1.56, 0.64, 1)' }} />
                {taps.map(t => <span key={t.id} style={{ ...styles.floatingText, left: t.x, top: t.y }}>+1</span>)}
              </div>
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

            {activeTab === 'tasks' && (
              <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <h2 style={{ color: '#888' }}>Tasks Coming Soon...</h2>
              </div>
            )}

            {activeTab === 'friends' && (
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
                      <span style={{color: '#5578da'}}>{player.shard_balance?.toLocaleString()}</span>
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
                <div style={styles.balanceRow}><span>SOL:</span> <span>{balances.sol.toFixed(4)}</span></div>
                <div style={styles.balanceRow}><span>GFT Shards:</span> <span>{balance.toLocaleString()}</span></div>
                <div style={styles.balanceRow}><span>USDC:</span> <span>${balances.usdc.toFixed(2)}</span></div>
                <div style={styles.actionRow}>
                  <button style={styles.actionBtn}>Withdraw</button>
                  <button style={styles.actionBtn}>Swap</button>
                </div>
                <button onClick={() => setIsModalOpen(false)} style={styles.closeBtn}>Close</button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};

export default GiftTapGame;