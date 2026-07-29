import React, { useEffect, useState, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
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
import TokenBalanceList from './TokenBalanceList';
import { fetchFiatRates } from './fiatPrices';
import GameWalletActionModals from './GameWalletActionModals';

/** Tokens shown on Solana tab — same set as the game wallet (shards are off-chain only). */
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
/** GFT mint used by staking / site (config). */
const GFT_MINT = MINT_ADDRESS;

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

export function SolanaWalletPanel({ note }) {
  const { publicKey, connected, disconnect, wallet } = useWallet();
  const { connection } = useConnection();
  const address = publicKey?.toBase58() || '';

  const [balances, setBalances] = useState({
    sol: 0,
    usdc: 0,
    GFT: 0,
    GFTshards: 0,
  });
  const [balLoading, setBalLoading] = useState(false);
  const [balError, setBalError] = useState('');
  const [fiatRates, setFiatRates] = useState({ sol: {}, usdc: {} });
  const [displayCurrency] = useState(() => {
    try {
      return localStorage.getItem('gift2u_display_currency') || 'USD';
    } catch {
      return 'USD';
    }
  });

  // User wallets hold game tokens on mainnet; site staking Connection may be devnet.
  const loadBalances = useCallback(async () => {
    if (!publicKey) return;
    setBalLoading(true);
    setBalError('');
    try {
      const rpc = MAINNET_RPC || connection?.rpcEndpoint;
      const conn = new Connection(rpc, 'confirmed');
      const owner = publicKey;

      const readSpl = async (mint) => {
        try {
          const ata = getAssociatedTokenAddressSync(mint, owner, false);
          const bal = await conn.getTokenAccountBalance(ata);
          return bal?.value?.uiAmount || 0;
        } catch {
          return 0;
        }
      };

      const [solLamports, usdc, gft] = await Promise.all([
        conn.getBalance(owner, 'confirmed'),
        readSpl(USDC_MINT),
        readSpl(GFT_MINT),
      ]);
      setBalances({
        sol: solLamports / LAMPORTS_PER_SOL,
        usdc,
        GFT: gft,
        // Shards live only on the game wallet (off-chain), not on external Solana wallets
        GFTshards: 0,
      });
    } catch (e) {
      console.error('Solana balance fetch failed', e);
      setBalError(e?.message || 'Could not load balances');
    } finally {
      setBalLoading(false);
    }
  }, [publicKey, connection]);

  useEffect(() => {
    fetchFiatRates()
      .then(setFiatRates)
      .catch((e) => console.warn('fiat rates', e));
  }, []);

  useEffect(() => {
    if (!connected || !publicKey) {
      setBalances({ sol: 0, usdc: 0, GFT: 0, GFTshards: 0 });
      return;
    }
    loadBalances();
    const t = setInterval(loadBalances, 30_000);
    return () => clearInterval(t);
  }, [connected, publicKey, loadBalances]);

  return (
    <div style={{ textAlign: 'left' }}>
      <p style={{ color: '#888', fontSize: '12px', marginTop: 0, marginBottom: '14px', lineHeight: 1.4 }}>
        {note ||
          'Your external Solana wallet (Phantom, Solflare, Backpack…). Use for vault, staking, and outside the game.'}
      </p>

      <div
        className="wallet-hub-select-wrap"
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          width: '100%',
          marginBottom: '16px',
        }}
      >
        <WalletMultiButton className="wallet-hub-select-btn" />
      </div>

      {connected && address ? (
        <>
          <TokenBalanceList
            balances={balances}
            currency={displayCurrency}
            rates={fiatRates}
            style={{ marginBottom: '10px' }}
          />
          <p style={{ color: '#555', fontSize: '10px', margin: '0 0 10px', lineHeight: 1.4 }}>
            Showing game-matching on-chain tokens: SOL, USDC, GFT.
            GFTshards are game-only (not on external wallets).
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
              Connected{wallet?.adapter?.name ? ` · ${wallet.adapter.name}` : ''}
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
                  alert('Solana address copied');
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
                onClick={() => disconnect()}
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
      ) : (
        <p style={{ color: '#555', fontSize: '11px', textAlign: 'center', margin: 0 }}>
          Not connected. Tap Select Wallet to choose a Solana wallet.
        </p>
      )}
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
          'wallet_address, username, sol_balance, shard_balance, gft_token_balance, usdc_balance',
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
  const gft = Number(row?.gft_token_balance) || 0;
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
              GFT: gft,
              GFTshards: shards,
            }}
            currency={displayCurrency}
            rates={fiatRates}
            style={{ marginBottom: '12px' }}
          />

          {/* Same actions as in-game — all stay on the main site */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            {[
              { id: 'receive', label: 'Receive' },
              { id: 'send', label: 'Send' },
              { id: 'swap', label: 'Swap' },
              { id: 'shard', label: 'Shard' },
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
          GFT: gft,
          GFTshards: shards,
        }}
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
  solanaNote,
  overlayStyle,
  panelStyle,
  useSharedGameWallet,
}) {
  const [tab, setTab] = useState(defaultTab);

  useEffect(() => {
    if (isOpen) setTab(defaultTab || 'game');
  }, [isOpen, defaultTab]);

  if (!isOpen) return null;

  const showSharedGame =
    useSharedGameWallet !== false && gameContent == null;

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
        {!hideTabs && (
          <>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button type="button" style={tabBtn(tab === 'game')} onClick={() => setTab('game')}>
                Game
              </button>
              <button type="button" style={tabBtn(tab === 'solana')} onClick={() => setTab('solana')}>
                Solana
              </button>
            </div>
            <p style={{ color: '#666', fontSize: '10px', margin: '0 0 14px', lineHeight: 1.35 }}>
              {tab === 'game'
                ? 'Game wallet — same address as Gift Tap (shop, play balances).'
                : 'Solana wallet — Phantom / Solflare etc. for vault and staking on the site.'}
            </p>
          </>
        )}

        {hideTabs || tab === 'game' ? (
          showSharedGame ? (
            <GameWalletPanel onClose={onClose} />
          ) : (
            gameContent
          )
        ) : (
          <SolanaWalletPanel note={solanaNote} />
        )}
      </div>
    </div>
  );
}
