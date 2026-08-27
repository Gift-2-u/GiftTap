import React, { useState, useCallback } from 'react';
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

/**
 * Claim Mystery Bonus $G2U (pending) → on-chain game wallet.
 * Captcha when Turnstile site key is set.
 */
export default function ClaimG2uPanel({
  inventory = {},
  onInventoryChange,
  notify,
  compact = false,
}) {
  const pending = Math.max(0, Number(inventory?.mystery_g2u_pending) || 0);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(() => formatLaunchCountdown());

  React.useEffect(() => {
    const id = setInterval(() => setTick(formatLaunchCountdown()), 1000);
    return () => clearInterval(id);
  }, []);

  const needCaptcha = turnstileRequired();
  const beforeLaunch = Date.now() < TOKEN_LAUNCH_AT;
  const canTry = pending > 0 && hasSecureSession() && (!needCaptcha || !!captchaToken);

  const onCaptchaToken = useCallback((token) => {
    setCaptchaToken(token || '');
  }, []);

  const handleClaim = async () => {
    if (!canTry || busy) return;
    if (needCaptcha && !captchaToken) {
      notify?.('Complete the captcha to claim $G2U');
      return;
    }
    setBusy(true);
    try {
      await ensureSecureSession();
      const data = await secureMysteryClaimG2u(captchaToken);
      if (data?.inventory && typeof onInventoryChange === 'function') {
        onInventoryChange(data.inventory);
      }
      const amt = Number(data?.amount) || 0;
      if (data?.already || amt <= 0) {
        notify?.('Nothing to claim');
      } else {
        notify?.(
          `✅ Claimed ${amt.toLocaleString()} $G2U → game wallet${
            data?.signature ? ` · ${String(data.signature).slice(0, 8)}…` : ''
          }`,
        );
      }
      setCaptchaToken('');
      setCaptchaReset((n) => n + 1);
    } catch (e) {
      notify?.(e?.message || 'Claim failed');
      setCaptchaToken('');
      setCaptchaReset((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const box = {
    background: compact ? 'rgba(251,239,67,0.06)' : '#151820',
    border: '1px solid rgba(251,239,67,0.35)',
    borderRadius: 12,
    padding: compact ? '10px 12px' : 14,
    marginTop: compact ? 8 : 12,
    textAlign: 'left',
  };

  return (
    <div style={box}>
      <div
        style={{
          color: '#fde68a',
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        Claim $G2U
      </div>
      <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
        {pending > 0
          ? `${pending.toLocaleString()} $G2U pending → game wallet`
          : 'No Mystery $G2U pending'}
      </div>
      <div style={{ color: '#888', fontSize: 11, lineHeight: 1.4, marginBottom: 10 }}>
        {beforeLaunch
          ? `Unlocks at token launch (${TOKEN_LAUNCH_LABEL} UTC)${
              tick ? ` · ${tick}` : ''
            }. Mystery Bonus G2U queues here until then.`
          : 'Mystery Gift Bonus $G2U (and later airdrop) claim to your in-game Solana wallet.'}
      </div>
      {pending > 0 && needCaptcha ? (
        <div style={{ marginBottom: 10 }}>
          <TurnstileCaptcha onToken={onCaptchaToken} resetKey={captchaReset} />
        </div>
      ) : null}
      <button
        type="button"
        disabled={!canTry || busy || (beforeLaunch && pending > 0)}
        onClick={handleClaim}
        style={{
          width: '100%',
          padding: '12px',
          border: 'none',
          borderRadius: 10,
          fontWeight: 'bold',
          fontSize: 14,
          cursor: canTry && !busy && !beforeLaunch ? 'pointer' : 'not-allowed',
          background:
            canTry && !busy && !beforeLaunch
              ? 'linear-gradient(90deg,#fbef43,#fbbf24)'
              : '#333',
          color: canTry && !busy && !beforeLaunch ? '#000' : '#777',
        }}
      >
        {busy
          ? 'Claiming…'
          : beforeLaunch
            ? `Opens ${TOKEN_LAUNCH_LABEL}`
            : pending > 0
              ? `Claim ${pending.toLocaleString()} $G2U`
              : 'Nothing to claim'}
      </button>
    </div>
  );
}

/** Read pending from inventory-like object */
export function mysteryG2uPending(inventory) {
  return Math.max(0, Number(inventory?.mystery_g2u_pending) || 0);
}
