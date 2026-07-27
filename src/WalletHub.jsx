import React, { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

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
 * Shared wallet hub: Game (embedded) | Solana (extension / mobile apps).
 * Always opens on Game unless defaultTab is overridden.
 */
export function SolanaWalletPanel({ note }) {
  const { publicKey, connected, disconnect, wallet } = useWallet();
  const address = publicKey?.toBase58() || '';

  return (
    <div style={{ textAlign: 'left' }}>
      <p style={{ color: '#888', fontSize: '12px', marginTop: 0, marginBottom: '14px', lineHeight: 1.4 }}>
        {note ||
          'Connect Phantom, Solflare, Backpack, and other Solana wallets. Use this for the site vault, staking, and external NFTs. Gift Locksmith for play stays in your Game wallet.'}
      </p>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
        <div className="site-wallet-btn" style={{ width: '100%' }}>
          <WalletMultiButton
            style={{
              width: '100%',
              justifyContent: 'center',
              borderRadius: '12px',
              height: '44px',
            }}
          />
        </div>
      </div>

      {connected && address ? (
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
                background: '#222',
                color: '#ffd700',
                border: '1px solid #444',
                borderRadius: '8px',
                padding: '10px',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => disconnect()}
              style={{
                flex: 1,
                background: 'transparent',
                color: '#f87171',
                border: '1px solid #663333',
                borderRadius: '8px',
                padding: '10px',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <p style={{ color: '#555', fontSize: '11px', textAlign: 'center', margin: 0 }}>
          Not connected. Tap the button above to choose a Solana wallet.
        </p>
      )}
    </div>
  );
}

/**
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {'game'|'solana'} [props.defaultTab]
 * @param {React.ReactNode} props.gameContent  — full Game wallet UI (or site message)
 * @param {boolean} [props.hideTabs] — e.g. mandatory backup
 * @param {string} [props.solanaNote]
 * @param {object} [props.overlayStyle]
 * @param {object} [props.panelStyle]
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
}) {
  const [tab, setTab] = useState(defaultTab);

  // Always land on Game (or requested default) when opening
  useEffect(() => {
    if (isOpen) setTab(defaultTab || 'game');
  }, [isOpen, defaultTab]);

  if (!isOpen) return null;

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
            <div
              style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '8px',
              }}
            >
              <button type="button" style={tabBtn(tab === 'game')} onClick={() => setTab('game')}>
                Game
              </button>
              <button type="button" style={tabBtn(tab === 'solana')} onClick={() => setTab('solana')}>
                Solana
              </button>
            </div>
            <p
              style={{
                color: '#666',
                fontSize: '10px',
                margin: '0 0 14px',
                lineHeight: 1.35,
              }}
            >
              {tab === 'game'
                ? 'Game wallet — play, shop, Locksmith NFTs, and in-game balances.'
                : 'Solana wallet — vault, staking, and external wallets (Phantom, etc.).'}
            </p>
          </>
        )}

        {hideTabs || tab === 'game' ? gameContent : <SolanaWalletPanel note={solanaNote} />}
      </div>
    </div>
  );
}
