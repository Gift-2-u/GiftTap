import React, { useState } from 'react';
import {
  SHARD_SWAP_CONFIG,
  hasSwapLicense,
  getSwapDurability,
  getSwapBadgeLevel,
  durabilityRemainingShards,
  badgeLevelUpCostGft,
  getDailySwapUsed,
} from './shardSwap';

const ACCESS_CARD_PERKS = [
  { trait: 'Type', value: 'Utility · Free path' },
  { trait: 'Access', value: 'G2Ushards → G2U credit swap' },
  { trait: 'Fee', value: '10% in G2U' },
  { trait: 'Daily cap', value: '50,000 shards / day' },
  { trait: 'Durability', value: '0–100% (drains by swap volume)' },
  { trait: 'Card level', value: '1–10 (higher = longer charge)' },
  { trait: 'First unlock', value: 'Player Level 5+ + shard burn' },
  { trait: 'After unlock', value: 'Access stays (even below L5)' },
  { trait: 'Mint', value: 'Planned at card Lv5+ for resale' },
  { trait: 'Max supply', value: '20,000 (planned series)' },
];

function NftDetailModal({
  open,
  onClose,
  title,
  imageSrc,
  subtitle,
  perks,
  statusLine,
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100060,
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
          maxWidth: 380,
          maxHeight: 'min(90dvh, 100%)',
          overflowY: 'auto',
          background: '#0f1218',
          border: '1px solid #38bdf866',
          borderRadius: 16,
          boxShadow: '0 20px 50px rgba(0,0,0,0.55)',
        }}
      >
        <div style={{ position: 'relative', background: '#000' }}>
          <img
            src={imageSrc}
            alt={title}
            style={{
              width: '100%',
              maxHeight: 280,
              objectFit: 'contain',
              display: 'block',
            }}
          />
          <button
            type="button"
            onClick={onClose}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              background: 'rgba(0,0,0,0.7)',
              border: '1px solid #555',
              color: '#fff',
              borderRadius: 999,
              width: 32,
              height: 32,
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: '14px 16px 18px', textAlign: 'left' }}>
          <h2 style={{ margin: '0 0 4px', color: '#f8fafc', fontSize: 18 }}>
            {title}
          </h2>
          {subtitle ? (
            <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>
              {subtitle}
            </div>
          ) : null}
          {statusLine ? (
            <div
              style={{
                display: 'inline-block',
                fontSize: 11,
                fontWeight: 800,
                color: '#86efac',
                border: '1px solid #4ade8088',
                borderRadius: 999,
                padding: '3px 10px',
                marginBottom: 12,
              }}
            >
              {statusLine}
            </div>
          ) : null}
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: '#64748b',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Traits / perks
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
            }}
          >
            {perks.map((p) => (
              <div
                key={p.trait}
                style={{
                  background: '#1a1d24',
                  border: '1px solid #2a2d35',
                  borderRadius: 10,
                  padding: '8px 10px',
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: '#64748b',
                    textTransform: 'uppercase',
                    marginBottom: 2,
                  }}
                >
                  {p.trait}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#e2e8f0',
                    fontWeight: 700,
                    lineHeight: 1.35,
                  }}
                >
                  {p.value}
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: '#666', margin: '12px 0 0', lineHeight: 1.4 }}>
            These traits will map to on-chain metadata when mint is enabled.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Swap Access Card panel.
 * compact=true: swap-modal strip; image is a button → NFT perks modal.
 */
