import React, { useState, useCallback, useEffect } from 'react';
import TurnstileCaptcha, { turnstileRequired } from './TurnstileCaptcha';
import {
  hasSecureSession,
  ensureSecureSession,
  secureMysteryClaimG2u,
} from './secureApi';
import {
  TOKEN_LAUNCH_AT,
  TOKEN_LAUNCH_LABEL,
  formatLaunchCountdown,
} from './tokenLaunch';

/** Mystery queue from inventory */
export function mysteryG2uPending(inventory) {
  return Math.max(0, Number(inventory?.mystery_g2u_pending) || 0);
}

/**
 * Airdrop pending — Phase 2 snapshot can set inventory.airdrop_g2u_pending
 * or pass airdropPending prop from allocations.
 */
export function airdropG2uPending(inventory, airdropPendingProp) {
  if (airdropPendingProp != null && Number.isFinite(Number(airdropPendingProp))) {
    return Math.max(0, Number(airdropPendingProp) || 0);
  }
  return Math.max(0, Number(inventory?.airdrop_g2u_pending) || 0);
}

export function getClaimableG2uSources(inventory = {}, airdropPendingProp = null) {
  const mystery = mysteryG2uPending(inventory);
  const airdrop = airdropG2uPending(inventory, airdropPendingProp);
  return {
    mystery,
    airdrop,
    total: mystery + airdrop,
    rows: [
      ...(mystery > 0
        ? [
            {
              id: 'mystery',
              source: 'Mystery Gift',
              detail: 'Bonus $G2U from badge burns',
              amount: mystery,
            },
          ]
        : []),
      ...(airdrop > 0
        ? [
            {
              id: 'airdrop',
              source: 'G2U Airdrop',
              detail: 'L5+ community allocation',
              amount: airdrop,
            },
          ]
        : []),
    ],
  };
}

const overlay = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.8)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 100050,
  padding: 16,
};

const panel = {
  background: '#131517',
  border: '1px solid #fbef43',
  borderRadius: 16,
  padding: 20,
  width: '100%',
  maxWidth: 380,
  boxSizing: 'border-box',
};

/**
 * Wallet Claim $G2U — faded until pending; popup lists Mystery + Airdrop rows.
 */
