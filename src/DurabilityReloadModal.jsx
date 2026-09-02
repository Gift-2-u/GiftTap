/**
 * Durability reload popup — same idea as Instant Refill:
 * rate 1,000 $G2U = 1%, edit % or G2U, then Accept.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  NFT_DURABILITY_G2U_PER_PERCENT,
  NFT_DURABILITY_MAX,
} from './nftDurability';

export default function DurabilityReloadModal({
  open,
  onClose,
  onAccept,
  kind = 'echo',
  currentPct = 0,
  gftBalance = 0,
  busy = false,
}) {
  // Match the bar display (rounded %). Avoid "100% · room 1%" from float leftovers.
  const shownPct = Math.max(
    0,
    Math.min(NFT_DURABILITY_MAX, Math.round(Number(currentPct) || 0)),
  );
  const room = Math.max(0, NFT_DURABILITY_MAX - shownPct);
  const [percent, setPercent] = useState(1);
  const [g2uInput, setG2uInput] = useState(String(NFT_DURABILITY_G2U_PER_PERCENT));

  useEffect(() => {
    if (!open) return;
    // Default to max fill (room %)
    const startPct = room > 0 ? room : 0;
    setPercent(startPct);
    setG2uInput(String(startPct * NFT_DURABILITY_G2U_PER_PERCENT));
  }, [open, room]);

  const maxCost = room * NFT_DURABILITY_G2U_PER_PERCENT;
  const cost = useMemo(
    () => Math.max(0, Math.floor(Number(percent) || 0) * NFT_DURABILITY_G2U_PER_PERCENT),
    [percent],
  );
  const bal = Number(gftBalance) || 0;
  const canAccept = room > 0 && percent >= 1;
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!open) setNotice(null);
  }, [open]);

  const applyPercent = (raw) => {
    let p = Math.floor(Number(raw) || 0);
    if (p < 0) p = 0;
    if (p > room) p = room;
    setPercent(p);
    setG2uInput(String(p * NFT_DURABILITY_G2U_PER_PERCENT));
  };

  const applyG2u = (raw) => {
    const cleaned = String(raw).replace(/[^\d]/g, '');
    setG2uInput(cleaned);
    let g = Math.floor(Number(cleaned) || 0);
    let p = Math.floor(g / NFT_DURABILITY_G2U_PER_PERCENT);
    if (p > room) p = room;
    if (p < 0) p = 0;
    setPercent(p);
    // Snap display cost to whole % when leaving field — keep typed while editing
  };

  const snapG2uToPercent = () => {
    setG2uInput(String(percent * NFT_DURABILITY_G2U_PER_PERCENT));
  };

  if (!open) return null;

  const kindLabel =
    String(kind || 'elf').charAt(0).toUpperCase() + String(kind || 'elf').slice(1);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100080,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 340,
          background: '#131517',
          border: '2px solid #4ade80',
          borderRadius: 16,
          padding: 16,
          boxShadow: '0 20px 50px rgba(0,0,0,0.55)',
        }}
      >
        <h3 style={{ margin: '0 0 4px', color: '#4ade80', fontSize: 16 }}>
          Reload durability
        </h3>
        <p style={{ margin: '0 0 12px', color: '#888', fontSize: 12, lineHeight: 1.4 }}>
          {kindLabel} · {shownPct}% · pays on-chain $G2U + 0.0005 SOL fee
        </p>

        <div
          style={{
            background: '#0e0f14',
            border: '1px solid #333',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
            textAlign: 'center',
          }}
        >
          <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>
            Rate
          </div>
          <div style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>
            {NFT_DURABILITY_G2U_PER_PERCENT.toLocaleString()} $G2U = 1%
          </div>
        </div>

        <label style={{ display: 'block', color: '#888', fontSize: 11, marginBottom: 4 }}>
          Durability %
        </label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <button
            type="button"
            disabled={busy || percent <= 1 || room <= 0}
            onClick={() => applyPercent(percent - 1)}
            style={stepBtn}
          >
            −
          </button>
          <input
            type="number"
            min={0}
            max={room}
            value={percent}
            disabled={busy || room <= 0}
            onChange={(e) => applyPercent(e.target.value)}
            style={inputStyle}
          />
          <button
            type="button"
            disabled={busy || percent >= room || room <= 0}
            onClick={() => applyPercent(percent + 1)}
            style={stepBtn}
          >
            +
          </button>
        </div>

        <label style={{ display: 'block', color: '#888', fontSize: 11, marginBottom: 4 }}>
          $G2U amount
        </label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <button
            type="button"
            disabled={busy || percent <= 1 || room <= 0}
            onClick={() => applyPercent(percent - 1)}
            style={stepBtn}
          >
            −
          </button>
          <input
            type="text"
            inputMode="numeric"
            value={g2uInput}
            disabled={busy || room <= 0}
            onChange={(e) => applyG2u(e.target.value)}
            onBlur={snapG2uToPercent}
            style={inputStyle}
          />
          <button
            type="button"
            disabled={busy || percent >= room || room <= 0}
            onClick={() => applyPercent(percent + 1)}
            style={stepBtn}
          >
            +
          </button>
        </div>

        <div style={{ color: '#ccc', fontSize: 13, marginBottom: 6, lineHeight: 1.4 }}>
          Max reload {room}% ={' '}
          <span style={{ color: '#ffd700', fontWeight: 'bold' }}>
            {maxCost.toLocaleString()} G2U
          </span>
        </div>
        <div style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>
          Balance: {Math.floor(bal).toLocaleString()} G2U
        </div>

        {notice ? (
          <div
            style={{
              marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #f8717166',
              background: 'rgba(248,113,113,0.12)',
              color: '#fca5a5',
              fontSize: 12,
              fontWeight: 'bold',
              textAlign: 'center',
            }}
          >
            {notice}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 10,
              border: '1px solid #555',
              background: '#222',
              color: '#fff',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !canAccept}
            onClick={() => {
              if (bal + 1e-9 < cost) {
                setNotice(
                  `Not enough G2U (need ${cost.toLocaleString()}, have ${Math.floor(bal).toLocaleString()})`,
                );
                return;
              }
              setNotice(null);
              onAccept?.(percent);
            }}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 10,
              border: 'none',
              background: canAccept
                ? 'linear-gradient(90deg, #16a34a, #4ade80)'
                : '#333',
              color: canAccept ? '#000' : '#666',
              fontWeight: 'bold',
              cursor: busy || !canAccept ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? '…' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  );
}

const stepBtn = {
  width: 40,
  height: 40,
  borderRadius: 10,
  border: '1px solid #444',
  background: '#1a1d24',
  color: '#fff',
  fontSize: 18,
  fontWeight: 'bold',
  cursor: 'pointer',
  flexShrink: 0,
};

const inputStyle = {
  flex: 1,
  minWidth: 0,
  height: 40,
  borderRadius: 10,
  border: '1px solid #333',
  background: '#0a0a0e',
  color: '#fff',
  fontSize: 16,
  fontWeight: 'bold',
  textAlign: 'center',
  outline: 'none',
};
