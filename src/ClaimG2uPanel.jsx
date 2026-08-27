import React, { useState, useCallback, useEffect } from 'react';
import TurnstileCaptcha, { turnstileRequired } from './TurnstileCaptcha';
import {
  hasSecureSession,
  ensureSecureSession,
  secureMysteryClaimG2u,
  secureAirdropClaimStatus,
  secureAirdropClaimG2u,
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
  maxHeight: '90vh',
  overflowY: 'auto',
};

/**
 * Wallet Claim $G2U — faded until pending; popup: Mystery + L5/weekly/monthly rows.
 */
export default function ClaimG2uPanel({
  inventory = {},
  walletAddress = '',
  onInventoryChange,
  notify,
  variant = 'block',
}) {
  const mysteryAmt = mysteryG2uPending(inventory);
  const [airdropRows, setAirdropRows] = useState([]);
  const [statusLoading, setStatusLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [tick, setTick] = useState(() => formatLaunchCountdown());

  const airdropTotal = airdropRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const total = mysteryAmt + airdropTotal;
  const hasPending = total > 0;

  const refreshAirdrop = useCallback(async () => {
    if (!hasSecureSession()) {
      setAirdropRows([]);
      return;
    }
    setStatusLoading(true);
    try {
      await ensureSecureSession();
      const data = await secureAirdropClaimStatus();
      setAirdropRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch {
      setAirdropRows([]);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAirdrop();
  }, [refreshAirdrop, inventory?.mystery_g2u_pending]);

  useEffect(() => {
    const id = setInterval(() => setTick(formatLaunchCountdown()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (open && total <= 0 && !busyId) setOpen(false);
  }, [total, open, busyId]);

  const needCaptcha = turnstileRequired();
  const beforeLaunch = Date.now() < TOKEN_LAUNCH_AT;
  const buttonLive = hasPending && hasSecureSession();

  const onCaptchaToken = useCallback((token) => {
    setCaptchaToken(token || '');
  }, []);

  const shortWallet = walletAddress
    ? `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}`
    : 'game wallet';

  const resetCaptcha = () => {
    setCaptchaToken('');
    setCaptchaReset((n) => n + 1);
  };

  const claimMystery = async () => {
    if (busyId || mysteryAmt <= 0) return;
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
      if (data?.already || amt <= 0) notify?.('Nothing to claim from Mystery');
      else notify?.(`✅ Mystery: ${amt.toLocaleString()} $G2U → ${shortWallet}`);
      resetCaptcha();
      await refreshAirdrop();
    } catch (e) {
      notify?.(e?.message || 'Claim failed');
      resetCaptcha();
    } finally {
      setBusyId(null);
    }
  };

  const claimAirdropRow = async (row) => {
    if (busyId || !row?.id) return;
    if (beforeLaunch) {
      notify?.(`Claim opens ${TOKEN_LAUNCH_LABEL} UTC`);
      return;
    }
    if (needCaptcha && !captchaToken) {
      notify?.('Complete the captcha to claim $G2U');
      return;
    }
    setBusyId(row.id);
    try {
      await ensureSecureSession();
      const data = await secureAirdropClaimG2u(captchaToken, row.id);
      const amt = Number(data?.amount) || 0;
      if (data?.already || amt <= 0) notify?.('Already claimed');
      else {
        notify?.(
          `✅ ${row.label || data.source}: ${amt.toLocaleString()} $G2U → ${shortWallet}`,
        );
      }
      resetCaptcha();
      await refreshAirdrop();
    } catch (e) {
      notify?.(e?.message || 'Claim failed');
      resetCaptcha();
    } finally {
      setBusyId(null);
    }
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

  const rows = [
    ...(mysteryAmt > 0
      ? [
          {
            id: 'mystery',
            label: 'Mystery Gift',
            detail: 'Bonus $G2U from badge burns',
            amount: mysteryAmt,
            kind: 'mystery',
          },
        ]
      : []),
    ...airdropRows.map((r) => ({
      id: r.id,
      label: r.label || r.source,
      detail: r.detail || r.period_id,
      amount: Number(r.amount) || 0,
      kind: 'airdrop',
      vault_ready: r.vault_ready,
    })),
  ];

  return (
    <>
      <button
        type="button"
        disabled={!buttonLive}
        onClick={() => {
          if (!buttonLive) return;
          refreshAirdrop();
          setOpen(true);
        }}
        style={btnStyle(buttonLive)}
        title={
          hasPending
            ? `${total.toLocaleString()} $G2U ready to claim`
            : 'No $G2U to claim yet'
        }
      >
        {hasPending
          ? `Claim $G2U · ${total.toLocaleString()}`
          : statusLoading
            ? 'Claim $G2U…'
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

            <p
              style={{
                color: '#aaa',
                fontSize: 12,
                margin: '0 0 12px',
                lineHeight: 1.4,
              }}
            >
              Pays on-chain $G2U to your game wallet ({shortWallet}).
              {beforeLaunch
                ? ` Opens ${TOKEN_LAUNCH_LABEL} UTC${tick ? ` · ${tick}` : ''}.`
                : ''}
            </p>

            {rows.length === 0 ? (
              <p style={{ color: '#888', fontSize: 13 }}>Nothing pending.</p>
            ) : (
              rows.map((row) => (
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
                      {row.label}
                    </span>
                    <span
                      style={{ color: '#fbef43', fontWeight: 800, fontSize: 14 }}
                    >
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
                      (needCaptcha && !captchaToken)
                    }
                    onClick={() =>
                      row.kind === 'mystery'
                        ? claimMystery()
                        : claimAirdropRow(row)
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
                    {(busyId === row.id ||
                    (busyId === 'mystery' && row.kind === 'mystery'))
                      ? 'Claiming…'
                      : beforeLaunch
                        ? `Opens ${TOKEN_LAUNCH_LABEL}`
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
