import { Buffer } from 'buffer';

if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
  window.global = window;
}
import React, { useMemo, useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { ConnectionProvider, WalletProvider, useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
  SolanaMobileWalletAdapter,
  createDefaultAddressSelector,
  createDefaultAuthorizationResultCache,
  createDefaultWalletNotFoundHandler,
} from '@solana-mobile/wallet-adapter-mobile';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import * as splToken from "@solana/spl-token";
import { clusterApiUrl, PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { Toaster, toast } from 'react-hot-toast';
import DailyGiftBox from './DailyGiftBox';
import WalletHub from './WalletHub';
import VaultPage from './VaultPage';
import LegalPage from './LegalPage';
import RoadmapPage from './RoadmapPage';
import AirdropPage from './AirdropPage';
import { getPlayerId, isLoggedIn } from './playerIdentity';
import { SOCIAL_LINKS } from './socialLinks';
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
  // Mainnet for wallets, staking UI, and Solscan links. Prefer paid RPC when set.
  const endpoint = useMemo(
    () =>
      import.meta.env.VITE_SOLANA_RPC_URL ||
      clusterApiUrl('mainnet-beta'),
    [],
  );

  // Explicit MWA + Phantom/Solflare. registerMwa (main.jsx) also registers standard MWA on HTTPS.
  const wallets = useMemo(() => {
    const list = [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ];
    // Always include MWA adapter (Unsupported platforms filter it out of the UI).
    if (typeof window !== 'undefined') {
      list.unshift(
        new SolanaMobileWalletAdapter({
          addressSelector: createDefaultAddressSelector(),
          appIdentity: {
            name: 'Gift2U',
            uri: window.location.origin,
            icon: '/Gift2u_logo.png',
          },
          authorizationResultCache: createDefaultAuthorizationResultCache(),
          cluster: 'mainnet-beta',
          onWalletNotFound: createDefaultWalletNotFoundHandler(),
        }),
      );
    }
    return list;
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
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
                {/* On-chain G2U staking (Solana Playground program) */}
                <Route path="/stake" element={<StakingPage />} />
                {/* Off-chain G2U credit vault — GiftLocksmith NFT holders */}
                <Route path="/vault" element={<VaultPage />} />
                <Route path="/roadmap" element={<RoadmapPage />} />
                <Route path="/airdrop" element={<AirdropPage />} />
                <Route path="/terms" element={<LegalPage kind="terms" />} />
                <Route path="/privacy" element={<LegalPage kind="privacy" />} />
                <Route path="/legal/terms" element={<LegalPage kind="terms" />} />
                <Route path="/legal/privacy" element={<LegalPage kind="privacy" />} />
              </Routes>
              <SiteFooter />
            </div>
          </Router>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}


const SiteFooter = () => {
  const location = useLocation();
  if (location.pathname.startsWith('/play')) return null;
  return (
    <footer className="w-full border-t border-white/10 bg-slate-950/80 mt-auto">
      <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-400">
        <Link to="/terms" className="hover:text-purple-300 font-semibold">
          Terms of Use
        </Link>
        <Link to="/privacy" className="hover:text-purple-300 font-semibold">
          Privacy Policy
        </Link>
        <Link to="/roadmap" className="hover:text-yellow-300 font-semibold">
          Roadmap
        </Link>
        <Link to="/airdrop" className="hover:text-yellow-300 font-semibold">
          G2U Airdrop
        </Link>
        <Link to="/play" className="hover:text-yellow-300 font-semibold">
          Play Gift Tap
        </Link>
        <a
          href="https://gift2u.fun"
          className="hover:text-slate-200"
        >
          gift2u.fun
        </a>
        <span className="hidden sm:inline text-slate-600">|</span>
        {SOCIAL_LINKS.map((s) => (
          <a
            key={s.id}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white font-semibold inline-flex items-center gap-1.5"
          >
            <span aria-hidden>{s.glyph}</span>
            {s.label}
          </a>
        ))}
      </div>
    </footer>
  );
};

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
            <Link to="/stake" className="hover:text-purple-400 font-bold whitespace-nowrap">Stake</Link>
            <Link to="/vault" className="hover:text-purple-400 font-bold whitespace-nowrap">Vault</Link>
            <Link to="/airdrop" className="hover:text-yellow-300 font-bold whitespace-nowrap">
              <span className="sm:hidden">Airdrop</span>
              <span className="hidden sm:inline">G2U Airdrop</span>
            </Link>
            <Link to="/play" className="hover:text-purple-400 font-bold text-yellow-400 whitespace-nowrap">
              <span className="sm:hidden">Play</span>
              <span className="hidden sm:inline">Play Game</span>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3">
              {SOCIAL_LINKS.map((s) => (
                <a
                  key={s.id}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={s.label}
                  aria-label={s.label}
                  className="hover:opacity-90 text-base sm:text-lg font-bold whitespace-nowrap"
                  style={{ color: s.color }}
                >
                  <span className="sm:hidden">{s.glyph}</span>
                  <span className="hidden sm:inline">{s.glyph} {s.label}</span>
                </a>
              ))}
            </div>
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
  const { publicKey, connected } = useWallet();
  const [walletHubOpen, setWalletHubOpen] = useState(false);

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
                    href={`https://solscan.io/tx/${signature}`}
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

  const card =
    'rounded-2xl border border-white/10 bg-slate-900/80 p-5 sm:p-6 shadow-xl';

  // Mirror vault metrics: liquid / staked principal / APY / pending rewards
  const liquidGft = parseFloat(balance) || 0;
  let stakedPrincipal = 0;
  try {
    if (stakeAccountData?.amount) {
      stakedPrincipal = stakeAccountData.amount.toNumber() / 1e9;
    }
  } catch {
    stakedPrincipal = 0;
  }
  const pendingRewards = Math.max(0, (stakedDisplay || 0) - stakedPrincipal);
  const shortAddr = publicKey
    ? `${publicKey.toBase58().slice(0, 6)}…${publicKey.toBase58().slice(-6)}`
    : '';
  const isConnected = !!(connected && publicKey);

  const handleClaimRewards = () => {
    if (pendingRewards <= 0) {
      return toast.error('No pending rewards yet. Stake G2U to start earning.');
    }
    // On-chain program auto-compounds into principal — no separate claim ix
    toast.success(
      `~${pendingRewards.toLocaleString(undefined, { maximumFractionDigits: 6 })} G2U already compounding into your staked balance.`,
    );
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] w-full bg-slate-950 text-white px-4 py-8 sm:px-6">
      <WalletHub
        isOpen={walletHubOpen}
        onClose={() => {
          setWalletHubOpen(false);
          fetchBalance();
          fetchStakeAccount();
          fetchTVL();
        }}
        defaultTab="solana"
        overlayStyle={{ zIndex: 100000 }}
        useSharedGameWallet
      />

      <div className="mx-auto max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-purple-400">
            Gift2u · Main site
          </p>
          <h1 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-yellow-300">
            G2U Staking
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Stake on-chain G2U for yield. All G2U holders earn{' '}
            <span className="text-yellow-400 font-bold">{apy}% APY</span>
            . Deposit from your Solana wallet token balance.
          </p>
        </div>

        {/* Access card — same slot as vault Locksmith card */}
        <div
          className={
            card + (isConnected ? ' border-purple-500/40' : ' border-amber-500/30')
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase">Access</p>
              <p className="text-lg font-bold mt-1">
                {isConnected ? (
                  <span className="text-purple-300">Wallet connected</span>
                ) : (
                  <span className="text-amber-300">Wallet required</span>
                )}
              </p>
              <p className="text-xs text-slate-500 mt-1 break-all">
                {shortAddr || 'Connect Phantom / Solflare / Seeker to stake'}
              </p>
            </div>
            <img
              src="/Gift2u_logo.png"
              alt=""
              className="w-12 h-12 object-contain opacity-90"
            />
          </div>
          {!isConnected && (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-slate-300">
                Connect a Solana wallet that holds G2U to deposit into on-chain staking.
              </p>
              <button
                type="button"
                onClick={() => setWalletHubOpen(true)}
                className="w-full rounded-xl bg-purple-600 hover:bg-purple-500 font-bold py-3"
              >
                Connect wallet
              </button>
            </div>
          )}
        </div>

        {/* Stats — identical labels/order to Vault */}
        <div className="grid grid-cols-2 gap-3">
          <div className={card}>
            <p className="text-xs text-slate-500">Liquid G2U</p>
            <p className="text-2xl font-black text-sky-300 mt-1">
              {liquidGft.toLocaleString(undefined, { maximumFractionDigits: 4 })}
            </p>
          </div>
          <div className={card}>
            <p className="text-xs text-slate-500">Staked</p>
            <p className="text-2xl font-black text-yellow-300 mt-1">
              {stakedPrincipal.toLocaleString(undefined, { maximumFractionDigits: 4 })}
            </p>
          </div>
          <div className={card}>
            <p className="text-xs text-slate-500">Your APY</p>
            <p className="text-2xl font-black text-purple-300 mt-1">{apy}%</p>
          </div>
          <div className={card}>
            <p className="text-xs text-slate-500">Pending rewards</p>
            <p className="text-2xl font-black text-emerald-300 mt-1">
              {pendingRewards.toLocaleString(undefined, { maximumFractionDigits: 6 })}
            </p>
          </div>
        </div>

        {/* Actions — Deposit / Withdraw / Claim like Vault */}
        <div className={card + ' space-y-4'}>
          <label className="block text-xs font-bold text-slate-400 uppercase">
            Amount (G2U)
          </label>
          <input
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            disabled={!isConnected}
            className="w-full rounded-xl bg-black/50 border border-white/15 px-4 py-3 text-lg font-bold text-white outline-none focus:border-purple-400 disabled:opacity-50"
          />
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              className="text-purple-400 font-bold disabled:opacity-40"
              disabled={!isConnected}
              onClick={() => setAmount(String(liquidGft))}
            >
              Max liquid
            </button>
            <span className="text-slate-600">·</span>
            <button
              type="button"
              className="text-yellow-400 font-bold disabled:opacity-40"
              disabled={!isConnected}
              onClick={() =>
                setAmount(
                  stakedPrincipal > 0
                    ? String(Math.floor(stakedPrincipal * 1e6) / 1e6)
                    : '0',
                )
              }
            >
              Max staked
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!isConnected}
              onClick={handleStake}
              className="rounded-xl bg-gradient-to-r from-purple-600 to-violet-500 font-bold py-3 disabled:opacity-40"
            >
              Deposit
            </button>
            <button
              type="button"
              disabled={!isConnected || stakedPrincipal <= 0}
              onClick={handleUnstake}
              className="rounded-xl bg-slate-700 hover:bg-slate-600 font-bold py-3 disabled:opacity-40"
            >
              Withdraw
            </button>
          </div>
          <button
            type="button"
            disabled={!isConnected || pendingRewards <= 0}
            onClick={handleClaimRewards}
            className="w-full rounded-xl border border-emerald-500/50 text-emerald-300 font-bold py-3 disabled:opacity-40"
          >
            Claim rewards → liquid G2U
          </button>
          <p className="text-[11px] text-slate-500 text-center leading-relaxed">
            Pending rewards auto-compound into <span className="text-slate-400">Staked</span> on-chain.
            Claim shows live accrual; unstake (Withdraw) returns principal + compounded yield to liquid.
          </p>
        </div>

        <p className="text-center text-sm text-slate-400">
          Looking for Locksmith credit yield?{' '}
          <Link to="/vault" className="text-yellow-400 font-bold hover:underline">
            Open Vault →
          </Link>
        </p>
        <p className="text-center text-xs text-slate-500 leading-relaxed px-2">
          On-chain SPL G2U · TVL {(tvl || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} G2U
          in protocol. Confirm txs in your wallet. Rates may change — see Terms.
        </p>
      </div>
    </div>
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
      
      <div className="mt-10 flex flex-col sm:flex-row gap-4 items-center justify-center">
        <Link to="/stake" className="bg-purple-600 hover:bg-purple-700 px-10 py-4 rounded-full font-black text-lg inline-block">
          STAKE G2U
        </Link>
        <Link to="/vault" className="bg-slate-700 hover:bg-slate-600 border border-yellow-500/40 px-10 py-4 rounded-full font-black text-lg inline-block">
          LOCKSMITH VAULT
        </Link>
      </div>
      <p className="mt-4 text-sm text-slate-400 max-w-md">
        <span className="text-purple-300 font-bold">Stake</span> = on-chain G2U for all holders ·{" "}
        <span className="text-yellow-300 font-bold">Vault</span> = credit yield for GiftLocksmith NFTs
      </p>
      <p className="mt-6 text-sm text-slate-500">
        <Link to="/roadmap" className="text-purple-400 hover:text-purple-300 font-bold underline-offset-2 hover:underline">
          See our roadmap →
        </Link>
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        {SOCIAL_LINKS.map((s) => (
          <a
            key={s.id}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-bold hover:bg-white/10 transition"
            style={{ color: s.color }}
          >
            <span aria-hidden>{s.glyph}</span>
            {s.label}
          </a>
        ))}
      </div>
    </main>
  );
};
