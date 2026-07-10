import React, { useState } from 'react';
import { supabase } from './supabaseClient';

/**
 * Beta invite gate — only shown AFTER the player already has an account session
 * (Sign up / Log in / 12-word restore). The code is linked to their playerId.
 */
const BetaGate = ({
  playerId,
  telegramId,
  username,
  onAccessGranted,
  onSwitchAccount,
}) => {
  const id = playerId || telegramId || '';
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    if (!id) {
      setErrorMessage('No account session. Please log in first.');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      // player_tg_id = this player's account key (web UUID or old telegram id)
      const { error } = await supabase.rpc('redeem_any_code', {
        target_code: code.trim().toUpperCase(),
        player_tg_id: String(id),
      });

      if (error) {
        if (error.message.includes('maximum uses')) {
          setErrorMessage('Too late! This code has reached its maximum uses.');
        } else if (error.message.includes('already has beta access')) {
          setErrorMessage('You already have access! Opening game...');
          onAccessGranted();
        } else {
          setErrorMessage('Invalid code. Check your spelling or hunt for a new one.');
        }
        setLoading(false);
        return;
      }

      onAccessGranted();
    } catch {
      setErrorMessage('Network error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        textAlign: 'center',
        padding: '50px 20px',
        color: '#00f2ff',
        background: '#000',
        minHeight: '100vh',
        fontFamily: 'sans-serif',
        boxSizing: 'border-box',
      }}
    >
      <h1 style={{ marginBottom: '8px' }}>BETA ACCESS</h1>
      <p style={{ color: '#fff', marginTop: 0 }}>
        Gift Tap is invite-only. Enter a code to unlock <strong>your</strong> account.
      </p>

      {/* Who we are unlocking — identity already known from login/signup */}
      <div
        style={{
          maxWidth: '380px',
          margin: '24px auto',
          padding: '14px 16px',
          background: '#111',
          border: '1px solid #333',
          borderRadius: '12px',
          textAlign: 'left',
        }}
      >
        <div style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>Unlocking account</div>
        <div style={{ color: '#ffd700', fontWeight: 'bold', fontSize: '18px' }}>
          {(username && String(username).trim()) || 'Player'}
        </div>
        <div style={{ color: '#555', fontSize: '10px', marginTop: '6px', wordBreak: 'break-all' }}>
          The code will be saved for this account only — you will not need it again on login.
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ margin: '24px 0' }}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ENTER CODE (GIFT-XXXXXX)"
          disabled={loading}
          style={{
            padding: '12px',
            background: '#111',
            color: '#fff',
            border: '2px solid #00f2ff',
            borderRadius: '4px',
            outline: 'none',
            textTransform: 'uppercase',
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '12px 24px',
            marginLeft: '10px',
            background: loading ? '#333' : '#00f2ff',
            color: '#000',
            border: 'none',
            borderRadius: '4px',
            fontWeight: 'bold',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'VERIFYING...' : 'UNLOCK'}
        </button>
      </form>

      {errorMessage && (
        <p style={{ color: '#ff3b3b', fontWeight: 'bold', marginBottom: '20px' }}>
          ⚠️ {errorMessage}
        </p>
      )}

      {onSwitchAccount && (
        <button
          type="button"
          onClick={onSwitchAccount}
          style={{
            marginTop: '12px',
            background: 'transparent',
            border: '1px solid #555',
            color: '#aaa',
            padding: '10px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Not you? Switch account
        </button>
      )}

      <p style={{ marginTop: '40px', fontSize: '13px', color: '#888' }}>
        Follow{' '}
        <a href="https://x.com/Gift2udev" target="_blank" rel="noreferrer" style={{ color: '#00f2ff' }}>
          @Gift2udev
        </a>{' '}
        &{' '}
        <a
          href="https://t.me/Gift2u_GiftTap_official"
          target="_blank"
          rel="noreferrer"
          style={{ color: '#00f2ff' }}
        >
          Telegram Channel
        </a>{' '}
        for code drops.
      </p>
    </div>
  );
};

export default BetaGate;
