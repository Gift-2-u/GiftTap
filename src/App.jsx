import { Buffer } from 'buffer';

if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
  window.global = window;
  // Force clean Solana wallet selection every load (fixes stuck Base / Coinbase / Connect icon)
  try {
    ['walletName', 'gift2u_solana_wallet', 'walletAdapter', 'SolanaWalletName'].forEach((k) => {
      localStorage.removeItem(k);
    });
  } catch (_) {}
}
import React, { useMemo, useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { ConnectionProvider, WalletProvider, useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
// Standard adapters. Wallet Standard wallets (Backpack, Glow, …) appear automatically.
// Mobile Wallet Adapter is auto-added by WalletProvider.
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { CoinbaseWalletAdapter } from '@solana/wallet-adapter-coinbase';
import { LedgerWalletAdapter } from '@solana/wallet-adapter-ledger';
import { TrustWalletAdapter } from '@solana/wallet-adapter-trust';
import { TorusWalletAdapter } from '@solana/wallet-adapter-torus';
import { NightlyWalletAdapter } from '@solana/wallet-adapter-nightly';
import { MathWalletAdapter } from '@solana/wallet-adapter-mathwallet';
import { TokenPocketWalletAdapter } from '@solana/wallet-adapter-tokenpocket';
import { BitgetWalletAdapter } from '@solana/wallet-adapter-bitkeep';
import { CloverWalletAdapter } from '@solana/wallet-adapter-clover';
import { Coin98WalletAdapter } from '@solana/wallet-adapter-coin98';
import { SafePalWalletAdapter } from '@solana/wallet-adapter-safepal';
import * as splToken from "@solana/spl-token";
import { clusterApiUrl, PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { Toaster, toast } from 'react-hot-toast';
import DailyGiftBox from './DailyGiftBox';
import WalletHub from './WalletHub';
import { getPlayerId, isLoggedIn } from './playerIdentity';
import idl from "../target/idl/gift_staking.json";
import '@solana/wallet-adapter-react-ui/styles.css';

// Lazy-load game so homepage can load without pulling the full game first
const TapGame = lazy(() => import('./GiftTap'));

// --- CONSTANTS ---
const PROGRAM_ID = new PublicKey("CX5aqenEeWvfwvhF8Xek8Dd6sVPn8uHRhXafbKQvUAxy");
const MINT_ADDRESS = new PublicKey("3UL9MdHnmtAh6KBdDwLtyxFWVEgGQHLiwN2cg3FPWEis");

const [vaultAuthority] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault")],
  PROGRAM_ID // Your '8pWy3...' address
);

// --- MAIN WRAPPER ---
export default function App() {
  // Site staking IDL is still wired for devnet; Standard wallets still connect on any cluster.
  const endpoint = useMemo(() => clusterApiUrl('devnet'), []);

  // Solana-only adapters (no Coinbase — it can stick as "Base" multi-chain).
  // Backpack & others still appear via Wallet Standard when injected.
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new TrustWalletAdapter(),
      new LedgerWalletAdapter(),
    ],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false} localStorageKey="walletName">
        <WalletModalProvider>
          <Router>
            <Toaster position="bottom-right" /> {/* Added this */}
            <div className="min-h-screen w-full bg-slate-900 text-white font-sans flex flex-col">
              <Navigation />
              <Routes>
                {/* Site home = marketing page; game only at /play */}
                <Route path="/" element={<HomePage />} />
                <Route path="/home" element={<HomePage />} />
                <Route
                  path="/play"
                  element={
                    <Suspense fallback={<div className="min-h-screen bg-black text-white flex items-center justify-center">Loading game…</div>}>
                      <TapGame />
                    </Suspense>
                  }
                />
                <Route path="/stake" element={<StakingPage />} />
              </Routes>
            </div>
          </Router>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

const Navigation = () => {
  const location = useLocation();
  const { publicKey, connected } = useWallet();
  const [walletHubOpen, setWalletHubOpen] = useState(false);
  const gameLoggedIn = typeof window !== 'undefined' && isLoggedIn() && !!getPlayerId();

  // Full-screen game: hide site chrome only on /play
  if (location.pathname.startsWith('/play')) {
    return null;
  }

  // Prefer showing Solana short addr if connected; else "Game" if Gift Tap session exists
  const shortSol =
    connected && publicKey
      ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
      : null;
  const walletLabel = shortSol
    ? `Wallet ${shortSol}`
    : gameLoggedIn
      ? 'Wallet · Game'
      : 'Wallet';

  return (
    <>
      <nav className="sticky top-0 z-50 w-full max-w-full border-b border-white/10 bg-slate-800/50 backdrop-blur-md overflow-x-hidden">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-3 sm:px-6 sm:py-4">
          <Link
            to="/"
            className="text-xl sm:text-3xl font-black text-purple-500 italic shrink-0"
          >
            GIFT2U
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 sm:gap-6 text-sm sm:text-base min-w-0">
            <Link to="/" className="hover:text-purple-400 font-bold whitespace-nowrap">Home</Link>
            <Link to="/stake" className="hover:text-purple-400 font-bold whitespace-nowrap">Staking</Link>
            <Link to="/play" className="hover:text-purple-400 font-bold text-yellow-400 whitespace-nowrap">
              <span className="sm:hidden">Play</span>
              <span className="hidden sm:inline">Play Game</span>
            </Link>
            <button
              type="button"
              onClick={() => setWalletHubOpen(true)}
              className="site-header-wallet-btn shrink-0 rounded-full px-3 py-2 text-xs sm:text-sm font-bold border border-purple-400/40"
              style={{
                background: '#7c3aed',
                color: '#ffffff',
                cursor: 'pointer',
              }}
            >
              {walletLabel}
            </button>
          </div>
        </div>
      </nav>

      {/* Same hub as the game: Game tab = real Gift Tap wallet; Solana tab = Phantom etc. */}
      <WalletHub
        isOpen={walletHubOpen}
        onClose={() => setWalletHubOpen(false)}
        defaultTab="game"
        overlayStyle={{ zIndex: 100000 }}
        useSharedGameWallet
      />
    </>
  );
};

const StakingPage = () => {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();

  const [tvl, setTvl] = useState(0); // Ensure this is its own line
  const [stakeAccountData, setStakeAccountData] = useState(null);
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState("0");
  const [stakedDisplay, setStakedDisplay] = useState(0);
  const [apy, setApy] = useState(10); // Set your desired APY here

  const pdas = useMemo(() => {
    try {
      const [vaultAuth] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault")],
        PROGRAM_ID
      );
      const vaultToken = splToken.getAssociatedTokenAddressSync(
        MINT_ADDRESS,
        vaultAuth,
        true
      );

      console.log("Calculated Vault Auth:", vaultAuth.toBase58());
      console.log("Calculated Vault Token:", vaultToken.toBase58());

      return { vaultAuth, vaultToken };
    } catch (e) {
      return { vaultAuth: null, vaultToken: null };
    }
  }, []);

  const userAta = useMemo(() => {
    if (!publicKey) return null;
    return splToken.getAssociatedTokenAddressSync(MINT_ADDRESS, publicKey);
  }, [publicKey]);

  // 1. Define fetchBalance first using useCallback
  const fetchBalance = useCallback(async () => {
    if (!connection || !userAta) return;
    try {
      const info = await connection.getTokenAccountBalance(userAta);
      setBalance(info.value.uiAmountString || "0");
    } catch (e) {
      console.error("Failed to fetch balance", e);
      setBalance("0");
    }
  }, [connection, userAta]);

  const fetchStakeAccount = useCallback(async () => {
    if (!wallet?.publicKey || !connection) return;
    try {
        // Derive the PDA or use your known address
        const stakeAccountPda = new PublicKey("3ETvqE9TwjYAStMa9uEo74KZuEpLBGPi6YLj9X3JzLz8");

        console.log("Derived Stake PDA:", stakeAccountPda.toBase58());

        // This fetches the actual data structure (StakeInfo) from the blockchain
        const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
        const program = new Program(idl, provider);
        const data = await program.account.stakeInfo.fetch(stakeAccountPda);
        setStakeAccountData(data);
        console.log("Stake Account Data Fetched:", data);
    } catch (err) {
        console.log("Stake account probably not initialized yet.");
        setStakeAccountData(null);
    }
  }, [wallet, connection]);

  const fetchTVL = useCallback(async () => {
      if (!connection) return;
      try {
          // This is your Vault Token Account address from earlier
          const vaultPublicKey = new PublicKey("6BYCd59YbXVawaurM6FE7BVugH7tuyNTS7hj8F6QMDWk");
          const info = await connection.getTokenAccountBalance(vaultPublicKey);
         
          // uiAmount is the "human readable" balance (not lamports)
          setTvl(info.value.uiAmount || 0);
      } catch (e) {
          console.error("Failed to fetch TVL", e);
      }
  }, [connection]);

  // 2. Then use it in useEffect for the initial load
  useEffect(() => {
    // 1. Fetch the balance immediately on load
    fetchBalance();
    fetchStakeAccount(); // Add this here!
    fetchTVL(); // Don't forget the TVL!

    if (!connection || !userAta) return;

    // 2. Set up the "listener" for future changes
    const subscriptionId = connection.onAccountChange(
      userAta,
      (accountInfo) => {
        console.log("Account changed! Refreshing balance...");
        fetchBalance();
        fetchStakeAccount(); // Also refresh stake data when wallet changes
        fetchTVL();
      },
      "confirmed"
    );

    return () => {
      connection.removeAccountChangeListener(subscriptionId);
    };
  }, [connection, userAta, fetchBalance, fetchStakeAccount, fetchTVL]);

  // NEW EFFECT (The "Ticker" for Staked Balance + Rewards)
  useEffect(() => {
      console.log("Ticker Heartbeat - Stake Data:", stakeAccountData); // Add this!
      if (!stakeAccountData || !stakeAccountData.amount) {
        setStakedDisplay(0);
        return;
      }
      const ticker = setInterval(() => {
          const now = Date.now() / 1000;
         
          // Convert Anchor BN to numbers
          const decimals = 9;
          const baseAmount = stakeAccountData.amount.toNumber() / Math.pow(10, decimals);
          const lastUpdate = stakeAccountData.lastUpdateTs.toNumber();
         
          const secondsElapsed = Math.max(0, now - lastUpdate);
         
          // Math: (Amount * APY_as_decimal) / Seconds_in_Year
          const earningsPerSecond = (baseAmount * (apy / 100)) / 31536000;
          const totalLive = baseAmount + (earningsPerSecond * secondsElapsed);

          setStakedDisplay(totalLive);
      }, 50);

      return () => clearInterval(ticker);
  }, [stakeAccountData, apy]);

  const handleStake = async () => {
      try {
          // 1. Validate Wallet
          if (!wallet || !wallet.publicKey) {
              return toast.error("Wallet not connected properly!");
          }

          // 3. Build Provider
          const provider = new AnchorProvider(
              connection,
              wallet,
              { preflightCommitment: "processed" }
          );

          // 🔥 CRITICAL PATCH FOR BROWSER ANCHOR
          if (!idl.address) {
          idl.address = idl.metadata?.address;
          }

          // 4. Initialize Program (This is where your error was)
          const program = new Program(idl, provider);
          // 5. Convert Amount
          if (!amount || isNaN(amount)) return toast.error("Enter a valid amount");
          const amountBN = new BN(Math.floor(parseFloat(amount) * 10 ** 9).toString());

          // ... after your amountBN calculation ...

          console.log("Program initialized successfully. Calculating PDAs...");

          // 1. Derive the Global Vault Authority (Manager)
          // This is the "5Fujf1A..." address your program uses to control the vault
          const [vaultAuthorityPDA] = PublicKey.findProgramAddressSync(
              [Buffer.from("vault")],
              PROGRAM_ID
          );

          // 2. Derive the User's specific Stake Account
          // This is unique to the person clicking the button
          const [stakeAccountPDA] = PublicKey.findProgramAddressSync(
              [Buffer.from("stake"), wallet.publicKey.toBuffer()],
              PROGRAM_ID
          );

          // 3. Define the Global Vault Token Account (The Safe)
          const vaultTokenAccount = new PublicKey("6BYCd59YbXVawaurM6FE7BVugH7tuyNTS7hj8F6QMDWk");

          console.log("Vault Authority PDA:", vaultAuthorityPDA.toBase58());
          console.log("User Stake PDA:", stakeAccountPDA.toBase58());

          // Now when you call .accounts({ ... }), both PDAs are defined and ready!

          // ... rest of your RPC call
          const tx = await toast.promise(
            (async () => {
              const signature = await program.methods
                .stake(amountBN)
                .accounts({
                  user: wallet.publicKey,
                  userTokenAccount: userAta,
                  vaultAuthority: vaultAuthorityPDA,
                  vaultTokenAccount: vaultTokenAccount,
                  stakeAccount: stakeAccountPDA,
                  systemProgram: SystemProgram.programId,
                  tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
                })
                .rpc();
             
              await connection.confirmTransaction(signature, "confirmed");
              return signature;
            })(),

            {
              loading: 'Processing stake...',
              success: (signature) => (
                <span>
                  Stake successful! <br />
                  <a
                    href={`https://solscan.io/tx/${signature}?cluster=devnet`}
                    target="_blank"
                    className="underline text-xs"
                  >
                    View on Solscan
                  </a>
                </span>
              ),
              error: (err) => `Stake failed: ${err.message}`,
            }
          );

          await new Promise(res => setTimeout(res, 1000));
          await fetchBalance();
          setAmount("");

      } catch (err) {
          console.error("STAKE ERROR:", err);
          alert("CRITICAL ERROR: " + err.message);
      }
  };

  // --- ADDED UNSTAKE LOGIC ---
  const handleUnstake = async () => {
    if (!wallet || !userAta) return toast.error("Connect Wallet!");
    const provider = new AnchorProvider(connection, wallet, { preflightCommitment: "processed" });

    // 🔥 CRITICAL PATCH FOR BROWSER ANCHOR
    if (!idl.address) {
      idl.address = idl.metadata?.address;
    }

    const program = new Program(idl, provider);

    const vaultAuthorityPDA = new PublicKey("BiC9NrLP53gmGm4nc5dYv8zXc7e6sJKkJxJAVGxGqAyv");

    try {
      // 1. Re-derive the PDAs exactly like you did in handleStake
      const [vaultAuthorityPDA, vaultBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault")],
        PROGRAM_ID
      );

      const [stakeAccountPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("stake"), wallet.publicKey.toBuffer()],
        PROGRAM_ID
      );

      // 2. NOW FETCH (This will now work because stakeAccountPDA is defined)
      const stakeData = await program.account.stakeInfo.fetch(stakeAccountPDA);
      console.log("ACTUAL STAKED AMOUNT ON-CHAIN:", stakeData.amount.toString());
      // This must match the address in handleStake
      const vaultTokenAccount = new PublicKey("6BYCd59YbXVawaurM6FE7BVugH7tuyNTS7hj8F6QMDWk");

      // 2. Use the toast wrapper
      const tx = await toast.promise(
        (async () => {
          // 1. Calculate amount correctly (assuming 9 decimals)
          const amountBN = new BN(Math.floor(parseFloat(amount) * 10 ** 9).toString());

          // 2. Call RPC and capture the string result
          const txSignature = await program.methods
            .unstake(amountBN)
            .accounts({
                user: wallet.publicKey,
                userTokenAccount: userAta,
                vaultTokenAccount: new PublicKey("6BYCd59YbXVawaurM6FE7BVugH7tuyNTS7hj8F6QMDWk"),
                stakeAccount: new PublicKey("3ETvqE9TwjYAStMa9uEo74KZuEpLBGPi6YLj9X3JzLz8"),
                vaultAuthority: vaultAuthorityPDA,
                tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
            })
            .rpc();
         
          console.log("Unstake Tx Sent:", txSignature);

          // 3. Confirm the transaction using the captured signature
          const latestBlockhash = await connection.getLatestBlockhash();
          await connection.confirmTransaction({
            signature: txSignature,
            ...latestBlockhash
          }, "confirmed");

          return txSignature;
        })(),
        {
          loading: 'Unstaking...',
          success: 'Tokens returned successfully!',
          error: 'Unstake failed.',
        }
      );
     
      await fetchBalance();
      setAmount("");
    } catch (err) {
      console.error("Unstake Error:", err);
      alert("Unstake failed. Check console.");
    }
  };

  return (
    <main className="w-full min-h-screen px-6 py-20 flex flex-col items-center">
      {/* TVL Header */}
      <div className="flex flex-col items-center mb-10">
          <p className="text-gray-500 text-xs font-black uppercase tracking-[0.3em] mb-2">Total Value Locked</p>
          <h2 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-green-400">
              ${(tvl || 0).toLocaleString()} <span className="text-lg text-gray-600 font-medium">GFT</span>
          </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 items-stretch">
        {/* Box 1, 2, and 3 stay centered as we designed... */}
      </div>
      <div className="bg-white/5 p-10 rounded-[32px] border border-white/10 text-center max-w-l w-full">
        <h2 className="text-4xl font-black mb-4 italic">STAKING VAULT</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 items-stretch">
 
          {/* Box 1: Wallet Balance */}
          <div className="relative group p-6 bg-gray-900/50 border border-gray-800 rounded-2xl backdrop-blur-sm transition-all hover:border-blue-500/50 flex flex-col items-center justify-center min-h-[160px]">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-600 rounded-full text-[10px] font-bold tracking-widest uppercase">
              Available
            </div>
            <p className="text-gray-400 text-sm font-medium mb-2 text-center">Wallet Balance</p>
            <div className="flex flex-col items-center gap-1">
              <span className="text-3xl font-bold text-white leading-none">
                {(parseFloat(balance) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
              <span className="text-blue-900 text-[10px] font-black uppercase tracking-widest mt-1">GFT TOKENS</span>
            </div>
          </div>

          {/* Box 2: Staked + Rewards (The Reference Box) */}
          <div className="relative group p-6 bg-gray-900/50 border border-green-900/30 rounded-2xl backdrop-blur-sm transition-all hover:border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.05)] flex flex-col items-center justify-center min-h-[160px]">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-green-600 rounded-full text-[10px] font-bold tracking-widest uppercase animate-pulse whitespace-nowrap">
              Live Yield
            </div>
            <p className="text-gray-400 text-sm font-medium mb-2 text-center">Staked + Rewards</p>
            <div className="flex flex-col items-center gap-1">
              <span className="text-4xl font-mono font-bold text-green-400 leading-none tracking-tight">
                {stakedDisplay > 0 ? stakedDisplay.toFixed(7) : "0.0000000"}
              </span>
              <span className="text-green-900 text-[10px] font-black uppercase tracking-widest mt-1">GFT TOKENS</span>
            </div>
            <div className="mt-4 flex items-center gap-2 bg-green-500/10 px-3 py-1 rounded-full border border-green-500/20">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping"></div>
              <span className="text-[9px] text-green-500 font-bold uppercase tracking-tighter">Auto-compounding live</span>
            </div>
          </div>

          {/* Box 3: Current APY */}
          <div className="relative group p-6 bg-gray-900/50 border border-gray-800 rounded-2xl backdrop-blur-sm transition-all hover:border-purple-500/50 flex flex-col items-center justify-center min-h-[160px]">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-purple-600 rounded-full text-[10px] font-bold tracking-widest uppercase">
              Incentive
            </div>
            <p className="text-gray-400 text-sm font-medium mb-2 text-center">Current APY</p>
            <div className="flex flex-col items-center gap-1">
              <span className="text-4xl font-bold text-white leading-none">{apy}%</span>
              <span className="text-purple-900 text-[10px] font-black uppercase tracking-widest mt-1">Fixed Rate</span>
            </div>
            <p className="mt-3 text-[10px] text-gray-500 text-center leading-tight max-w-[150px]">
              Calculated per-second and added to principal.
            </p>
          </div>

        </div>    
        <input
          type="number"
          className="w-full bg-slate-800 border border-white/10 p-4 rounded-xl mb-6 text-white"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
        />
        <div className="flex gap-4">
            <button onClick={handleStake} className="flex-1 bg-purple-600 hover:bg-purple-700 py-3 rounded-xl font-bold">
            STAKE
            </button>
            <button onClick={handleUnstake} className="flex-1 bg-slate-700 hover:bg-slate-600 py-3 rounded-xl font-bold">
            UNSTAKE
            </button>
        </div>
      </div>
    </main>
  );
};

const HomePage = () => {
  const { connection } = useConnection();
  const wallet = useWallet();

  return (
    <main className="w-full flex-grow flex flex-col items-center py-12 sm:py-20 px-4 sm:px-6 text-center overflow-x-hidden">
      <h2 className="text-3xl sm:text-5xl md:text-6xl font-black mb-6 bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent italic leading-tight max-w-full">
        THE GIFT THAT KEEPS GIVING
      </h2>
      
      {/* If this tag is missing, the box will never show up */}
      <DailyGiftBox wallet={wallet} connection={connection} />
      
      <Link to="/stake" className="bg-purple-600 hover:bg-purple-700 px-10 py-4 rounded-full font-black text-lg inline-block mt-10">
        GO TO STAKING VAULT
      </Link>
    </main>
  );
};