export default function SwapBadgeCard({
  inventory = {},
  owned = null,
  compact = false,
  editionNumber = 1,
  editionTotal = SHARD_SWAP_CONFIG.freeAccessCardEditionTotal ?? 20_000,
  dailyCapShards = SHARD_SWAP_CONFIG.free.dailyCapShards,
  onLevelUp,
  onMint,
  levelUpBusy = false,
  levelUpCostGft = null,
  canAffordLevelUp = false,
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const unlocked = owned != null ? !!owned : hasSwapLicense(inventory);
  const dur = unlocked
    ? Math.min(100, Math.max(0, getSwapDurability(inventory)))
    : 0;
  const level = unlocked ? getSwapBadgeLevel(inventory) : 0;
  const used = unlocked ? getDailySwapUsed(inventory) : 0;
  const cap = Number(dailyCapShards) || SHARD_SWAP_CONFIG.free.dailyCapShards;
  const left = Math.max(0, cap - used);
  const dailyPct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;

  const n = Math.max(1, Number(editionNumber) || 1);
  const total =
    editionTotal != null && Number(editionTotal) > 0
      ? Number(editionTotal)
      : 20_000;
  const mintMin = SHARD_SWAP_CONFIG.freeAccessCardMintMinLevel || 5;
  const canMintSoon = unlocked && level >= mintMin;
  const nextCost =
    levelUpCostGft != null
      ? levelUpCostGft
      : unlocked
        ? badgeLevelUpCostGft(level)
        : null;

  const durColor =
    dur > 40 ? '#4ade80' : dur > 15 ? '#fbbf24' : '#f87171';

  const livePerks = [
    ...ACCESS_CARD_PERKS,
    {
      trait: 'Live durability',
      value: unlocked ? `${Math.round(dur)}%` : '—',
    },
    {
      trait: 'Live daily used',
      value: unlocked
        ? `${used.toLocaleString()} / ${cap.toLocaleString()}`
        : '—',
    },
    {
      trait: 'Card level',
      value: unlocked ? `Lv${level}` : '—',
    },
  ];

  const detail = (
    <NftDetailModal
      open={detailOpen}
      onClose={() => setDetailOpen(false)}
      title="Swap Access Card"
      imageSrc="/shop/swap-access-card.png"
      subtitle={`#${n.toLocaleString()} · Edition ${n.toLocaleString()} of ${total.toLocaleString()}${
        unlocked && level > 0 ? ` · Lv${level}` : ''
      }`}
      statusLine={unlocked ? 'Access granted' : 'Access denied'}
      perks={livePerks}
    />
  );

  // —— Compact strip for swap modal ——
  if (compact) {
    const thumb = 72;
    return (
      <>
        <div
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 12,
            border: unlocked ? '1px solid #38bdf866' : '1px solid #333',
            background: unlocked
              ? 'rgba(56,189,248,0.08)'
              : 'rgba(0,0,0,0.25)',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: unlocked ? 8 : 4,
            }}
          >
            <button
              type="button"
              onClick={() => setDetailOpen(true)}
              title="View NFT details"
              style={{
                padding: 0,
                border: '2px solid #38bdf866',
                borderRadius: 12,
                background: '#000',
                cursor: 'pointer',
                flexShrink: 0,
                overflow: 'hidden',
                width: thumb,
                height: thumb,
                boxShadow: '0 0 12px rgba(56,189,248,0.2)',
              }}
            >
              <img
                src="/shop/swap-access-card.png"
                alt="Swap Access Card"
                width={thumb}
                height={thumb}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                  filter: unlocked
                    ? 'none'
                    : 'grayscale(0.85) brightness(0.55)',
                }}
              />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 6,
                }}
              >
                <span
                  style={{ fontWeight: 800, fontSize: 14, color: '#f8fafc' }}
                >
                  Swap Access Card
                </span>
                {unlocked && level > 0 ? (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 900,
                      color: '#e9d5ff',
                      background: 'rgba(153,69,255,0.28)',
                      border: '1px solid #9945FF',
                      borderRadius: 999,
                      padding: '1px 8px',
                    }}
                  >
                    Lv{level}
                  </span>
                ) : null}
              </div>
              <div
                style={{
                  position: 'relative',
                  marginTop: 4,
                  minHeight: 16,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    color: '#e2e8f0',
                    fontVariantNumeric: 'tabular-nums',
                    zIndex: 2,
                  }}
                >
                  #{n.toLocaleString()}
                </span>
                <span
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    color: unlocked ? '#86efac' : '#f87171',
                  }}
                >
                  {unlocked ? 'Access granted' : 'Access denied'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDetailOpen(true)}
                style={{
                  marginTop: 6,
                  background: 'none',
                  border: 'none',
                  color: '#38bdf8',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: 0,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                View perks
              </button>
            </div>
          </div>

          {unlocked ? (
            <>
              <div style={{ marginBottom: 8 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 3,
                  }}
                >
                  <span style={{ fontSize: 11, color: '#888', fontWeight: 700 }}>
                    Durability
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 900,
                      color: durColor,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {Math.round(dur)}%
                  </span>
                </div>
                <div
                  style={{
                    height: 7,
                    borderRadius: 4,
                    background: 'rgba(0,0,0,0.55)',
                    border: '1px solid #333',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${dur}%`,
                      height: '100%',
                      background: `linear-gradient(90deg, ${durColor}, #38bdf8)`,
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 8 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 3,
                  }}
                >
                  <span
                    style={{ fontSize: 12, fontWeight: 800, color: '#ffd700' }}
                  >
                    Daily swap
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 900,
                      color: '#ffd700',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {used.toLocaleString()} / {cap.toLocaleString()}
                  </span>
                </div>
                <div
                  style={{
                    height: 7,
                    borderRadius: 4,
                    background: 'rgba(0,0,0,0.55)',
                    border: '1px solid #444',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${dailyPct}%`,
                      height: '100%',
                      background:
                        'linear-gradient(90deg, #ca8a04, #ffd700, #fef08a)',
                    }}
                  />
                </div>
                <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
                  {left.toLocaleString()} left today
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  disabled={
                    levelUpBusy ||
                    nextCost == null ||
                    !canAffordLevelUp ||
                    typeof onLevelUp !== 'function'
                  }
                  onClick={() => onLevelUp && onLevelUp()}
                  style={{
                    flex: 1,
                    padding: '8px 6px',
                    borderRadius: 10,
                    border: '1px solid #9945FF',
                    background:
                      nextCost != null && canAffordLevelUp
                        ? 'rgba(153,69,255,0.22)'
                        : '#1a1a1a',
                    color:
                      nextCost != null && canAffordLevelUp
                        ? '#e9d5ff'
                        : '#666',
                    fontWeight: 800,
                    fontSize: 11,
                    cursor:
                      nextCost != null && canAffordLevelUp
                        ? 'pointer'
                        : 'not-allowed',
                  }}
                >
                  {nextCost == null
                    ? `Max Lv${SHARD_SWAP_CONFIG.badgeMaxLevel}`
                    : levelUpBusy
                      ? '…'
                      : `Level up · ${nextCost} G2U`}
                </button>
                <button
                  type="button"
                  disabled={!canMintSoon}
                  onClick={() => onMint && onMint()}
                  style={{
                    flex: 1,
                    padding: '8px 6px',
                    borderRadius: 10,
                    border: '1px solid #38bdf666',
                    background: canMintSoon
                      ? 'rgba(56,189,248,0.12)'
                      : '#1a1a1a',
                    color: canMintSoon ? '#7dd3fc' : '#555',
                    fontWeight: 800,
                    fontSize: 11,
                    cursor: canMintSoon ? 'pointer' : 'not-allowed',
                  }}
                >
                  {canMintSoon ? 'Mint (soon)' : `Mint · Lv${mintMin}+`}
                </button>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
              Unlock at L{SHARD_SWAP_CONFIG.freeUnlockMinLevel}+ ·{' '}
              {SHARD_SWAP_CONFIG.freeUnlockBurnShards.toLocaleString()} shards
            </div>
          )}
        </div>
        {detail}
      </>
    );
  }

  // Full layout (non-compact)
  return (
    <>
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          margin: '0 auto',
          borderRadius: 16,
          overflow: 'hidden',
          background: '#0a0c10',
          border: unlocked ? '1px solid #38bdf866' : '1px solid #333',
          textAlign: 'left',
        }}
      >
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          style={{
            display: 'block',
            width: '100%',
            padding: 0,
            border: 'none',
            background: '#000',
            cursor: 'pointer',
          }}
        >
          <img
            src="/shop/swap-access-card.png"
            alt="Swap Access Card"
            style={{
              width: '100%',
              maxHeight: 220,
              objectFit: 'contain',
              display: 'block',
              filter: unlocked ? 'none' : 'grayscale(0.8) brightness(0.55)',
            }}
          />
        </button>
        <div style={{ padding: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 18, color: '#fff' }}>
            Swap Access Card{' '}
            {unlocked && level > 0 ? (
              <span style={{ color: '#a78bfa' }}>Lv{level}</span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            style={{
              marginTop: 8,
              background: 'rgba(56,189,248,0.15)',
              border: '1px solid #38bdf8',
              color: '#7dd3fc',
              borderRadius: 10,
              padding: '8px 12px',
              fontWeight: 800,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            View NFT perks
          </button>
        </div>
      </div>
      {detail}
    </>
  );
}

export { NftDetailModal };
export const LOCKSMITH_PERKS = [
  { trait: 'Type', value: 'Utility NFT' },
  { trait: 'Collection', value: 'Gift2u Elves' },
  { trait: 'L1', value: 'Free → L5 + Common Shoe' },
  { trait: 'L2–L3', value: 'Free → L10 / L20 + Shoe' },
  { trait: 'Levels', value: 'Grow with new walls' },
  { trait: 'Path', value: 'Opens Walk2u' },
];
