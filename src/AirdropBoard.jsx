import React from 'react';
import { AIRDROP_META, L5_LIFETIME_TAPS_TARGET } from './airdropProgress';

/**
 * Visual G2U airdrop checklist board.
 * @param {{ progress: ReturnType<import('./airdropProgress').computeAirdropProgress>, username?: string, compact?: boolean }} props
 */
export default function AirdropBoard({ progress, username, compact = false }) {
  if (!progress) {
    return (
      <div style={{ color: '#888', textAlign: 'center', padding: 24 }}>
        Sign in / play Gift Tap so we can load your airdrop board.
      </div>
    );
  }

  const {
    qualified,
    totalBonus: totalBonusProp,
    tier,
    checks,
    lifetimeTaps,
    streak,
    multiplier,
    potentialMultiplier,
    l5TapsTarget: l5TargetProp,
    l5TapsProgress: l5ProgressProp,
    l5TapsRemaining: l5RemainingProp,
  } = progress;

  // Always derive from checkmarks so UI total matches ✓ rows (e.g. NFT ✓ → +25%)
  const totalBonus = Array.isArray(checks)
    ? checks.reduce((sum, c) => sum + (Number(c.earnedPct) || 0), 0)
    : Number(totalBonusProp) || 0;

  const l5Target = Number(l5TargetProp) || L5_LIFETIME_TAPS_TARGET;
  const taps = Number(lifetimeTaps) || 0;
  const l5Ratio = Math.min(
    1,
    Number.isFinite(l5ProgressProp) ? l5ProgressProp : taps / l5Target,
  );
  const l5Remaining = Number.isFinite(l5RemainingProp)
    ? Math.max(0, l5RemainingProp)
    : Math.max(0, l5Target - taps);
  const l5PctLabel = Math.min(100, Math.floor(l5Ratio * 100));

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 520,
        margin: '0 auto',
        textAlign: 'left',
        boxSizing: 'border-box',
      }}
    >
      {!compact && (
        <>
          <p
            style={{
              color: '#a78bfa',
              fontSize: 11,
              fontWeight: 'bold',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              textAlign: 'center',
              margin: 0,
            }}
          >
            Gift2u · {AIRDROP_META.season}
          </p>
          <h1
            style={{
              margin: '8px 0 6px',
              textAlign: 'center',
              fontSize: compact ? 22 : 28,
              fontWeight: 900,
              background: 'linear-gradient(90deg, #c084fc, #fbef43)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {AIRDROP_META.title}
          </h1>
          <p
            style={{
              color: '#94a3b8',
              fontSize: 13,
              lineHeight: 1.45,
              textAlign: 'center',
              margin: '0 0 16px',
            }}
          >
            {AIRDROP_META.subtitle}
          </p>
        </>
      )}

      {/* Status card */}
      <div
        style={{
          background: qualified
            ? 'linear-gradient(145deg, rgba(74,222,128,0.12), #111)'
            : 'linear-gradient(145deg, rgba(248,113,113,0.1), #111)',
          border: `1px solid ${qualified ? 'rgba(74,222,128,0.45)' : 'rgba(248,113,113,0.35)'}`,
          borderRadius: 16,
          padding: '16px 18px',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>
              {username ? `@${username}` : 'Your board'}
            </div>
            <div
              style={{
                color: qualified ? '#4ade80' : '#f87171',
                fontWeight: 'bold',
                fontSize: 16,
              }}
            >
              {qualified ? '✓ Qualified (Level 5)' : '☐ Not qualified yet — clear L5 to unlock share'}
            </div>
            <div style={{ color: '#666', fontSize: 11, marginTop: 6 }}>
              Lifetime taps: {taps.toLocaleString()} · Streak: {streak}d
            </div>
            {!qualified && totalBonus > 0 ? (
              <div style={{ color: '#a78bfa', fontSize: 11, marginTop: 6, lineHeight: 1.35 }}>
                You already have <strong style={{ color: '#ffd700' }}>+{totalBonus}%</strong> waiting —
                reach Level 5 to activate it.
              </div>
            ) : null}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                color: qualified ? tier.color : '#888',
                fontWeight: 900,
                fontSize: 18,
                letterSpacing: '0.02em',
              }}
            >
              {qualified ? tier.label : 'Locked'}
            </div>
            <div style={{ color: '#ffd700', fontWeight: 'bold', fontSize: 20, marginTop: 4 }}>
              +{totalBonus}%
            </div>
            <div style={{ color: '#666', fontSize: 10, marginTop: 2 }}>
              {qualified
                ? `${multiplier.toFixed(2)}× weight`
                : totalBonus > 0
                  ? `${(potentialMultiplier || 1 + totalBonus / 100).toFixed(2)}× when L5`
                  : 'no share until L5'}
            </div>
          </div>
        </div>

        {/* L5 progress — lifetime taps → 50,000 (wall) */}
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 6,
              gap: 8,
            }}
          >
            <span style={{ color: qualified ? '#4ade80' : '#ccc', fontSize: 11, fontWeight: 'bold' }}>
              {qualified ? 'Level 5 path complete' : 'Path to Level 5'}
            </span>
            <span style={{ color: '#888', fontSize: 11, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
              {taps.toLocaleString()} / {l5Target.toLocaleString()}
              {!qualified ? ` · ${l5PctLabel}%` : ' · 100%'}
            </span>
          </div>
          <div
            style={{
              width: '100%',
              height: 10,
              borderRadius: 999,
              background: 'rgba(0,0,0,0.45)',
              border: '1px solid #333',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${qualified ? 100 : l5PctLabel}%`,
                borderRadius: 999,
                background: qualified
                  ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                  : 'linear-gradient(90deg, #16a34a, #4ade80)',
                boxShadow: '0 0 10px rgba(74, 222, 128, 0.35)',
                transition: 'width 0.35s ease',
              }}
            />
          </div>
          {!qualified ? (
            <div style={{ color: '#666', fontSize: 10, marginTop: 6 }}>
              {l5Remaining.toLocaleString()} lifetime taps left to the Level 5 wall (50,000)
            </div>
          ) : null}
        </div>
      </div>

      {/* Checklist */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {checks.map((c) => (
          <div
            key={c.id}
            style={{
              background: '#111',
              border: `1px solid ${
                c.id === 'l5' && !c.done
                  ? 'rgba(248,113,113,0.4)'
                  : c.done
                    ? 'rgba(74,222,128,0.35)'
                    : '#2a2a2a'
              }`,
              borderRadius: 12,
              padding: '12px 14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
                <span
                  style={{
                    fontSize: 16,
                    lineHeight: 1.2,
                    color: c.done ? '#4ade80' : '#555',
                    flexShrink: 0,
                  }}
                >
                  {c.done ? '✓' : '☐'}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>{c.label}</div>
                  <div style={{ color: '#666', fontSize: 11, marginTop: 3, lineHeight: 1.35 }}>
                    {c.detail}
                  </div>
                </div>
              </div>
              <span
                style={{
                  color: c.done ? '#ffd700' : c.required && !c.done ? '#f87171' : '#555',
                  fontWeight: 'bold',
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {c.done && c.earnedPct > 0 ? `+${c.earnedPct}%` : c.bonusLabel}
              </span>
            </div>

            {Array.isArray(c.sub) && c.sub.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginTop: 10,
                  marginLeft: 26,
                }}
              >
                {c.sub.map((s) => (
                  <span
                    key={s.label}
                    style={{
                      fontSize: 10,
                      fontWeight: 'bold',
                      padding: '4px 8px',
                      borderRadius: 999,
                      border: `1px solid ${s.done ? 'rgba(74,222,128,0.4)' : '#333'}`,
                      color: s.done ? '#4ade80' : '#666',
                      background: s.done ? 'rgba(74,222,128,0.08)' : '#0a0a0a',
                    }}
                  >
                    {s.done ? '✓' : '☐'} {s.label} +{s.pct}%
                  </span>
                ))}
              </div>
            )}

            {/* L5 checklist row: green bar toward 50k lifetime taps */}
            {c.id === 'l5' && c.progress && (
              <div style={{ marginTop: 10, marginLeft: 26 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 10,
                    color: '#888',
                    marginBottom: 4,
                    fontWeight: 'bold',
                  }}
                >
                  <span>Lifetime taps → L5 wall</span>
                  <span>
                    {Number(c.progress.current).toLocaleString()} /{' '}
                    {Number(c.progress.target).toLocaleString()}
                  </span>
                </div>
                <div
                  style={{
                    width: '100%',
                    height: 8,
                    borderRadius: 999,
                    background: '#0a0a0a',
                    border: '1px solid #333',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, Math.floor((c.progress.ratio || 0) * 100))}%`,
                      borderRadius: 999,
                      background: 'linear-gradient(90deg, #16a34a, #4ade80)',
                      transition: 'width 0.35s ease',
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 14,
          borderRadius: 12,
          background: '#0d0d0f',
          border: '1px solid #2a2a2a',
          textAlign: 'center',
        }}
      >
        <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>Total bonus · estimated tier</div>
        <div style={{ color: '#ffd700', fontWeight: 900, fontSize: 22 }}>
          +{totalBonus}% ·{' '}
          <span style={{ color: qualified ? tier.color : '#888' }}>
            {qualified ? tier.label : 'Locked until L5'}
          </span>
        </div>
        {!qualified ? (
          <p style={{ color: '#a78bfa', fontSize: 11, margin: '8px 0 0', lineHeight: 1.4 }}>
            Checkmarks and % count now. Clear the Level 5 wall to turn this into real airdrop weight.
          </p>
        ) : null}
        <p style={{ color: '#555', fontSize: 10, lineHeight: 1.4, margin: '10px 0 0' }}>
          {AIRDROP_META.disclaimer}
        </p>
      </div>
    </div>
  );
}
