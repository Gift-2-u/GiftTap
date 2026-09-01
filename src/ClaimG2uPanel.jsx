import React, { useState, useCallback, useEffect } from 'react';
import { Connection, Transaction, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
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
import { keypairFromMnemonic } from './solanaWallet';
import { RPC_URL } from './rpc';

/** Minimum SOL so user can pay fee (+ ATA rent if needed). */
const MIN_CLAIM_SOL = 0.01;

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
  decryptedPhrase = '',
  onInventoryChange,
  /** After on-chain $G2U lands — parent should refetch wallet balances (no manual Refresh). */
  onBalancesRefresh = null,
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
      if (typeof onBalancesRefresh === 'function') {
        try {
          await onBalancesRefresh({ source: 'mystery', amount: amt });
        } catch (e) {
          console.warn('claim balance refresh', e?.message || e);
        }
      }
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
    const secret = String(decryptedPhrase || '').trim();
    if (!secret) {
      notify?.(
        'Unlock your game wallet first (Settings / login password) — you pay a small SOL network fee to claim.',
      );
      return;
    }
    setBusyId(row.id);
    try {
      await ensureSecureSession();
      let playerKeypair;
      if (secret.includes(' ')) {
        playerKeypair = keypairFromMnemonic(secret);
      } else {
        playerKeypair = Keypair.fromSecretKey(bs58.decode(secret));
      }
      if (
        walletAddress &&
        playerKeypair.publicKey.toBase58() !== String(walletAddress).trim()
      ) {
        throw new Error('Unlocked wallet does not match your game wallet');
      }

      const connection = new Connection(RPC_URL, 'confirmed');
      const lamports = await connection.getBalance(playerKeypair.publicKey);
      const sol = lamports / 1e9;
      if (sol < MIN_CLAIM_SOL) {
        throw new Error(
          `Need at least ${MIN_CLAIM_SOL} SOL in your game wallet for the network fee (you have ${sol.toFixed(4)} SOL).`,
        );
      }

      notify?.('Preparing claim… you will pay the Solana fee; $G2U comes from the vault.');
      const prepared = await secureAirdropClaimG2u(captchaToken, row.id, {
        action: 'prepare',
      });
      if (prepared?.already) {
        notify?.('Already claimed');
        resetCaptcha();
        await refreshAirdrop();
        return;
      }
      if (!prepared?.need_sign || !prepared?.tx_base64) {
        throw new Error(prepared?.error || 'Could not prepare claim transaction');
      }

      const minLamports = Number(prepared.min_sol_lamports) || MIN_CLAIM_SOL * 1e9;
      if (lamports < minLamports) {
        throw new Error(
          `Need ~${(minLamports / 1e9).toFixed(3)} SOL for fees / token account (you have ${sol.toFixed(4)} SOL).`,
        );
      }

      const raw = Uint8Array.from(atob(prepared.tx_base64), (c) => c.charCodeAt(0));
      const tx = Transaction.from(raw);
      tx.partialSign(playerKeypair);

      notify?.('Sending claim on Solana…');
      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      await connection.confirmTransaction(signature, 'confirmed');

      const confirmed = await secureAirdropClaimG2u(captchaToken, row.id, {
        action: 'confirm',
        txSignature: signature,
      });
      const amt = Number(confirmed?.amount) || Number(prepared.amount) || 0;
      if (confirmed?.already) notify?.('Already claimed');
      else {
        notify?.(
          `✅ ${row.label || confirmed?.source || prepared.source}: ${amt.toLocaleString()} $G2U → ${shortWallet} (you paid the network fee)`,
        );
      }
      resetCaptcha();
      await refreshAirdrop();
      // Pull on-chain $G2U into wallet UI without manual Refresh
      if (typeof onBalancesRefresh === 'function') {
        try {
          await onBalancesRefresh({
            source: row.source || confirmed?.source || prepared?.source,
            amount: amt,
            txSignature: signature,
          });
        } catch (e) {
          console.warn('claim balance refresh', e?.message || e);
        }
      }
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
            <p style={{ color: '#888', fontSize: 12, margin: '0 0 12px', lineHeight: 1.45 }}>
              Airdrop claims: you pay a small <strong style={{ color: '#ccc' }}>SOL</strong> network
              fee; <strong style={{ color: '#fbef43' }}>$G2U</strong> is sent from the vault to{' '}
              {shortWallet}. Keep ~{MIN_CLAIM_SOL} SOL in your game wallet.
            </p>

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
