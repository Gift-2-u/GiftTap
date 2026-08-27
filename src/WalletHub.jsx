import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton, useWalletModal } from '@solana/wallet-adapter-react-ui';
import { SolanaMobileWalletAdapterWalletName } from '@solana-mobile/wallet-standard-mobile';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { MINT_ADDRESS } from './config';
import { RPC_URL as MAINNET_RPC } from './gameWalletActions';
import { supabase } from './supabaseClient';
import {
  DB_PLAYER_ID,
  applyAuthSession,
  getPlayerId,
  getPlayerProfile,
  isLoggedIn,
} from './playerIdentity';
import AuthScreen from './AuthScreen';
import { keypairFromMnemonic } from './solanaWallet';
import WalletNftSection from './WalletNftSection';
import TokenBalanceList from './TokenBalanceList';
import { fetchFiatRates } from './fiatPrices';
import GameWalletActionModals from './GameWalletActionModals';
import AppNotice from './AppNotice';
import ClaimG2uPanel from './ClaimG2uPanel';
import { isSeekerShell } from './adService';

/** Tokens shown on Solana tab — same set as the game wallet (shards are off-chain only). */
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
/** G2U mint used by staking / site (config). */
const G2U_MINT = MINT_ADDRESS;

const tabBtn = (active) => ({
  flex: 1,
  padding: '10px 8px',
  borderRadius: '10px',
  border: active ? '2px solid #ffd700' : '1px solid #333',
  background: active ? 'rgba(255, 215, 0, 0.12)' : '#111',
  color: active ? '#ffd700' : '#888',
  fontWeight: 'bold',
  fontSize: '13px',
  cursor: 'pointer',
  outline: 'none',
  WebkitTapHighlightColor: 'transparent',
});

/**
 * Shared wallet hub: Game (embedded Gift Tap wallet) | Solana (Phantom etc.).
 * Site and game both use this so both wallets are visible on gift2u.fun and /play.
 */

