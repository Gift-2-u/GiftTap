import React, { useEffect, useState } from 'react';
import { listGiftNfts } from './locksmith';
import { transferCoreNft } from './nftTransfer';

/**
 * In-game wallet NFTs. Detail popup: Send (free transfer) + Sell (marketplace).
 */
export default function WalletNftSection({
  walletAddress,
  walletSecret = '',
  refreshKey = 0,
  onOpenShopNfts,
  onSellNft,
  notify,
}) {
  const [nfts, setNfts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [copied, setCopied] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendTo, setSendTo] = useState('');
  const [sending, setSending] = useState(false);
  const [listKey, setListKey] = useState(0);

  const toast = (msg, ok = true) => {
    if (typeof notify === 'function') notify(msg, ok);
    else if (!ok) console.warn(msg);
    else console.log(msg);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selected?.jsonUri) return;
      const needs =
        !selected.description ||
        !selected.attributes ||
        selected.attributes.length === 0 ||
        !selected.image;
      if (!needs) return;
      setDetailLoading(true);
      try {
        const res = await fetch(selected.jsonUri);
        if (!res.ok) return;
        const meta = await res.json();
        if (cancelled) return;
        setSelected((prev) => {
          if (!prev || prev.id !== selected.id) return prev;
          const attrs = Array.isArray(meta.attributes)
            ? meta.attributes
                .map((a) => ({
                  trait_type: String(a?.trait_type || a?.traitType || a?.key || ''),
                  value: String(a?.value ?? ''),
                }))
                .filter((a) => a.trait_type || a.value)
            : prev.attributes || [];
          return {
            ...prev,
            name: meta.name || prev.name,
            symbol: meta.symbol || prev.symbol,
            description: meta.description || prev.description || '',
            image: meta.image || prev.image,
            attributes: attrs.length ? attrs : prev.attributes || [],
          };
        });
      } catch {
        /* offline */
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.jsonUri]);

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
  }, [walletAddress, refreshKey, listKey]);

  const copyMint = async (id) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const closeDetail = () => {
    setSelected(null);
    setSendOpen(false);
    setSendTo('');
    setSending(false);
  };

  const handleSell = () => {
    if (!selected) return;
    const nft = selected;
    closeDetail();
    if (typeof onSellNft === 'function') {
      onSellNft(nft);
    } else if (typeof onOpenShopNfts === 'function') {
      onOpenShopNfts(nft);
    } else {
      toast('Open Shop → NFTs → Sell to list this NFT', true);
    }
  };

  const handleSend = async () => {
    if (!selected) return;
    const to = String(sendTo || '').trim();
    if (to.length < 32) {
      toast('Enter a valid Solana wallet address', false);
      return;
    }
    if (walletAddress && to === walletAddress) {
      toast('Cannot send to the same wallet', false);
      return;
    }
    const secret = String(walletSecret || '').trim();
    if (!secret) {
      toast('Unlock your game wallet first (log in / restore phrase)', false);
      return;
    }
    setSending(true);
    try {
      const { signature } = await transferCoreNft(secret, selected.id, to);
      toast(`NFT sent! ${String(signature).slice(0, 12)}…`, true);
      closeDetail();
      setListKey((k) => k + 1);
    } catch (e) {
      toast(e?.message || 'Send failed', false);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
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
                onClick={() => onOpenShopNfts()}
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
              <button
                key={nft.id}
                type="button"
                onClick={() => {
                  setCopied(false);
                  setSendOpen(false);
                  setSendTo('');
                  setSelected(nft);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: '#1a1a1a',
                  borderRadius: '10px',
                  padding: '8px',
                  border: '1px solid #2a2a2a',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  color: 'inherit',
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
                <span
                  style={{
                    color: '#ffd700',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    flexShrink: 0,
                  }}
                >
                  View
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={selected.name}
          onClick={closeDetail}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 100050,
            padding: '16px',
            boxSizing: 'border-box',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#131517',
              border: '2px solid #9945FF',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '380px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '16px',
              textAlign: 'left',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '12px',
                gap: '10px',
              }}
            >
              <div>
                <h3 style={{ margin: 0, color: '#ffd700', fontSize: '16px' }}>
                  {selected.name}
                </h3>
                <p style={{ margin: '4px 0 0', color: '#a78bfa', fontSize: '12px' }}>
                  {selected.collection}
                  {selected.symbol ? ` · ${selected.symbol}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#888',
                  fontSize: '20px',
                  cursor: 'pointer',
                  lineHeight: 1,
                  padding: '0 4px',
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div
              style={{
                width: '100%',
                aspectRatio: '1',
                borderRadius: '12px',
                overflow: 'hidden',
                background: 'linear-gradient(145deg, #4c1d95, #0f172a)',
                border: '1px solid #333',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '14px',
              }}
            >
              {selected.image ? (
                <img
                  src={selected.image}
                  alt={selected.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <span style={{ fontSize: 64 }}>🔑</span>
              )}
            </div>

            {detailLoading ? (
              <p style={{ color: '#888', fontSize: '11px', margin: '0 0 10px' }}>
                Loading details…
              </p>
            ) : null}

            {selected.description ? (
              <p
                style={{
                  color: '#ccc',
                  fontSize: '12px',
                  lineHeight: 1.5,
                  margin: '0 0 14px',
                }}
              >
                {selected.description}
              </p>
            ) : (
              <p
                style={{
                  color: '#888',
                  fontSize: '12px',
                  lineHeight: 1.5,
                  margin: '0 0 14px',
                }}
              >
                GiftLocksmith utility NFT — better G2Ushard → $G2U swap terms and vault access.
              </p>
            )}

            {selected.attributes && selected.attributes.length > 0 ? (
              <div style={{ marginBottom: '14px' }}>
                <div
                  style={{
                    color: '#ffd700',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    marginBottom: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Attributes
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                  }}
                >
                  {selected.attributes.map((attr, i) => (
                    <div
                      key={`${attr.trait_type}-${i}`}
                      style={{
                        background: '#1c1e22',
                        border: '1px solid #333',
                        borderRadius: '8px',
                        padding: '8px',
                      }}
                    >
                      <div
                        style={{
                          color: '#888',
                          fontSize: '10px',
                          marginBottom: '2px',
                          textTransform: 'uppercase',
                        }}
                      >
                        {attr.trait_type || 'Trait'}
                      </div>
                      <div
                        style={{
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          wordBreak: 'break-word',
                        }}
                      >
                        {attr.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div
              style={{
                background: '#0a0a0a',
                border: '1px solid #333',
                borderRadius: '10px',
                padding: '10px',
                marginBottom: '12px',
              }}
            >
              <div style={{ color: '#888', fontSize: '10px', marginBottom: '4px' }}>
                Mint / Asset ID
              </div>
              <div
                style={{
                  color: '#e5e5e5',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                  lineHeight: 1.4,
                }}
              >
                {selected.id}
              </div>
              <button
                type="button"
                onClick={() => copyMint(selected.id)}
                style={{
                  marginTop: '8px',
                  background: '#222',
                  color: copied ? '#4ade80' : '#ffd700',
                  border: '1px solid #444',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                {copied ? '✓ Copied' : 'Copy address'}
              </button>
            </div>

            {sendOpen ? (
              <div
                style={{
                  background: '#0c0c0c',
                  border: '1px solid #444',
                  borderRadius: '12px',
                  padding: '12px',
                  marginBottom: '12px',
                }}
              >
                <div
                  style={{
                    color: '#ffd700',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    marginBottom: '8px',
                  }}
                >
                  Send NFT to wallet
                </div>
                <p style={{ color: '#888', fontSize: '11px', margin: '0 0 8px', lineHeight: 1.4 }}>
                  Free transfer on Solana. Needs a little SOL in this game wallet for fees.
                  Destination must be a Solana address you control (e.g. new Phantom).
                </p>
                <input
                  type="text"
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                  placeholder="Destination wallet (base58)"
                  disabled={sending}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    background: '#1a1a1a',
                    border: '1px solid #444',
                    borderRadius: '8px',
                    color: '#fff',
                    padding: '10px',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    marginBottom: '10px',
                  }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => {
                      setSendOpen(false);
                      setSendTo('');
                    }}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      color: '#aaa',
                      border: '1px solid #444',
                      borderRadius: '10px',
                      padding: '12px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={handleSend}
                    style={{
                      flex: 1,
                      background: sending ? '#555' : '#22c55e',
                      color: '#000',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '12px',
                      fontWeight: 'bold',
                      cursor: sending ? 'wait' : 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    {sending ? 'Sending…' : 'Confirm send'}
                  </button>
                </div>
              </div>
            ) : null}

            {!sendOpen ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setSendOpen(true)}
                  style={{
                    flex: 1,
                    background: '#22c55e',
                    color: '#000',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Send
                </button>
                <button
                  type="button"
                  onClick={handleSell}
                  style={{
                    flex: 1,
                    background: '#ffd700',
                    color: '#000',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Sell
                </button>
              </div>
            ) : null}

            <p style={{ color: '#555', fontSize: '10px', margin: '10px 0 0', textAlign: 'center' }}>
              Send = free to any wallet · Sell = list on in-game market (SOL/G2U)
            </p>
          </div>
        </div>
      )}
    </>
  );
}
