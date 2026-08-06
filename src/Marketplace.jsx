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
} from './mintLocksmith';
import { ShopGlyph } from './shopIcons';

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

const Marketplace = ({ balance, setBalance, stats, setStats, setEnergy, player, tgUser, playerWallet, decryptedPhrase }) => {
  const user = player || tgUser;
  const [activeTab, setActiveTab] = useState('market');
  const [marketFilter, setMarketFilter] = useState('All');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [itemToBuy, setItemToBuy] = useState(null);

  // Custom Pop-up State
  const [txStatus, setTxStatus] = useState({ show: false, loading: false, message: '', success: false });

  // Initialize local inventory from stats so the UI updates instantly
  const [localInventory, setLocalInventory] = useState(stats?.inventory || {});
  // NEW: Track daily usage from the database stats
  const [dailyUsage, setDailyUsage] = useState(stats?.daily_usage || {});

  /** Game wallet SOL — used to disable GiftLocksmith mint when under 0.25 + fees */
  const [walletSol, setWalletSol] = useState(null);
  const [walletSolLoading, setWalletSolLoading] = useState(false);
  const minMintSol = minSolForLocksmithMint();
  const walletUnlocked = Boolean(decryptedPhrase);
  const canAffordLocksmithMint =
    walletUnlocked &&
    walletSol != null &&
    Number.isFinite(walletSol) &&
    walletSol >= minMintSol;

  useEffect(() => {
    if (stats?.inventory) setLocalInventory(stats.inventory);
    if (stats?.daily_usage) setDailyUsage(stats.daily_usage);
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
      price: 0.0125,
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
      price: 0.025,
      currency: 'SOL',
      iconFrom: '#c084fc',
      iconTo: '#5b21b6',
      iconRing: 'rgba(192,132,252,0.55)',
      iconGlow: 'rgba(168,85,247,0.35)',
    },
  ];

  /** Separate NFT marketplace (on-chain mints) — not backpack boosts */
  const nftListings = [
    {
      id: 'locksmith',
      name: 'GiftLocksmith',
      type: 'NFT',
      rarity: 'Rare',
      collection: 'Gift2u Elves',
      /** Short line under name */
      boost: 'Unlocks Shard Swap (G2Ushards → G2U) with better fees',
      /** Bullet benefits shown on card */
      perks: [
        'Unlocks Shard Swap immediately (skip Level 5 + Swap Badge)',
        '4% fee in G2U vs 10% free path',
        'Higher daily swap cap',
        'Vault better APY (coming soon)',
      ],
      duration: 'Permanent · Gen 1 · Wave 1 of 3',
      price: LOCKSMITH_WAVE1.priceSol,
      currency: 'SOL',
      image: '🔑',
      imageUrl: LOCKSMITH_WAVE1.imageUri,
      supply: LOCKSMITH_WAVE1.itemsAvailable,
      maxPerWallet: LOCKSMITH_WAVE1.maxPerWallet,
      isNftMint: true,
    },
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

    // Copy current inventory and add 1
    const newInventory = { ...localInventory };
    newInventory[item.id] = (newInventory[item.id] || 0) + 1;
    const nextBalance = Math.max(0, Math.round((have - cost) * 1000) / 1000);

    try {
      // Deduct shards + add backpack item together
      const { error } = await supabase.from('players')
        .update({ shard_balance: nextBalance, inventory: newInventory })
        .eq(DB_PLAYER_ID, String(user.id));
       
      if (error) throw error;

      // Parent setBalanceSynced also patches pending cloud-save so taps cannot refund this spend
      setBalance(nextBalance);
      setLocalInventory(newInventory);
      if (setStats) setStats({ ...stats, inventory: newInventory }); // Keep parent in sync

      setTxStatus({ show: true, loading: false, message: `✅ ${item.name} added to Backpack! (−${cost.toLocaleString()} G2Ushards)`, success: true });
      setTimeout(() => setTxStatus(prev => ({ ...prev, show: false })), 2000);

    } catch (err) {
      console.error("Purchase Error:", err.message);
      setTxStatus({ show: true, loading: false, message: "❌ Failed to process purchase.", success: false });
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
    if (!playerWallet) {
      setTxStatus({
        show: true,
        loading: false,
        message: '❌ No game wallet found on this account.',
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
      // Pre-check balance (same gate as button). Never start mint without 0.25 + fees.
      const { sol } = await assertWalletCanMintLocksmith(String(playerWallet));
      setWalletSol(sol);

      setTxStatus({
        show: true,
        loading: true,
        message: `Minting GiftLocksmith for ${LOCKSMITH_WAVE1.priceSol} SOL…`,
        success: false,
      });

      const result = await mintLocksmithWave1(decryptedPhrase);

      // Refresh balance after successful mint
      try {
        const after = await getWalletSolBalance(String(playerWallet));
        setWalletSol(after);
      } catch {
        /* ignore */
      }

      setTxStatus({
        show: true,
        loading: false,
        message: `✅ GiftLocksmith minted!\nAsset: ${result.asset.slice(0, 8)}…\nOpen Shard Swap for better fees.`,
        success: true,
      });
    } catch (err) {
      console.error('Locksmith mint error', err);
      const msg = err?.message || String(err);
      // Refresh shown balance so UI stays honest after a fail
      try {
        if (playerWallet) {
          const sol = await getWalletSolBalance(String(playerWallet));
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

  const handlePremiumBuy = async (item) => {
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

      // --- 🚨 UNIFIED LEDGER UPDATE: INVENTORY + TASK COMPLETION + REWARD PAYS ---
      
      // Update Inventory Object Locally
      const newInventory = { ...localInventory };
      newInventory[item.id] = (newInventory[item.id] || 0) + 1;

      // Single atomic payload execution to ensure consistency
      const { error: updateError } = await supabase.from('players')
        .update({ 
          inventory: newInventory,
          has_made_purchase: true,       // Complete the purchase task permanently
        })
        .eq(DB_PLAYER_ID, String(user.id));
        
      if (updateError) throw updateError;

      // Update Local State Components for Immediate UI Updates
      setLocalInventory(newInventory);
      
      if (setStats) {
        setStats({ 
          ...stats, 
          inventory: newInventory,
          has_made_purchase: true,
        });
      }

      // Also call individual setters if your app uses them alongside stats state:
      // if (setLifetimeTotal) setLifetimeTotal(updatedLifetime);
      // if (setSeasonTotal) setSeasonTotal(updatedSeason);

      setTxStatus({ show: true, loading: false, message: `✅ Success! ${item.name} purchased. Check your Tasks to claim your reward!`, success: true });
      setTimeout(() => setTxStatus(prev => ({ ...prev, show: false })), 3000);

    } catch (err) {
      console.error("Purchase Error:", err);
      setTxStatus({ show: true, loading: false, message: `❌ Error: ${err.message}`, success: false });
    }
  };

 // 5. SOLANA TRANSACTION LOGIC
  const handlePremiumBuy_old = async (item) => {
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
      const masterWallet = new PublicKey("D4GufPTvp6tnzkaYGfombFLs48UjDANsxjMFJnSYz4Gh"); // <--- Add your Master Wallet here
      const treasuryWallet = new PublicKey("8G7uEcPS6dwA5wW9bGoqi98EzBunF8trjbbFJkgkvBPm"); // Your Fee Treasury

      const itemPriceLamports = Math.floor(item.price * 1e9);
      const projectFeeLamports = Math.floor(0.0005 * 1e9); // The 0.0005 SOL Treasury Fee
      const totalRequired = itemPriceLamports + projectFeeLamports + 1000000; // Total + buffer for network fee

      // 4. Check Balance
      const currentBalance = await connection.getBalance(playerKeypair.publicKey);
      if (currentBalance < totalRequired) {
        throw new Error(`Insufficient SOL. You need at least ${(totalRequired / 1e9).toFixed(4)} SOL to cover the item and network fees.`);
      }

      setTxStatus({ show: true, loading: true, message: `🔗 Confirming payment of ${item.price} SOL on Solana...`, success: false });

      // 5. Build Split Transaction
      const transaction = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }),
        // Instruction 1: Send the main purchase price to your Master Wallet
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

      // ---> 🚨 ADD THESE 3 LINES FOR HELIUS STRICT MODE <---
      const latestBlockhash = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = latestBlockhash.blockhash;
      transaction.feePayer = playerKeypair.publicKey;

      // 6. Send and Confirm
      const signature = await sendAndConfirmTransaction(connection, transaction, [playerKeypair]);

      // Database Update: Add to JSON Inventory
      const newInventory = { ...localInventory };
      newInventory[item.id] = (newInventory[item.id] || 0) + 1;

      const { error: updateError } = await supabase.from('players')
        .update({ inventory: newInventory })
        .eq(DB_PLAYER_ID, String(user.id));
       
      if (updateError) throw updateError;

      setLocalInventory(newInventory);
      if (setStats) setStats({ ...stats, inventory: newInventory });

      setTxStatus({ show: true, loading: false, message: `✅ Success! ${item.name} added to Backpack.`, success: true });
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
    if (dailyUsage[item.id] === todayStr) {
      setTxStatus({ show: true, loading: false, message: `❌ You have already used a ${item.name} today. Wait until UTC midnight.`, success: false });
      setTimeout(() => setTxStatus(prev => ({ ...prev, show: false })), 3000);
      return;
    }

    setTxStatus({ show: true, loading: true, message: `Activating ${item.name}...`, success: false });

    // 1. Deduct from inventory
    const newInventory = { ...localInventory };
    newInventory[item.id] -= 1;
    if (newInventory[item.id] === 0) delete newInventory[item.id]; // Clean up empty items

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
      dbUpdates.last_energy = 1000;
      if (setEnergy) setEnergy(1000);
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

      setLocalInventory(newInventory);
      setDailyUsage(newDailyUsage);
      if (setStats) setStats({ ...stats, ...dbUpdates });

      setTxStatus({ show: true, loading: false, message: `⚡ ${item.name} is now ACTIVE!`, success: true });
      setTimeout(() => setTxStatus(prev => ({ ...prev, show: false })), 2000);

    } catch (err) {
      console.error("Activation Error:", err.message);
      setTxStatus({ show: true, loading: false, message: "❌ Failed to activate item.", success: false });
    }
  };

  // --- BACKPACK: only count real shop items (not wall/swap metadata keys) ---
  // inventory also stores wall_fee_progress, swap_unlocked, etc. — those must NOT inflate the Pack badge.
  const SHOP_ITEM_IDS = new Set(allItems.map((i) => i.id));
  const backpackItemCount = Object.entries(localInventory || {}).reduce((total, [key, qty]) => {
    if (!SHOP_ITEM_IDS.has(key)) return total;
    const n = Number(qty);
    return total + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
  const backpackItems = allItems.filter((item) => Number(localInventory[item.id]) > 0);
  const currentTodayStr = getTodayUTCString();

  return (
    <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', padding: '15px', paddingBottom: '120px', boxSizing: 'border-box' }}>
     
      {/* --- CUSTOM POP-UP MODAL --- */}
      {txStatus.show && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
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

      {/* Main Navigation Tabs */}
      <div style={{ display: 'flex', background: '#111', borderRadius: '12px', padding: '5px', marginBottom: '15px', fontSize: '11px', gap: 2 }}>
        <button onClick={() => setActiveTab('upgrades')} style={{ flex: 1, padding: '10px 2px', borderRadius: '10px', border: 'none', background: activeTab === 'upgrades' ? '#4ade80' : 'transparent', color: activeTab === 'upgrades' ? '#000' : '#888', fontWeight: 'bold' }}>Shards</button>
        <button onClick={() => setActiveTab('market')} style={{ flex: 1, padding: '10px 2px', borderRadius: '10px', border: 'none', background: activeTab === 'market' ? '#fbef43' : 'transparent', color: activeTab === 'market' ? '#000' : '#888', fontWeight: 'bold' }}>Boosts</button>
        <button onClick={() => setActiveTab('nft')} style={{ flex: 1, padding: '10px 2px', borderRadius: '10px', border: 'none', background: activeTab === 'nft' ? 'linear-gradient(90deg,#9945FF,#14F195)' : 'transparent', color: activeTab === 'nft' ? '#000' : '#888', fontWeight: 'bold' }}>NFTs</button>
        <button onClick={() => setActiveTab('inventory')} style={{ flex: 1, padding: '10px 2px', borderRadius: '10px', border: 'none', background: activeTab === 'inventory' ? '#9945FF' : 'transparent', color: activeTab === 'inventory' ? '#fff' : '#888', fontWeight: 'bold' }}>
          BackPack {backpackItemCount > 0 && <span style={{ color: activeTab === 'inventory' ? '#fff' : '#4ade80', marginLeft: '2px' }}>({backpackItemCount})</span>}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
       
        {/* --- TAB 1: SHARD SHOP --- */}
        {activeTab === 'upgrades' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {shardListings.map(item => {
             
              // 🚨 1. EXACT ID MATCHING FOR COOLDOWNS
              let isActive = false;
              const now = new Date();

              // Expanded Battery uses energy_boost_expires (not limit_boost / SOL contracts)
              if (item.id === 'battery' && stats.energy_boost_expires) {
                isActive = now < new Date(stats.energy_boost_expires);
              } else if (item.id === 'frenzy' && stats.frenzy_expires) {
                isActive = now < new Date(stats.frenzy_expires);
              } else if (item.id === 'heavy' && stats.efficiency_expires) {
                isActive = now < new Date(stats.efficiency_expires);
              }
              // 'refill' is ignored here because it is instant and has no cooldown timer!

              const canAfford = balance >= item.cost;
              const isDisabled = isActive || !canAfford;

              return (
                <div key={item.id} style={{ background: '#1c1e22', borderRadius: '15px', padding: '12px 15px', border: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <ShopItemIcon item={item} size={52} variant="row" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                      <h3 style={{ margin: 0, color: '#ffd700', fontSize: '16px' }}>{item.name}</h3>
                    </div>
                    <p style={{ margin: '0 0 4px 0', color: '#ccc', fontSize: '12px' }}>{item.desc}</p>
                    <span style={{ color: '#528db0', fontSize: '11px', fontWeight: 'bold' }}>⏱️ {item.duration}</span>
                  </div>
                 
                  <button
                    disabled={isDisabled}
                    style={{
                      background: isActive ? '#555' : (canAfford ? '#ffd700' : '#333'),
                      color: isActive ? '#fff' : (canAfford ? '#000' : '#666'),
                      border: 'none',
                      padding: '10px 15px',
                      borderRadius: '10px',
                      fontWeight: 'bold',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      marginLeft: '10px'
                    }}
                    onClick={() => {
                      if (isDisabled) return;
                      setItemToBuy(item);
                      setShowConfirmModal(true);
                    }}
                  >
                    {isActive ? 'Active' : (item.price ? 'Buy' : item.cost)}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* --- TAB 2: PREMIUM SOL BOOSTS (not NFTs) --- */}
        {activeTab === 'market' && (
          <>
            <p style={{ color: '#666', fontSize: 11, margin: '0 0 12px', textAlign: 'center' }}>
              Temporary boosts paid in SOL · NFTs live in the NFT tab
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

        {/* --- TAB: NFT MARKETPLACE (on-chain, separate from boosts) --- */}
        {activeTab === 'nft' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ color: '#fff', margin: '0 0 4px', fontSize: 16 }}>NFT Marketplace</h3>
              <p style={{ color: '#888', fontSize: 11, margin: 0, lineHeight: 1.4 }}>
                On-chain Metaplex Core · permanent · not a boost
              </p>
            </div>

            {nftListings.map((item) => (
              <div
                key={item.id}
                style={{
                  background: 'linear-gradient(145deg, #1a1525 0%, #111 50%, #0d1a18 100%)',
                  border: '1px solid #9945FF',
                  borderRadius: 16,
                  padding: 16,
                  boxShadow: '0 8px 24px rgba(153,69,255,0.15)',
                }}
              >
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: 96,
                      height: 96,
                      borderRadius: 12,
                      overflow: 'hidden',
                      background: '#222',
                      border: '1px solid #333',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 40,
                    }}
                  >
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      item.image
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#a78bfa', fontSize: 10, fontWeight: 'bold', letterSpacing: 0.5 }}>
                      {item.collection} · {item.rarity}
                    </div>
                    <h3 style={{ color: '#ffd700', margin: '4px 0 6px', fontSize: 18 }}>{item.name}</h3>
                    <div
                      style={{
                        background: 'rgba(20,241,149,0.12)',
                        border: '1px solid #14F195',
                        borderRadius: 8,
                        padding: '8px 10px',
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ color: '#14F195', fontSize: 11, fontWeight: 'bold', marginBottom: 2 }}>
                        🔓 Unlocks Shard Swap
                      </div>
                      <div style={{ color: '#ccc', fontSize: 11, lineHeight: 1.35 }}>
                        {item.boost}
                      </div>
                    </div>
                    {item.perks?.length > 0 && (
                      <ul
                        style={{
                          margin: '0 0 8px',
                          paddingLeft: 16,
                          color: '#aaa',
                          fontSize: 10,
                          lineHeight: 1.45,
                          textAlign: 'left',
                        }}
                      >
                        {item.perks.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    )}
                    <div style={{ color: '#888', fontSize: 10, marginBottom: 10 }}>
                      {item.duration}
                      <br />
                      Supply wave: {item.supply} · Max {item.maxPerWallet}/wallet
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div>
                        <div style={{ color: '#14F195', fontWeight: 'bold', fontSize: 18 }}>
                          {item.price} {item.currency}
                        </div>
                        <div style={{ color: '#666', fontSize: 10, marginTop: 2 }}>
                          + ~{LOCKSMITH_WAVE1.feeBufferSol} SOL fees
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!canAffordLocksmithMint || walletSolLoading}
                        onClick={() => {
                          if (!canAffordLocksmithMint) return;
                          setItemToBuy(item);
                          setShowConfirmModal(true);
                        }}
                        style={{
                          background: canAffordLocksmithMint
                            ? 'linear-gradient(90deg, #9945FF, #14F195)'
                            : '#333',
                          color: canAffordLocksmithMint ? '#000' : '#777',
                          border: 'none',
                          padding: '12px 20px',
                          borderRadius: 12,
                          fontWeight: 'bold',
                          fontSize: 13,
                          cursor: canAffordLocksmithMint ? 'pointer' : 'not-allowed',
                          opacity: walletSolLoading ? 0.7 : 1,
                        }}
                      >
                        {walletSolLoading
                          ? 'Checking SOL…'
                          : !walletUnlocked
                            ? 'Unlock wallet'
                            : !canAffordLocksmithMint
                              ? 'Need more SOL'
                              : 'Mint NFT'}
                      </button>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 11, color: '#888', lineHeight: 1.4 }}>
                      {walletSolLoading ? (
                        <span>Checking game wallet balance…</span>
                      ) : walletSol == null ? (
                        <span style={{ color: '#f59e0b' }}>
                          Could not read SOL balance. Open wallet and try again.
                        </span>
                      ) : canAffordLocksmithMint ? (
                        <span style={{ color: '#14F195' }}>
                          Game wallet: {walletSol.toFixed(4)} SOL · ready to mint
                        </span>
                      ) : (
                        <span style={{ color: '#f87171' }}>
                          Game wallet: {walletSol.toFixed(4)} SOL · need at least{' '}
                          {minMintSol.toFixed(2)} SOL ({item.price} mint + fees). Deposit SOL
                          first — mint stays off so you do not lose network fees.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <p style={{ color: '#555', fontSize: 10, textAlign: 'center', lineHeight: 1.4, margin: '4px 0 0' }}>
              Mints from your game wallet on Solana mainnet. Requires {minMintSol.toFixed(2)}+ SOL
              (0.25 mint + network/rent). After mint, open Wallet → Shard for better swap fees.
            </p>
          </div>
        )}

        {/* --- TAB 3: THE BACKPACK --- */}
        {activeTab === 'inventory' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {backpackItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#888' }}>
                <div style={{ fontSize: '48px', marginBottom: '15px' }}>🎒</div>
                <h3 style={{ color: '#fff', margin: '0 0 10px 0' }}>Backpack is Empty</h3>
                <p style={{ fontSize: '12px' }}>Visit the shop to purchase boosts and gear.</p>
              </div>
            ) : (
              backpackItems.map(item => {
                
                // NEW: Check if button should be disabled due to daily limit
                const isUsedToday = dailyUsage[item.id] === currentTodayStr;

                return (
                  <div key={item.id} style={{ background: '#1c1e22', borderRadius: '15px', padding: '12px 15px', border: '1px solid #9945FF', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <ShopItemIcon item={item} size={48} variant="row" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                        <h3 style={{ margin: 0, color: '#fff', fontSize: '16px' }}>{item.name}</h3>
                      </div>
                      <span style={{ color: '#888', fontSize: '11px', fontWeight: 'bold' }}>Owned: {localInventory[item.id]}</span>
                      {isUsedToday && <div style={{ color: '#ff4444', fontSize: '10px', marginTop: '4px' }}>Used Today</div>}
                    </div>
                    
                    {/* NEW: Disable button and update text if used today */}
                    <button
                      disabled={isUsedToday}
                      style={{ 
                        background: isUsedToday ? '#444' : '#9945FF', 
                        color: isUsedToday ? '#888' : '#fff', 
                        border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: 'bold', 
                        cursor: isUsedToday ? 'not-allowed' : 'pointer', marginLeft: '10px' 
                      }}
                      onClick={() => handleUseItem(item)}
                    >
                      {isUsedToday ? 'LIMIT REACHED' : 'USE'}
                    </button>
                  </div>
                )
              })
            )}
          </div>
        )}

      </div>

      {/* --- ADD THIS AT THE BOTTOM OF MARKETPLACE.JSX --- */}
      {showConfirmModal && itemToBuy && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}>
          <div style={{ background: '#1c1e22', padding: '25px', borderRadius: '15px', border: '2px solid #ffd700', textAlign: 'center', width: '80%', maxWidth: '320px' }}>
            <h3 style={{ color: '#fff', marginTop: 0 }}>Confirm Purchase?</h3>
            <p style={{ color: '#ccc', fontSize: '14px' }}>
              {itemToBuy.isNftMint || itemToBuy.id === 'locksmith' ? (
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
                disabled={
                  (itemToBuy.isNftMint || itemToBuy.id === 'locksmith') &&
                  !canAffordLocksmithMint
                }
                onClick={() => {
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
                    handlePremiumBuy(itemToBuy); // Triggers SOL transaction
                  } else {
                    handleShardBuy(itemToBuy); // Triggers Shard purchase
                  }
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  background:
                    (itemToBuy.isNftMint || itemToBuy.id === 'locksmith') &&
                    !canAffordLocksmithMint
                      ? '#444'
                      : '#4ade80',
                  color:
                    (itemToBuy.isNftMint || itemToBuy.id === 'locksmith') &&
                    !canAffordLocksmithMint
                      ? '#888'
                      : '#000',
                  borderRadius: '10px',
                  border: 'none',
                  fontWeight: 'bold',
                  cursor:
                    (itemToBuy.isNftMint || itemToBuy.id === 'locksmith') &&
                    !canAffordLocksmithMint
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                {itemToBuy.isNftMint
                  ? canAffordLocksmithMint
                    ? 'Mint NFT'
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