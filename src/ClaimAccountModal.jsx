import React, { useState, useEffect } from 'react';
import { claimAccountCredentials, formatAuthError } from './authApi';

/**
 * Let Telegram / restored players keep or change username and set a password
 * for cross-device login (no 12 words next time).
 */
const ClaimAccountModal = ({
  isOpen,
  onClose,
  playerId,
  currentUsername,
  onSuccess,
  required = false, // if true, must complete (e.g. after restore)
  /** true = first-time set (no current password). false = change (require current). */
  needsPassword = false,
}) => {
  const [username, setUsername] = useState(currentUsername || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isChange = !needsPassword && !required;

  useEffect(() => {
    if (isOpen) {
      setUsername(currentUsername || '');
      setCurrentPassword('');
      setPassword('');
      setPassword2('');
      setError('');
    }
  }, [isOpen, currentUsername]);

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
    if (password !== password2) {
      setError('Passwords do not match.');
      return;
    }
    if (isChange && String(currentPassword || '').length < 6) {
      setError('Enter your current password to change it.');
      return;
    }
    setLoading(true);
    try {
      const data = await claimAccountCredentials({
        playerId,
        username: username.trim(),
        password,
        currentPassword: isChange ? currentPassword : '',
      });
      onSuccess?.(data.username);
      onClose?.();
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
        background: 'rgba(0,0,0,0.9)',
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
          border: '1px solid #ffd700',
          borderRadius: '16px',
          padding: '24px',
          maxWidth: '400px',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '12px' }}>
          <h2 style={{ color: '#ffd700', margin: 0, fontSize: '20px', lineHeight: 1.2, flex: 1 }}>
            {required ? 'Set up login' : 'Username & password'}
          </h2>
          {!required && (
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              aria-label="Close and return to menu"
              style={{
                background: '#333',
                border: 'none',
                color: '#fff',
                width: '32px',
                height: '32px',
                minWidth: '32px',
                borderRadius: '50%',
                fontSize: '18px',
                lineHeight: 1,
                padding: 0,
                margin: 0,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              ×
            </button>
          )}
        </div>
        <p style={{ color: '#aaa', fontSize: '13px', lineHeight: 1.45 }}>
          {isChange
            ? 'Update your username and/or password. You must enter your current password to save changes.'
            : (
              <>
                Keep your name or change it, then create a password so you can open Gift Tap on
                phone or desktop <strong style={{ color: '#fff' }}>without</strong> your 12 words
                every time.
              </>
            )}
        </p>

        <form onSubmit={handleSubmit}>
          <label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
            Username (unique, public)
          </label>
          <input
            style={input}
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
            placeholder="YourTelegramName"
            autoComplete="username"
            disabled={loading}
            required
          />

          {isChange && (
            <>
              <label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
                Current password
              </label>
              <input
                style={input}
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={loading}
                required
                minLength={6}
              />
            </>
          )}

          <label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
            {isChange ? 'New password (min 6 characters)' : 'Password (min 6 characters)'}
          </label>
          <input
            style={input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            disabled={loading}
            required
            minLength={6}
          />
          <input
            style={input}
            type="password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            placeholder="Confirm password"
            autoComplete="new-password"
            disabled={loading}
            required
            minLength={6}
          />

          {error && (
            <p style={{ color: '#ff6b6b', fontWeight: 'bold', fontSize: '13px' }}>⚠️ {error}</p>
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
              background: loading ? '#555' : '#ffd700',
              color: '#000',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: '10px',
            }}
          >
            {loading ? 'Saving…' : 'Save username & password'}
          </button>

          {!required && (
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
                color: '#888',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          )}
          {required && (
            <p style={{ color: '#666', fontSize: '11px', marginBottom: 0, textAlign: 'center' }}>
              Required once so you can log in on other devices.
            </p>
          )}
        </form>
      </div>
    </div>
  );
};

export default ClaimAccountModal;
