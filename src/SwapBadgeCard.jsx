import React from 'react';
import {
  SHARD_SWAP_CONFIG,
  hasSwapLicense,
  getSwapDurability,
  getSwapBadgeLevel,
  durabilityRemainingShards,
  badgeLevelUpCostGft,
  getDailySwapUsed,
} from './shardSwap';

/**
 * Swap Access Card panel.
 * compact=true (swap modal): slim “gameplay” strip matching GiftLocksmith daily bar.
 * compact=false: larger card for showcase elsewhere.
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

  // —— Compact: same density as GiftLocksmith daily strip ——
  if (compact) {
    return (
      <div
        style={{
          width: '100%',
          marginBottom: 0,
          padding: '10px 12px',
          borderRadius: 12,
          border: unlocked ? '1px solid #38bdf866' : '1px solid #333',
          background: unlocked
            ? 'rgba(56,189,248,0.08)'
            : 'rgba(0,0,0,0.25)',
          textAlign: 'left',
        }}
      >
        {/* Header row: thumb + name/Lv + status */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: unlocked ? 8 : 4,
          }}
        >
          <img
            src="/shop/swap-access-card.png"
            alt=""
            width={44}
            height={44}
            style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              objectFit: 'cover',
              background: '#000',
              border: '1px solid #333',
              flexShrink: 0,
              filter: unlocked ? 'none' : 'grayscale(0.85) brightness(0.55)',
            }}
          />
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
                style={{
                  fontWeight: 800,
                  fontSize: 14,
                  color: '#f8fafc',
                }}
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
                marginTop: 3,
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
          </div>
        </div>

        {unlocked ? (
          <>
            {/* Durability — only free path needs this */}
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
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>

            {/* Daily — same energy style as Locksmith */}
            <div style={{ marginBottom: 8 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 3,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: '#ffd700',
                  }}
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
                    transition: 'width 0.3s ease',
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
                    nextCost != null && canAffordLevelUp ? '#e9d5ff' : '#666',
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
    );
  }

  // —— Full (non-compact) showcase — same fields, larger art ——
  const total =
    editionTotal != null && Number(editionTotal) > 0
      ? Number(editionTotal)
      : 20_000;

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 400,
        margin: '0 auto',
        borderRadius: 16,
        overflow: 'hidden',
        background: 'linear-gradient(165deg, #12151c 0%, #0a0c10 100%)',
        border: unlocked ? '1px solid #38bdf866' : '1px solid #333',
        textAlign: 'left',
      }}
    >
      <div
        style={{
          width: '100%',
          aspectRatio: '16 / 9',
          maxHeight: 200,
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
          }}
        />
      </div>
      <div style={{ padding: '14px 16px 16px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 6,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontWeight: 900,
              fontSize: 18,
              color: '#f8fafc',
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
          ) : null}
        </div>
        <div
          style={{
            position: 'relative',
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
              color: '#e2e8f0',
              fontVariantNumeric: 'tabular-nums',
              zIndex: 2,
            }}
          >
            #{n.toLocaleString()}
          </span>
          <span
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              color: unlocked ? '#86efac' : '#f87171',
              whiteSpace: 'nowrap',
            }}
          >
            {unlocked ? 'Access granted' : 'Access denied'}
          </span>
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
          Edition {n.toLocaleString()} of {total.toLocaleString()}
        </div>
        {unlocked ? (
          <>
            <div style={{ marginBottom: 10 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: 11, color: '#888', fontWeight: 700 }}>
                  Durability
                </span>
                <span style={{ fontWeight: 900, color: durColor }}>
                  {Math.round(dur)}%
                </span>
              </div>
              <div
                style={{
                  height: 8,
                  borderRadius: 4,
                  background: '#000',
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
              <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
                ~{durabilityRemainingShards(inventory).toLocaleString()} shards
                on charge
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 800, color: '#ffd700' }}>
                  Daily swap
                </span>
                <span style={{ fontWeight: 900, color: '#ffd700' }}>
                  {used.toLocaleString()} / {cap.toLocaleString()}
                </span>
              </div>
              <div
                style={{
                  height: 8,
                  borderRadius: 4,
                  background: '#000',
                  border: '1px solid #444',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${dailyPct}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #ca8a04, #ffd700)',
                  }}
                />
              </div>
            </div>
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
                  padding: '10px',
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
                  : `Level up · ${nextCost} G2U`}
              </button>
              <button
                type="button"
                disabled={!canMintSoon}
                onClick={() => onMint && onMint()}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 12,
                  border: '1px solid #38bdf666',
                  background: canMintSoon
                    ? 'rgba(56,189,248,0.12)'
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
          </>
        ) : (
          <div style={{ fontSize: 11, color: '#888' }}>
            Unlock at L{SHARD_SWAP_CONFIG.freeUnlockMinLevel}+ ·{' '}
            {SHARD_SWAP_CONFIG.freeUnlockBurnShards.toLocaleString()} shards
          </div>
        )}
      </div>
    </div>
  );
}
