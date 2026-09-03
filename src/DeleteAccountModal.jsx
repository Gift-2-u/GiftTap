import React, { useEffect, useState } from 'react';
import { secureDeleteAccount } from './secureApi';
import { formatAuthError } from './authApi';

/**
 * Settings → Delete my account.
 * Requires password + typing username. Wipes Gift Tap profile via Edge.
 */
export default function DeleteAccountModal({
  isOpen,
  onClose,
  username = '',
  onDeleted,
}) {
  const [confirmName, setConfirmName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setConfirmName('');
      setPassword('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const input = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 14px',
    marginBottom: '12px',
    background: '#111',
    color: '#fff',
    border: '1px solid #444',
    borderRadius: '10px',
    fontSize: '15px',
    outline: 'none',
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await secureDeleteAccount({
        password,
        confirmUsername: confirmName.trim(),
      });
      onDeleted?.();
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.92)',
        zIndex: 12000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          background: '#1c1e22',
          border: '1px solid #f87171',
          borderRadius: '16px',
          padding: '24px',
          maxWidth: '400px',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px',
            gap: '12px',
          }}
        >
          <h2
            style={{
              color: '#f87171',
              margin: 0,
              fontSize: '20px',
              lineHeight: 1.2,
              flex: 1,
            }}
          >
            Delete account
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
            style={{
              background: '#333',
              border: 'none',
              color: '#fff',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              fontSize: '18px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        <p style={{ color: '#aaa', fontSize: '13px', lineHeight: 1.45 }}>
          This permanently removes your Gift Tap profile, login, vault backup in
          our database, and leaderboard scores.
        </p>
        <p style={{ color: '#fbbf24', fontSize: '12px', lineHeight: 1.45 }}>
          On-chain SOL, $G2U, and NFTs in your Solana wallet are{' '}
          <strong style={{ color: '#fff' }}>not</strong> deleted — only game
          account data.
        </p>

        <form onSubmit={handleSubmit}>
          <label
            style={{
              color: '#888',
              fontSize: '12px',
              display: 'block',
              marginBottom: '6px',
            }}
          >
            Type your username to confirm
            {username ? ` (${username})` : ''}
          </label>
          <input
            style={input}
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value.replace(/\s/g, ''))}
            placeholder={username || 'username'}
            autoComplete="username"
            disabled={loading}
            required
          />

          <label
            style={{
              color: '#888',
              fontSize: '12px',
              display: 'block',
              marginBottom: '6px',
            }}
          >
            Password
          </label>
          <input
            style={input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            disabled={loading}
            required
            minLength={6}
          />

          {error && (
            <p
              style={{
                color: '#ff6b6b',
                fontWeight: 'bold',
                fontSize: '13px',
              }}
            >
              ⚠️ {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              border: 'none',
              borderRadius: '12px',
              fontWeight: 'bold',
              background: loading ? '#555' : '#f87171',
              color: '#000',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: '10px',
            }}
          >
            {loading ? 'Deleting…' : 'Permanently delete my account'}
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #444',
              borderRadius: '12px',
              background: 'transparent',
              color: '#ccc',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}
