import React, { useEffect, useState } from 'react';
import { listGiftNfts } from './locksmith';

/**
 * In-game wallet: show Gift2u Elves / GiftLocksmith NFTs on this address.
 */
export default function WalletNftSection({
  walletAddress,
  refreshKey = 0,
  onOpenShopNfts,
}) {
  const [nfts, setNfts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!walletAddress) {
        setNfts([]);
        setError('');
        return;
      }
      setLoading(true);
      setError('');
      try {
        const list = await listGiftNfts(walletAddress);
        if (!cancelled) setNfts(list);
      } catch (e) {
        if (!cancelled) {
          setNfts([]);
          setError(e?.message || 'Could not load NFTs');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walletAddress, refreshKey]);

  return (
    <div
      style={{
        marginTop: '16px',
        marginBottom: '4px',
        textAlign: 'left',
        background: '#111',
        border: '1px solid #333',
        borderRadius: '12px',
        padding: '12px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px',
        }}
      >
        <span style={{ color: '#ffd700', fontWeight: 'bold', fontSize: '13px' }}>
          🖼 NFTs
        </span>
        <span style={{ color: '#888', fontSize: '11px' }}>
          {loading ? 'Scanning…' : `${nfts.length} on this wallet`}
        </span>
      </div>

      {error ? (
        <p style={{ color: '#f87171', fontSize: '11px', margin: '0 0 8px' }}>{error}</p>
      ) : null}

      {!loading && nfts.length === 0 ? (
        <div>
          <p style={{ color: '#888', fontSize: '12px', margin: '0 0 10px', lineHeight: 1.4 }}>
            No Gift2u Elves NFTs in this game wallet yet. Mint GiftLocksmith in Shop → NFTs.
          </p>
          {typeof onOpenShopNfts === 'function' ? (
            <button
              type="button"
              onClick={onOpenShopNfts}
              style={{
                width: '100%',
                background: 'rgba(153,69,255,0.2)',
                color: '#c4b5fd',
                border: '1px solid #9945FF',
                borderRadius: '8px',
                padding: '8px',
                fontWeight: 'bold',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Open Shop → NFTs
            </button>
          ) : null}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {nfts.map((nft) => (
            <div
              key={nft.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: '#1a1a1a',
                borderRadius: '10px',
                padding: '8px',
                border: '1px solid #2a2a2a',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: 'linear-gradient(135deg, #4c1d95, #1e1b4b)',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                }}
              >
                {nft.image ? (
                  <img
                    src={nft.image}
                    alt={nft.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  '🔑'
                )}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    color: '#fff',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {nft.name}
                </div>
                <div style={{ color: '#a78bfa', fontSize: '11px', marginTop: 2 }}>
                  {nft.collection} · Locksmith
                </div>
                <div
                  style={{
                    color: '#555',
                    fontSize: '10px',
                    marginTop: 2,
                    fontFamily: 'monospace',
                  }}
                >
                  {nft.id.slice(0, 4)}…{nft.id.slice(-4)}
                </div>
              </div>
              <a
                href={`https://solscan.io/token/${nft.id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#ffd700',
                  fontSize: '11px',
                  textDecoration: 'none',
                  fontWeight: 'bold',
                  flexShrink: 0,
                }}
              >
                View
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
