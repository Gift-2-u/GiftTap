import React from 'react';
import {
  SHARD_SWAP_CONFIG,
  hasSwapLicense,
  getSwapDurability,
  getSwapBadgeLevel,
  durabilityRemainingShards,
  durabilityFullVolumeForLevel,
  badgeLevelUpCostGft,
  getDailySwapUsed,
} from './shardSwap';

/**
 * Swap Access Card — single NFT-style panel (art + stats + actions).
 * Not on-chain yet; mint button is reserved for Lv5+ later.
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
  const editionText = `${n.toLocaleString()} of ${total.toLocaleString()}`;

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

  // Full width of parent — main event of the swap sheet
  const maxW = compact ? '100%' : 400;

  return (
    <div
      style={{
        width: '100%',
        maxWidth: maxW,
        margin: '0 auto',
        borderRadius: 16,
        overflow: 'hidden',
        background: 'linear-gradient(165deg, #12151c 0%, #0a0c10 100%)',
        border: unlocked ? '1px solid #38bdf866' : '1px solid #333',
        boxShadow: unlocked
          ? '0 8px 28px rgba(56, 189, 248, 0.12)'
          : '0 4px 16px rgba(0,0,0,0.35)',
      }}
    >
      {/* Art — larger hero image */}
      <div
        style={{
          width: '100%',
          aspectRatio: compact ? '1.65 / 1' : '16 / 9',
          maxHeight: compact ? 200 : 220,
          background: '#000',
        }}
      >
        <img
          src="/shop/swap-access-card.png"
          alt="Swap Access Card"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block',
            filter: unlocked ? 'none' : 'grayscale(0.8) brightness(0.55)',
            background: '#000',
          }}
        />
      </div>

      {/* Unified stats (NFT trait panel) */}
      <div style={{ padding: compact ? '12px 14px 14px' : '14px 16px 16px', textAlign: 'left' }}>
        {/* Title: Swap Access Card + Lv chip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 6,
            width: '100%',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontWeight: 900,
              fontSize: compact ? 17 : 18,
              color: '#f8fafc',
              letterSpacing: '0.01em',
              lineHeight: 1.2,
            }}
          >
            Swap Access Card
          </h2>
          {unlocked && level > 0 ? (
            <span
              style={{
                fontSize: 12,
                fontWeight: 900,
                color: '#e9d5ff',
                background: 'rgba(153,69,255,0.28)',
                border: '1px solid #9945FF',
                borderRadius: 999,
                padding: '3px 10px',
              }}
            >
              Lv{level}
            </span>
          ) : (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#94a3b8',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid #444',
                borderRadius: 999,
                padding: '3px 10px',
              }}
            >
              Locked
            </span>
          )}
        </div>

        {/* #1 absolute left · Access granted absolute center */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: 20,
            marginBottom: 12,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              color: '#e2e8f0',
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 700,
              zIndex: 2,
            }}
          >
            #{n.toLocaleString()}
          </span>
          <span
            style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
              color: unlocked ? '#86efac' : '#94a3b8',
              zIndex: 1,
            }}
          >
            {unlocked ? 'Access granted' : 'Not unlocked'}
          </span>
        </div>

        {/* Durability — energy-style */}
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 11, color: '#888', fontWeight: 700 }}>
              Durability
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 900,
                color: unlocked ? durColor : '#666',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {unlocked ? `${Math.round(dur)}%` : '—'}
            </span>
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 4,
              background: 'rgba(0,0,0,0.55)',
              border: '1px solid #333',
              overflow: 'hidden',
            }}
            role="progressbar"
            aria-valuenow={Math.round(dur)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              style={{
                width: unlocked ? `${dur}%` : '0%',
                height: '100%',
                background: unlocked
                  ? `linear-gradient(90deg, ${durColor}, #38bdf8)`
                  : 'transparent',
                transition: 'width 0.35s ease',
                boxShadow:
                  unlocked && dur > 0
                    ? `0 0 8px ${durColor}88`
                    : 'none',
              }}
            />
          </div>
          {unlocked ? (
            <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
              ~{durabilityRemainingShards(inventory).toLocaleString()} shards on
              this charge
            </div>
          ) : null}
        </div>

        {/* Daily limit — same feel as tap energy ⚡ used / max */}
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: '#ffd700',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              ⚡ Daily swap
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 900,
                color: '#ffd700',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {unlocked ? `${used.toLocaleString()} / ${cap.toLocaleString()}` : `0 / ${cap.toLocaleString()}`}
            </span>
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 4,
              background: 'rgba(0,0,0,0.55)',
              border: '1px solid #444',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: unlocked ? `${dailyPct}%` : '0%',
                height: '100%',
                background:
                  'linear-gradient(90deg, #ca8a04, #ffd700, #fef08a)',
                transition: 'width 0.35s ease',
                boxShadow: used > 0 ? '0 0 8px rgba(255,215,0,0.35)' : 'none',
              }}
            />
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
            {unlocked
              ? `${left.toLocaleString()} shards left today`
              : 'Unlock card to use free swap path'}
          </div>
        </div>

        {/* Actions: Level up + Mint later */}
        {unlocked && (
          <div style={{ display: 'flex', gap: 8 }}>
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
                padding: '10px 8px',
                borderRadius: 12,
                border: '1px solid #9945FF',
                background:
                  nextCost != null && canAffordLevelUp
                    ? 'rgba(153,69,255,0.22)'
                    : '#1a1a1a',
                color:
                  nextCost != null && canAffordLevelUp ? '#e9d5ff' : '#666',
                fontWeight: 800,
                fontSize: 12,
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
              disabled={!canMintSoon || typeof onMint !== 'function'}
              onClick={() => onMint && onMint()}
              title={
                canMintSoon
                  ? 'Mint coming soon'
                  : `Reach card Lv${mintMin} to mint`
              }
              style={{
                flex: 1,
                padding: '10px 8px',
                borderRadius: 12,
                border: '1px solid #38bdf866',
                background: canMintSoon
                  ? 'rgba(56,189,248,0.15)'
                  : '#1a1a1a',
                color: canMintSoon ? '#7dd3fc' : '#555',
                fontWeight: 800,
                fontSize: 12,
                cursor: canMintSoon ? 'pointer' : 'not-allowed',
              }}
            >
              {canMintSoon ? 'Mint (soon)' : `Mint · Lv${mintMin}+`}
            </button>
          </div>
        )}

        {!unlocked && !compact && (
          <div style={{ fontSize: 11, color: '#888', lineHeight: 1.4 }}>
            First unlock: Level {SHARD_SWAP_CONFIG.freeUnlockMinLevel}+ and{' '}
            {SHARD_SWAP_CONFIG.freeUnlockBurnShards.toLocaleString()} G2Ushards.
            After that, access stays granted (even below L5).
          </div>
        )}
      </div>
    </div>
  );
}