export function SolanaWalletPanel({ note, onClose }) {
  const {
    publicKey,
    connected,
    connecting,
    disconnect,
    wallet,
    wallets,
    select,
    connect,
  } = useWallet();
  const { setVisible } = useWalletModal();
  const { connection } = useConnection();
  const adapterAddress = publicKey?.toBase58() || '';

  /** Seeker APK native MWA connect (not browser MWA — WebView cannot do that) */
  const [seekerAddress, setSeekerAddress] = useState(() => {
    try {
      return localStorage.getItem('gift2u_seeker_wallet') || '';
    } catch {
      return '';
    }
  });
  const [seekerLabel, setSeekerLabel] = useState(() => {
    try {
      return localStorage.getItem('gift2u_seeker_wallet_label') || 'Seeker wallet';
    } catch {
      return 'Seeker wallet';
    }
  });
  const [seekerConnecting, setSeekerConnecting] = useState(false);

  const onSeeker = typeof window !== 'undefined' && isSeekerShell();
  const address = onSeeker && seekerAddress ? seekerAddress : adapterAddress;
  const effectivelyConnected = onSeeker ? Boolean(seekerAddress) : connected;
  const effectivelyConnecting = onSeeker ? seekerConnecting : connecting;

  const [balances, setBalances] = useState({
    sol: 0,
    usdc: 0,
    G2U: 0,
    G2Ushards: 0,
  });
  const [balLoading, setBalLoading] = useState(false);
  const [balError, setBalError] = useState('');
  const [fiatRates, setFiatRates] = useState({ sol: {}, usdc: {} });
  const [msg, setMsg] = useState('');
  const [appNotice, setAppNotice] = useState({ show: false, message: '', success: true });
  const [isMobile, setIsMobile] = useState(false);
  const [displayCurrency] = useState(() => {
    try {
      return localStorage.getItem('gift2u_display_currency') || 'USD';
    } catch {
      return 'USD';
    }
  });

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent || ''));
  }, []);

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isAndroid = /Android/i.test(ua);

  /** True when this page is already running inside a wallet webview */
  const injected = useMemo(() => {
    if (typeof window === 'undefined') return { phantom: false, solflare: false, backpack: false };
    return {
      phantom: !!(window.phantom?.solana?.isPhantom || window.solana?.isPhantom),
      solflare: !!window.solflare?.isSolflare,
      backpack: !!(window.backpack?.isBackpack || window.backpack?.solana),
    };
  }, [connected, publicKey]); // re-check when connection changes

  const anyInjected = injected.phantom || injected.solflare || injected.backpack;

  const clearSelection = () => {
    try {
      select(null);
      localStorage.removeItem('walletName');
    } catch (_) {}
  };

  /** Connect an already-injected wallet (desktop extension or wallet in-app browser). */
  const connectNamed = async (name) => {
    setMsg('');
    setVisible(false);
    try {
      const entry = wallets.find((w) => w.adapter.name === name);
      if (!entry) {
        setMsg(`${name} adapter not available.`);
        return;
      }
      // Only connect if installed/injected — never call connect on NotDetected (download page)
      if (entry.readyState !== 'Installed' && !anyInjected) {
        openInWalletApp(name);
        return;
      }
      select(name);
      await entry.adapter.connect();
    } catch (e) {
      console.error(e);
      clearSelection();
      setMsg(e?.message || `Could not connect ${name}`);
    }
  };

  /**
   * Open this page inside Phantom / Solflare / Backpack app.
   * After reload inside the app, the wallet is Detected and Connect works.
   */
  const openInWalletApp = (name) => {
    if (typeof window === 'undefined') return;
    const host = (window.location.hostname || '').toLowerCase();
    const local =
      !host ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      /^10\.\d+\.\d+\.\d+$/.test(host) ||
      /^192\.168\.\d+\.\d+$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host);

    if (local) {
      setMsg(
        `Open ${name} on your phone → Browser → go to https://gift2u.fun (not localhost). Then tap ${name} again to connect.`,
      );
      clearSelection();
      return;
    }

    if (!window.isSecureContext) {
      setMsg('Use https://gift2u.fun (HTTPS). Wallet apps cannot open insecure http links reliably.');
      clearSelection();
      return;
    }

    const page = encodeURIComponent(window.location.href);
    const ref = encodeURIComponent(window.location.origin);

    // Official browse deep links (open dApp inside wallet browser)
    const httpsLinks = {
      Phantom: `https://phantom.app/ul/browse/${page}?ref=${ref}`,
      Solflare: `https://solflare.com/ul/v1/browse/${page}?ref=${ref}`,
      Backpack: `https://backpack.app/ul/v1/browse/${page}?ref=${ref}`,
    };
    // Android: force installed package (avoids Play Store when app exists)
    const androidIntents = {
      Phantom: `intent://phantom.app/ul/browse/${page}?ref=${ref}#Intent;scheme=https;package=app.phantom;end`,
      Solflare: `intent://solflare.com/ul/v1/browse/${page}?ref=${ref}#Intent;scheme=https;package=com.solflare.mobile;end`,
      Backpack: `intent://backpack.app/ul/v1/browse/${page}?ref=${ref}#Intent;scheme=https;package=app.backpack.mobile;end`,
    };

    const https = httpsLinks[name];
    if (!https) return;

    clearSelection();
    setMsg(`Opening ${name}… Approve to open the app, then tap ${name} again to finish connect.`);

    if (isAndroid && androidIntents[name]) {
      window.location.href = androidIntents[name];
    } else {
      window.location.href = https;
    }
  };

  /**
   * Mobile browser only: MWA inside Chrome (does NOT work in Seeker WebView).
   */
  const connectMobileAdapter = () => {
    setMsg('');
    const mwa = wallets.find(
      (w) =>
        w.adapter.name === SolanaMobileWalletAdapterWalletName ||
        /mobile wallet adapter/i.test(String(w.adapter.name)),
    );
    if (!mwa || mwa.readyState === 'Unsupported') {
      setMsg(
        window.isSecureContext
          ? 'Installed-wallet connect needs Android Chrome. Or use Phantom / Solflare buttons below.'
          : 'Need HTTPS — open https://gift2u.fun on your phone.',
      );
      return;
    }
    select(mwa.adapter.name);
    Promise.resolve(mwa.adapter.connect()).catch((err) => {
      console.warn(err);
      clearSelection();
      setMsg(err?.message || 'Connection cancelled or failed.');
    });
  };

  /**
   * Seeker APK: ask native shell to run real MWA (Seed Vault), same pattern as AdMob ads.
   */
  const connectSeekerNativeWallet = () => {
    setMsg('');
    const bridge = typeof window !== 'undefined' ? window.ReactNativeWebView : null;
    if (!bridge || typeof bridge.postMessage !== 'function') {
      setMsg('Update the Gift2U Seeker app to connect wallets on this phone.');
      return;
    }
    const requestId = `wal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setSeekerConnecting(true);

    const timeout = setTimeout(() => {
      setSeekerConnecting(false);
      setMsg('Wallet connect timed out. Try again.');
      try {
        delete window.__gift2uOnWalletResult;
      } catch {
        /* ignore */
      }
    }, 120000);

    window.__gift2uOnWalletResult = (payload) => {
      clearTimeout(timeout);
      setSeekerConnecting(false);
      try {
        delete window.__gift2uOnWalletResult;
      } catch {
        /* ignore */
      }
      const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (!data || data.requestId !== requestId) return;
      if (data.success && data.address) {
        setSeekerAddress(data.address);
        setSeekerLabel(data.label || 'Seeker wallet');
        try {
          localStorage.setItem('gift2u_seeker_wallet', data.address);
          localStorage.setItem('gift2u_seeker_wallet_label', data.label || 'Seeker wallet');
        } catch {
          /* ignore */
        }
        setMsg('');
        setAppNotice({
          show: true,
          message: 'Seeker wallet connected',
          success: true,
        });
      } else {
        setMsg(data?.error || 'Could not connect wallet.');
      }
    };

    try {
      bridge.postMessage(
        JSON.stringify({
          type: 'CONNECT_WALLET',
          requestId,
        }),
      );
    } catch (e) {
      clearTimeout(timeout);
      setSeekerConnecting(false);
      setMsg(e?.message || 'Could not start wallet connect.');
    }
  };

  const disconnectSeekerWallet = () => {
    setSeekerAddress('');
    setSeekerLabel('Seeker wallet');
    try {
      localStorage.removeItem('gift2u_seeker_wallet');
      localStorage.removeItem('gift2u_seeker_wallet_label');
    } catch {
      /* ignore */
    }
  };

  // Auto-connect when page is already inside Phantom/Solflare browser
  useEffect(() => {
    if (connected || connecting || !anyInjected) return;
    const name = injected.phantom
      ? 'Phantom'
      : injected.solflare
        ? 'Solflare'
        : injected.backpack
          ? 'Backpack'
          : null;
    if (!name) return;
    const entry = wallets.find((w) => w.adapter.name === name && w.readyState === 'Installed');
    if (!entry) return;
    let cancelled = false;
    (async () => {
      try {
        select(name);
        await entry.adapter.connect();
      } catch (e) {
        if (!cancelled) console.warn('auto inject connect', e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyInjected, connected]);

  const loadBalances = useCallback(async () => {
    const ownerStr = onSeeker && seekerAddress ? seekerAddress : publicKey?.toBase58();
    if (!ownerStr) return;
    setBalLoading(true);
    setBalError('');
    try {
      const rpc = MAINNET_RPC || connection?.rpcEndpoint;
      const conn = new Connection(rpc, 'confirmed');
      const owner = new PublicKey(ownerStr);
      const readSpl = async (mint) => {
        try {
          const ata = getAssociatedTokenAddressSync(mint, owner, false);
          const bal = await conn.getTokenAccountBalance(ata);
          return bal?.value?.uiAmount || 0;
        } catch {
          return 0;
        }
      };
      const [solLamports, usdc, g2u] = await Promise.all([
        conn.getBalance(owner, 'confirmed'),
        readSpl(USDC_MINT),
        readSpl(G2U_MINT),
      ]);
      setBalances({
        sol: solLamports / LAMPORTS_PER_SOL,
        usdc,
        G2U: g2u,
        G2Ushards: 0,
      });
    } catch (e) {
      console.error('Solana balance fetch failed', e);
      setBalError(e?.message || 'Could not load balances');
    } finally {
      setBalLoading(false);
    }
  }, [publicKey, connection, onSeeker, seekerAddress]);

  useEffect(() => {
    fetchFiatRates()
      .then(setFiatRates)
      .catch((e) => console.warn('fiat rates', e));
  }, []);

  useEffect(() => {
    if (!effectivelyConnected || !address) {
      setBalances({ sol: 0, usdc: 0, G2U: 0, G2Ushards: 0 });
      return;
    }
    loadBalances();
    const id = setInterval(loadBalances, 30_000);
    return () => clearInterval(id);
  }, [effectivelyConnected, address, loadBalances]);

  const short =
    address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;

  const walletBtn = (label, onClick) => (
    <button
      key={label}
      type="button"
      disabled={connecting}
      onClick={onClick}
      style={{
        padding: '14px 10px',
        borderRadius: '12px',
        border: '1px solid #444',
        background: '#1c1e22',
        color: '#fff',
        fontWeight: 'bold',
        fontSize: '13px',
        cursor: connecting ? 'wait' : 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ textAlign: 'left' }}>
      <AppNotice
        show={appNotice.show}
        message={appNotice.message}
        success={appNotice.success}
        onClose={() => setAppNotice((n) => ({ ...n, show: false }))}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ margin: 0, color: '#ffd700' }}>Solana Wallet</h3>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', color: '#888', fontSize: '18px', cursor: 'pointer' }}
          >
            ✕
          </button>
        ) : null}
      </div>
      <p style={{ color: '#888', fontSize: '12px', marginTop: 0, marginBottom: '14px', lineHeight: 1.4 }}>
        {note ||
          'Connect your Solana wallet for vault and staking. Game wallet is on the Game tab.'}
      </p>

      {/* SEEKER APK: native Seed Vault / MWA (NOT browser MWA — that fails in WebView) */}
      {!effectivelyConnected && onSeeker && (
        <div style={{ marginBottom: '14px' }}>
          <p style={{ color: '#ffd700', fontSize: '13px', fontWeight: 'bold', margin: '0 0 8px' }}>
            Connect on Seeker
          </p>
          <p style={{ color: '#aaa', fontSize: '11px', margin: '0 0 12px', lineHeight: 1.45 }}>
            One tap opens Seed Vault (and other wallets on this phone). No “open Phantom then come
            back” — the app handles it natively.
          </p>
          <button
            type="button"
            disabled={effectivelyConnecting}
            onClick={connectSeekerNativeWallet}
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: '14px',
              border: 'none',
              background: 'linear-gradient(90deg, #9945FF, #14F195)',
              color: '#000',
              fontWeight: 'bold',
              fontSize: '16px',
              cursor: effectivelyConnecting ? 'wait' : 'pointer',
            }}
          >
            {effectivelyConnecting ? 'Connecting…' : 'Connect Seed Vault / wallet'}
          </button>
        </div>
      )}

      {/* WEB mobile browser: deep-link into Phantom / Solflare */}
      {!connected && isMobile && !onSeeker && (
        <div style={{ marginBottom: '14px' }}>
          <p style={{ color: '#ffd700', fontSize: '13px', fontWeight: 'bold', margin: '0 0 8px' }}>
            Connect on your phone
          </p>
          <p style={{ color: '#aaa', fontSize: '11px', margin: '0 0 12px', lineHeight: 1.45 }}>
            Tap <strong style={{ color: '#fff' }}>Phantom</strong> or{' '}
            <strong style={{ color: '#fff' }}>Solflare</strong> to open this game inside that app,
            then approve. Use <strong style={{ color: '#fff' }}>https://gift2u.fun</strong> (not
            localhost).
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            {walletBtn('Phantom', () => connectNamed('Phantom'))}
            {walletBtn('Solflare', () => connectNamed('Solflare'))}
            {walletBtn('Backpack', () => connectNamed('Backpack'))}
          </div>
          <button
            type="button"
            disabled={connecting}
            onClick={connectMobileAdapter}
            style={{
              width: '100%',
              marginTop: '10px',
              padding: '12px',
              borderRadius: '12px',
              border: '1px solid #ffd700',
              background: 'rgba(255,215,0,0.12)',
              color: '#ffd700',
              fontWeight: 'bold',
              fontSize: '13px',
              cursor: connecting ? 'wait' : 'pointer',
            }}
          >
            {connecting ? 'Connecting…' : 'Other installed wallets'}
          </button>
        </div>
      )}

      {!connected && !isMobile && !onSeeker && (
        <div style={{ marginBottom: '12px' }}>
          <button
            type="button"
            onClick={() => setVisible(true)}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '12px',
              border: 'none',
              background: '#fbef43',
              color: '#000',
              fontWeight: 'bold',
              fontSize: '15px',
              cursor: 'pointer',
            }}
          >
            Select Solana Wallet
          </button>
          <p style={{ color: '#555', fontSize: '11px', textAlign: 'center', margin: '8px 0 0' }}>
            Phantom, Solflare, and other browser wallets.
          </p>
        </div>
      )}

      {anyInjected && !connected && !onSeeker && (
        <p style={{ color: '#4ade80', fontSize: '12px', margin: '0 0 10px' }}>
          Wallet browser detected — connecting…
        </p>
      )}

      {msg ? (
        <p style={{ color: '#fbbf24', fontSize: '11px', margin: '0 0 12px', lineHeight: 1.4 }}>{msg}</p>
      ) : null}

      {effectivelyConnecting && (
        <button
          type="button"
          onClick={() => {
            if (onSeeker) {
              setSeekerConnecting(false);
              try {
                delete window.__gift2uOnWalletResult;
              } catch {
                /* ignore */
              }
            } else {
              clearSelection();
            }
            setMsg('');
          }}
          style={{
            width: '100%',
            padding: '10px',
            marginBottom: '10px',
            borderRadius: '10px',
            border: '1px solid #f87171',
            background: '#1c1e22',
            color: '#f87171',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          Cancel connecting
        </button>
      )}

      {effectivelyConnected && address ? (
        <>
          <TokenBalanceList
            balances={balances}
            currency={displayCurrency}
            rates={fiatRates}
            style={{ marginBottom: '10px' }}
          />
          <p style={{ color: '#555', fontSize: '10px', margin: '0 0 10px', lineHeight: 1.4 }}>
            SOL, USDC, G2U on-chain. G2Ushards are game-only.
            {balLoading ? ' · Refreshing…' : ''}
          </p>
          {balError ? (
            <p style={{ color: '#f87171', fontSize: '11px', margin: '0 0 10px' }}>{balError}</p>
          ) : null}
          <div
            style={{
              background: '#111',
              border: '1px solid #333',
              borderRadius: '12px',
              padding: '12px',
            }}
          >
            <div style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>
              Connected
              {onSeeker && seekerAddress
                ? ` · ${seekerLabel}`
                : wallet?.adapter?.name
                  ? ` · ${wallet.adapter.name}`
                  : ''}{' '}
              · {short}
            </div>
            <div
              style={{
                color: '#fff',
                fontSize: '12px',
                wordBreak: 'break-all',
                fontFamily: 'monospace',
              }}
            >
              {address}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(address);
                  setAppNotice({
                    show: true,
                    message: 'Solana address copied',
                    success: true,
                  });
                }}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid #333',
                  background: '#1c1e22',
                  color: '#ffd700',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                Copy
              </button>
              <button
                type="button"
                onClick={loadBalances}
                disabled={balLoading}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid #333',
                  background: '#1c1e22',
                  color: '#888',
                  fontWeight: 'bold',
                  cursor: balLoading ? 'wait' : 'pointer',
                }}
              >
                {balLoading ? '…' : 'Refresh'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onSeeker && seekerAddress) disconnectSeekerWallet();
                  else disconnect();
                }}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid #333',
                  background: '#1c1e22',
                  color: '#f87171',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                Disconnect
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}


/**
 * Loads the Gift Tap game wallet from the same session as /play
 * (localStorage gift2u_player_id + players table).
 * Login / signup / restore happen inline on the main site — no redirect to /play.
 */
export function GameWalletPanel({ onClose }) {
  const [sessionTick, setSessionTick] = useState(0);
  const loggedIn = isLoggedIn();
  const playerId = getPlayerId();
  const profile = getPlayerProfile();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [row, setRow] = useState(null);
  const [liveSol, setLiveSol] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [fiatRates, setFiatRates] = useState({ sol: {}, usdc: {} });
  /** 'receive' | 'send' | 'swap' | 'shard' | null — all stay on main site */
  const [walletAction, setWalletAction] = useState(null);
  /** Prefer menu currency if parent passes it; else USD or localStorage later */
  const [displayCurrency] = useState(() => {
    try {
      return localStorage.getItem('gift2u_display_currency') || 'USD';
    } catch {
      return 'USD';
    }
  });

  const bumpSession = () => setSessionTick((n) => n + 1);

  useEffect(() => {
    fetchFiatRates()
      .then(setFiatRates)
      .catch((e) => console.warn('fiat rates', e));
  }, []);

  const load = useCallback(async () => {
    const id = getPlayerId();
    const ok = isLoggedIn();
    if (!id || !ok) {
      setLoading(false);
      setRow(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data, error: qErr } = await supabase
        .from('players')
        .select(
          'wallet_address, username, sol_balance, shard_balance, gft_token_balance, usdc_balance, inventory, max_unlocked_level',
        )
        .eq(DB_PLAYER_ID, String(id))
        .maybeSingle();

      if (qErr) throw qErr;
      setRow(data || null);

      // Live SOL on-chain when we have an address (DB can be stale)
      if (data?.wallet_address) {
        try {
          const rpc =
            import.meta.env.VITE_SOLANA_RPC_URL ||
            'https://api.mainnet-beta.solana.com';
          const conn = new Connection(rpc, 'confirmed');
          const lamports = await conn.getBalance(new PublicKey(data.wallet_address));
          setLiveSol(lamports / LAMPORTS_PER_SOL);
        } catch {
          setLiveSol(null);
        }
      } else {
        setLiveSol(null);
      }
    } catch (e) {
      console.error('Game wallet load:', e);
      setError(e?.message || 'Could not load game wallet');
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [sessionTick]);

  useEffect(() => {
    load();
  }, [load]);

  /** Same session as /play — stay on gift2u.fun main page */
  const handleAuthenticated = async ({ playerId: pid, username: uname }) => {
    applyAuthSession({ playerId: pid, username: uname });
    bumpSession();
  };

  const handleRestoreAccount = async (mnemonic) => {
    const cleaned = (mnemonic || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!cleaned || cleaned.split(' ').length < 12) {
      throw new Error('Enter your full 12-word secret phrase.');
    }
    setAuthBusy(true);
    try {
      let keypair;
      try {
        keypair = keypairFromMnemonic(cleaned);
      } catch {
        throw new Error('Invalid secret phrase. Check the words and try again.');
      }
      const publicKey = keypair.publicKey.toBase58();
      const { data: row, error: qErr } = await supabase
        .from('players')
        .select('*')
        .eq('wallet_address', publicKey)
        .maybeSingle();
      if (qErr) throw qErr;
      if (!row) {
        throw new Error('No Gift Tap account found for that phrase.');
      }
      const restoredName =
        (row.username && String(row.username).trim()) ||
        `Player_${String(row[DB_PLAYER_ID]).replace(/-/g, '').slice(0, 8)}`;
      applyAuthSession({
        playerId: String(row[DB_PLAYER_ID]),
        username: restoredName,
      });
      bumpSession();
      return true;
    } finally {
      setAuthBusy(false);
    }
  };

  if (!loggedIn || !playerId) {
    return (
      <div style={{ textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ margin: 0, color: '#ffd700' }}>Game Wallet</h3>
          {onClose ? (
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', fontSize: '18px', cursor: 'pointer' }}>
              ✕
            </button>
          ) : null}
        </div>
        {authBusy ? (
          <p style={{ color: '#888', textAlign: 'center' }}>Restoring…</p>
        ) : (
          <AuthScreen
            embedded
            onAuthenticated={handleAuthenticated}
            onRestoreAccount={handleRestoreAccount}
          />
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ color: '#888', padding: '24px', textAlign: 'center' }}>
        Loading game wallet…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'left' }}>
        <p style={{ color: '#f87171', fontSize: '13px' }}>{error}</p>
        <button type="button" onClick={load} style={{ background: '#333', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: '8px', cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    );
  }

  const address = row?.wallet_address || '';
  const solDisplay =
    liveSol != null
      ? liveSol
      : Number(row?.sol_balance) || 0;
  const shards = Number(row?.shard_balance) || 0;
  const g2u = Number(row?.gft_token_balance) || 0;
  const usdc = Number(row?.usdc_balance) || 0;
  const uname = row?.username || profile.username || 'Player';

  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ margin: 0, color: '#ffd700' }}>Game Wallet</h3>
        {onClose ? (
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', fontSize: '18px', cursor: 'pointer' }}>
            ✕
          </button>
        ) : null}
      </div>

      <p style={{ color: '#888', fontSize: '11px', margin: '0 0 12px' }}>
        Logged in as <span style={{ color: '#ffd700', fontWeight: 'bold' }}>{uname}</span>
        {' · '}same wallet as Gift Tap
      </p>

      {!address ? (
        <p style={{ color: '#fbbf24', fontSize: '12px' }}>
          No game wallet address on this account yet. Open Gift Tap once to finish setup.
        </p>
      ) : (
        <>
          <TokenBalanceList
            balances={{
              sol: solDisplay,
              usdc,
              G2U: g2u,
              G2Ushards: shards,
            }}
            currency={displayCurrency}
            rates={fiatRates}
            style={{ marginBottom: '12px' }}
          />

          <ClaimG2uPanel
            inventory={row?.inventory || {}}
            onInventoryChange={(inv) => {
              setRow((prev) => (prev ? { ...prev, inventory: inv } : prev));
            }}
            notify={(msg) => {
              const m = String(msg || '');
              if (m.startsWith('✅')) setError('');
              else setError(m);
              try {
                // Brief toast-style feedback in the panel error/status line
                if (m.startsWith('✅')) {
                  setError(m);
                  setTimeout(() => setError(''), 4000);
                }
              } catch {
                /* ignore */
              }
            }}
          />

          <WalletNftSection
            walletAddress={address}
            refreshKey={sessionTick}
            inventory={row?.inventory || {}}
            maxUnlockedLevel={
              Number(row?.max_unlocked_level) || 4
            }
            gftTokenBalance={g2u}
            onGftBalanceChange={(next) => {
              setRow((prev) =>
                prev ? { ...prev, gft_token_balance: next } : prev,
              );
            }}
            onInventoryChange={(inv) => {
              setRow((prev) => (prev ? { ...prev, inventory: inv } : prev));
            }}
            onOpenShopNfts={() => {
              if (typeof window !== 'undefined') window.location.href = '/play';
            }}
            onSellNft={() => {
              if (typeof window !== 'undefined') window.location.href = '/play';
            }}
          />

          {/* Same actions as in-game — all stay on the main site.
              Shard→G2U button hidden (code/modal kept for later). Use Jupiter Swap for $G2U. */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            {[
              { id: 'receive', label: 'Receive' },
              { id: 'send', label: 'Send' },
              { id: 'swap', label: 'Swap' },
            ].map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setWalletAction(a.id)}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '10px',
                  background: '#ffd700',
                  color: '#000',
                  fontWeight: 'bold',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={load}
        style={{
          width: '100%',
          background: '#1c1e22',
          color: '#888',
          border: '1px solid #333',
          borderRadius: '10px',
          padding: '8px',
          fontWeight: 'bold',
          cursor: 'pointer',
          fontSize: '12px',
        }}
      >
        Refresh balances
      </button>

      <GameWalletActionModals
        action={walletAction}
        onClose={() => setWalletAction(null)}
        address={address}
        balances={{
          sol: solDisplay,
          usdc,
          G2U: g2u,
          G2Ushards: shards,
        }}
        inventory={row?.inventory || {}}
        maxUnlockedLevel={Number(row?.max_unlocked_level) || 4}
        currentLevel={0}
        playerId={playerId}
        onSuccess={load}
      />
    </div>
  );
}

/**
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {'game'|'solana'} [props.defaultTab]
 * @param {React.ReactNode} [props.gameContent] — override Game tab (e.g. full Gift Tap dashboard)
 * @param {boolean} [props.hideTabs]
 * @param {boolean} [props.showSolanaTab] — false = game wallet only (GiftTap); site keeps both tabs
 * @param {string} [props.solanaNote]
 * @param {object} [props.overlayStyle]
 * @param {object} [props.panelStyle]
 * @param {boolean} [props.useSharedGameWallet] — site: load real game wallet (default true when no gameContent)
 */
export default function WalletHub({
  isOpen,
  onClose,
  defaultTab = 'game',
  gameContent,
  hideTabs = false,
  showSolanaTab = true,
  solanaNote,
  overlayStyle,
  panelStyle,
  useSharedGameWallet,
}) {
  const [tab, setTab] = useState(defaultTab);

  useEffect(() => {
    if (isOpen) setTab(showSolanaTab ? (defaultTab || 'game') : 'game');
  }, [isOpen, defaultTab, showSolanaTab]);

  if (!isOpen) return null;

  const showSharedGame =
    useSharedGameWallet !== false && gameContent == null;
  // GiftTap: game wallet only. Gift2u web: Game + Solana tabs.
  const showTabBar = !hideTabs && showSolanaTab;
  const activeTab = showSolanaTab ? tab : 'game';

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
        ...overlayStyle,
      }}
      onClick={() => {
        if (!hideTabs) onClose?.();
      }}
    >
      <div
        style={{
          background: '#222',
          padding: '20px',
          borderRadius: '15px',
          width: '90%',
          maxWidth: '400px',
          border: '2px solid #ffd700',
          textAlign: 'center',
          maxHeight: '90vh',
          overflowY: 'auto',
          ...panelStyle,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {showTabBar && (
          <>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button type="button" style={tabBtn(activeTab === 'game')} onClick={() => setTab('game')}>
                Game
              </button>
              <button type="button" style={tabBtn(activeTab === 'solana')} onClick={() => setTab('solana')}>
                Solana
              </button>
            </div>
            <p style={{ color: '#666', fontSize: '10px', margin: '0 0 14px', lineHeight: 1.35 }}>
              {activeTab === 'game'
                ? 'Game wallet — same address as Gift Tap (shop, play balances).'
                : 'Solana wallet — Phantom / Solflare etc. for vault and staking on the site.'}
            </p>
          </>
        )}

        {activeTab === 'game' || !showSolanaTab || hideTabs ? (
          showSharedGame ? (
            <GameWalletPanel onClose={onClose} />
          ) : (
            gameContent
          )
        ) : (
          <SolanaWalletPanel note={solanaNote} onClose={onClose} />
        )}
      </div>
    </div>
  );
}
