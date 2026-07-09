import React, { useState } from 'react';
import { supabase } from './supabaseClient';

/** Beta invite gate for the web app. playerId is the web session key (DB: telegram_id column). */
const BetaGate = ({ playerId, telegramId, onAccessGranted, onRestoreAccount }) => {
  const id = playerId || telegramId || '';
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showRestore, setShowRestore] = useState(false);
  const [mnemonic, setMnemonic] = useState('');
  const [restoreLoading, setRestoreLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setErrorMessage('');

    try {
      const { error } = await supabase.rpc('redeem_any_code', {
        target_code: code.trim().toUpperCase(),
        player_tg_id: id ? String(id) : '',
      });

      if (error) {
        if (error.message.includes('maximum uses')) {
          setErrorMessage('Too late! This code has reached its maximum uses.');
        } else if (error.message.includes('already has beta access')) {
          setErrorMessage('You already have access! Refreshing game...');
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

  const handleRestore = async (e) => {
    e.preventDefault();
    if (!onRestoreAccount) return;
    setRestoreLoading(true);
    setErrorMessage('');
    try {
      const ok = await onRestoreAccount(mnemonic);
      if (!ok) setErrorMessage('Could not restore that account. Check your 12 words.');
    } catch {
      setErrorMessage('Restore failed. Please try again.');
    } finally {
      setRestoreLoading(false);
    }
  };

  return (
    <div style={{ textAlign: 'center', padding: '50px 20px', color: '#00f2ff', background: '#000', minHeight: '100vh', fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
      <h1>GIFT TAP</h1>
      <p style={{ color: '#fff' }}>Web app is live. Enter your invite code to play.</p>
      <p style={{ color: '#888', fontSize: '13px', maxWidth: '420px', margin: '8px auto 0' }}>
        Played on Telegram before? Restore with your 12-word wallet phrase below.
      </p>

      <form onSubmit={handleSubmit} style={{ margin: '30px 0' }}>
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

      {onRestoreAccount && (
        <div style={{ marginTop: '30px', maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto' }}>
          <button
            type="button"
            onClick={() => setShowRestore((v) => !v)}
            style={{
              background: 'transparent',
              color: '#ffd700',
              border: '1px solid #555',
              padding: '10px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            {showRestore ? 'Hide restore' : 'Restore Telegram / old account'}
          </button>

          {showRestore && (
            <form onSubmit={handleRestore} style={{ marginTop: '16px', textAlign: 'left' }}>
              <p style={{ color: '#aaa', fontSize: '12px', marginBottom: '8px' }}>
                Enter the 12-word secret phrase from your in-app wallet backup.
              </p>
              <textarea
                value={mnemonic}
                onChange={(e) => setMnemonic(e.target.value)}
                placeholder="word1 word2 word3 ..."
                rows={3}
                disabled={restoreLoading}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '12px',
                  background: '#111',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: '8px',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
              <button
                type="submit"
                disabled={restoreLoading}
                style={{
                  marginTop: '10px',
                  width: '100%',
                  padding: '12px',
                  background: restoreLoading ? '#333' : '#ffd700',
                  color: '#000',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: restoreLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {restoreLoading ? 'RESTORING...' : 'RESTORE ACCOUNT'}
              </button>
            </form>
          )}
        </div>
      )}

      <p style={{ marginTop: '40px', fontSize: '13px', color: '#888' }}>
        Follow{' '}
        <a href="https://x.com/Gift2udev" target="_blank" rel="noreferrer" style={{ color: '#00f2ff' }}>
          @Gift2udev
        </a>{' '}
        &{' '}
        <a href="https://t.me/Gift2u_GiftTap_official" target="_blank" rel="noreferrer" style={{ color: '#00f2ff' }}>
          Telegram Channel
        </a>{' '}
        for code drops.
      </p>
    </div>
  );
};

export default BetaGate;