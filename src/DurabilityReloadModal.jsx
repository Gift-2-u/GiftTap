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
  const room = Math.max(
    0,
    Math.ceil(NFT_DURABILITY_MAX - Number(currentPct || 0)),
  );
  const [percent, setPercent] = useState(1);
  const [g2uInput, setG2uInput] = useState(String(NFT_DURABILITY_G2U_PER_PERCENT));

  useEffect(() => {
    if (!open) return;
    const startPct = room > 0 ? 1 : 0;
    setPercent(startPct);
    setG2uInput(String(startPct * NFT_DURABILITY_G2U_PER_PERCENT));
  }, [open, room]);

  const cost = useMemo(
    () => Math.max(0, Math.floor(Number(percent) || 0) * NFT_DURABILITY_G2U_PER_PERCENT),
    [percent],
  );
  const after = Math.min(
    NFT_DURABILITY_MAX,
    Math.round((Number(currentPct) || 0) + (Number(percent) || 0)),
  );
  const bal = Number(gftBalance) || 0;
  const canPay = room > 0 && percent >= 1 && bal + 1e-9 >= cost;

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
          {kindLabel} · now {Math.round(Number(currentPct) || 0)}%
          {room <= 0 ? ' · already full' : ` · room ${room}%`}
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

        <div style={{ color: '#666', fontSize: 11, marginBottom: 12, lineHeight: 1.4 }}>
          After reload: <span style={{ color: '#4ade80', fontWeight: 'bold' }}>{after}%</span>
          {' · '}
          Cost:{' '}
          <span style={{ color: '#ffd700', fontWeight: 'bold' }}>
            {cost.toLocaleString()} $G2U
          </span>
          <br />
          Balance: {Math.floor(bal).toLocaleString()} $G2U
          {!canPay && percent >= 1 && room > 0 ? (
            <span style={{ color: '#f87171' }}> · not enough $G2U</span>
          ) : null}
        </div>

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
            disabled={busy || !canPay}
            onClick={() => onAccept?.(percent)}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 10,
              border: 'none',
              background: canPay
                ? 'linear-gradient(90deg, #16a34a, #4ade80)'
                : '#333',
              color: canPay ? '#000' : '#666',
              fontWeight: 'bold',
              cursor: busy || !canPay ? 'not-allowed' : 'pointer',
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