export default function ClaimG2uPanel({
  inventory = {},
  airdropPending = null,
  walletAddress = '',
  onInventoryChange,
  notify,
  /** 'button' = wallet action strip style; 'block' = full width under balances */
  variant = 'block',
}) {
  const claimable = getClaimableG2uSources(inventory, airdropPending);
  const [open, setOpen] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [tick, setTick] = useState(() => formatLaunchCountdown());

  useEffect(() => {
    const id = setInterval(() => setTick(formatLaunchCountdown()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (open && claimable.total <= 0 && !busyId) setOpen(false);
  }, [claimable.total, open, busyId]);

  const needCaptcha = turnstileRequired();
  const beforeLaunch = Date.now() < TOKEN_LAUNCH_AT;
  const hasPending = claimable.total > 0;
  const buttonLive = hasPending && hasSecureSession();

  const onCaptchaToken = useCallback((token) => {
    setCaptchaToken(token || '');
  }, []);

  const shortWallet = walletAddress
    ? `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}`
    : 'game wallet';

  const claimMystery = async () => {
    if (busyId || claimable.mystery <= 0) return;
    if (beforeLaunch) {
      notify?.(`Claim opens ${TOKEN_LAUNCH_LABEL} UTC`);
      return;
    }
    if (needCaptcha && !captchaToken) {
      notify?.('Complete the captcha to claim $G2U');
      return;
    }
    setBusyId('mystery');
    try {
      await ensureSecureSession();
      const data = await secureMysteryClaimG2u(captchaToken);
      if (data?.inventory && typeof onInventoryChange === 'function') {
        onInventoryChange(data.inventory);
      }
      const amt = Number(data?.amount) || 0;
      if (data?.already || amt <= 0) {
        notify?.('Nothing to claim from Mystery');
      } else {
        notify?.(
          `✅ Mystery: claimed ${amt.toLocaleString()} $G2U → ${shortWallet}`,
        );
      }
      setCaptchaToken('');
      setCaptchaReset((n) => n + 1);
      // Close if nothing left after refresh — parent inventory update drives claimable
    } catch (e) {
      notify?.(e?.message || 'Claim failed');
      setCaptchaToken('');
      setCaptchaReset((n) => n + 1);
    } finally {
      setBusyId(null);
    }
  };

  const claimAirdrop = async () => {
    if (busyId || claimable.airdrop <= 0) return;
    if (beforeLaunch) {
      notify?.(`Claim opens ${TOKEN_LAUNCH_LABEL} UTC`);
      return;
    }
    // Phase 2 Edge not live yet
    notify?.(
      'Airdrop claim opens after the official snapshot (same wallet Claim). Mystery claim works at launch.',
    );
  };

  const btnStyle = (enabled) =>
    variant === 'button'
      ? {
          flex: 1,
          padding: '12px',
          borderRadius: '10px',
          background: enabled
            ? 'linear-gradient(90deg,#fbef43,#fbbf24)'
            : '#2a2d34',
          color: enabled ? '#000' : '#666',
          fontWeight: 'bold',
          border: enabled ? 'none' : '1px solid #333',
          cursor: enabled ? 'pointer' : 'not-allowed',
          opacity: enabled ? 1 : 0.55,
          outline: 'none',
          WebkitTapHighlightColor: 'transparent',
        }
      : {
          width: '100%',
          padding: '12px',
          borderRadius: 10,
          border: enabled ? '1px solid rgba(251,239,67,0.5)' : '1px solid #333',
          background: enabled
            ? 'linear-gradient(90deg,#fbef43,#fbbf24)'
            : '#1c1e22',
          color: enabled ? '#000' : '#666',
          fontWeight: 'bold',
          fontSize: 14,
          cursor: enabled ? 'pointer' : 'not-allowed',
          opacity: enabled ? 1 : 0.55,
          marginTop: 8,
        };

  return (
    <>
      <button
        type="button"
        disabled={!buttonLive}
        onClick={() => {
          if (!buttonLive) return;
          setOpen(true);
        }}
        style={btnStyle(buttonLive)}
        title={
          hasPending
            ? `${claimable.total.toLocaleString()} $G2U ready to claim`
            : 'No $G2U to claim yet'
        }
      >
        {hasPending
          ? `Claim $G2U · ${claimable.total.toLocaleString()}`
          : 'Claim $G2U'}
      </button>

      {open ? (
        <div
          style={overlay}
          onClick={() => !busyId && setOpen(false)}
          role="presentation"
        >
          <div style={panel} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 14,
              }}
            >
              <h3 style={{ color: '#fbef43', margin: 0, fontSize: 18 }}>
                Claim $G2U
              </h3>
              <button
                type="button"
                disabled={!!busyId}
                onClick={() => setOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#888',
                  fontSize: 22,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <p style={{ color: '#aaa', fontSize: 12, margin: '0 0 12px', lineHeight: 1.4 }}>
              Pays on-chain $G2U to your game wallet ({shortWallet}).
              {beforeLaunch
                ? ` Opens ${TOKEN_LAUNCH_LABEL} UTC${tick ? ` · ${tick}` : ''}.`
                : ''}
            </p>

            {claimable.rows.length === 0 ? (
              <p style={{ color: '#888', fontSize: 13 }}>Nothing pending.</p>
            ) : (
              claimable.rows.map((row) => (
                <div
                  key={row.id}
                  style={{
                    background: '#1c1e22',
                    border: '1px solid #333',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>
                      {row.source}
                    </span>
                    <span style={{ color: '#fbef43', fontWeight: 800, fontSize: 14 }}>
                      {row.amount.toLocaleString()} $G2U
                    </span>
                  </div>
                  <div style={{ color: '#888', fontSize: 11, marginBottom: 10 }}>
                    {row.detail}
                  </div>
                  <button
                    type="button"
                    disabled={
                      !!busyId ||
                      beforeLaunch ||
                      (needCaptcha && !captchaToken && row.id === 'mystery')
                    }
                    onClick={() =>
                      row.id === 'mystery' ? claimMystery() : claimAirdrop()
                    }
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: 'none',
                      borderRadius: 8,
                      fontWeight: 'bold',
                      cursor:
                        busyId || beforeLaunch ? 'not-allowed' : 'pointer',
                      background:
                        beforeLaunch || busyId
                          ? '#333'
                          : 'linear-gradient(90deg,#fbef43,#fbbf24)',
                      color: beforeLaunch || busyId ? '#777' : '#000',
                    }}
                  >
                    {busyId === row.id
                      ? 'Claiming…'
                      : beforeLaunch
                        ? `Opens ${TOKEN_LAUNCH_LABEL}`
                        : row.id === 'airdrop'
                          ? 'Claim airdrop (soon)'
                          : `Claim ${row.amount.toLocaleString()} $G2U`}
                  </button>
                </div>
              ))
            )}

            {hasPending && needCaptcha ? (
              <div style={{ marginTop: 8, marginBottom: 4 }}>
                <TurnstileCaptcha
                  onToken={onCaptchaToken}
                  resetKey={captchaReset}
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
