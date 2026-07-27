import React, { useState } from 'react';
import { registerAccount, loginAccount, suggestUsername, formatAuthError } from './authApi';

/**
 * Cross-device account gate: Sign up / Log in with unique username + password.
 * 12-word restore remains available for legacy / lost-password recovery.
 */
const AuthScreen = ({ onAuthenticated, onRestoreAccount }) => {
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'restore'
  const [username, setUsername] = useState(() => suggestUsername());
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const box = {
    background: '#1c1e22',
    border: '1px solid #333',
    borderRadius: '16px',
    padding: '24px',
    maxWidth: '400px',
    width: '100%',
    boxSizing: 'border-box',
  };
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
  const btn = (primary) => ({
    width: '100%',
    padding: '14px',
    border: 'none',
    borderRadius: '12px',
    fontWeight: 'bold',
    fontSize: '15px',
    cursor: loading ? 'not-allowed' : 'pointer',
    background: primary ? '#ffd700' : '#2a2d34',
    color: primary ? '#000' : '#fff',
    marginTop: '4px',
    opacity: loading ? 0.7 : 1,
  });
  const tab = (active) => ({
    flex: 1,
    padding: '10px',
    border: 'none',
    background: active ? 'rgba(255,215,0,0.15)' : 'transparent',
    color: active ? '#ffd700' : '#888',
    fontWeight: 'bold',
    cursor: 'pointer',
    borderBottom: active ? '2px solid #ffd700' : '2px solid transparent',
  });

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== password2) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const data = await registerAccount(username.trim(), password);
      await onAuthenticated({
        playerId: data.player_id,
        username: data.username,
        isNew: true,
        mnemonic: data.mnemonic,
        walletAddress: data.wallet_address,
        has_beta_access: true,
      });
    } catch (err) {
      console.error('Sign up error:', err);
      setError(formatAuthError(err) || 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await loginAccount(username.trim(), password);
      await onAuthenticated({
        playerId: data.player_id,
        username: data.username,
        isNew: false,
        hasVault: data.has_vault,
        has_beta_access: data.has_beta_access,
        walletAddress: data.wallet_address,
      });
    } catch (err) {
      console.error('Login error:', err);
      setError(formatAuthError(err) || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (e) => {
    e.preventDefault();
    if (!onRestoreAccount) return;
    setError('');
    setLoading(true);
    try {
      const ok = await onRestoreAccount(mnemonic);
      if (!ok) setError('Could not restore. Check your 12 words.');
    } catch (err) {
      setError(err.message || 'Restore failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at center, #1c1e22 0%, #000 100%)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        boxSizing: 'border-box',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ color: '#ffd700', margin: '0 0 8px', fontSize: '28px' }}>Gift Tap</h1>
      <p style={{ color: '#888', margin: '0 0 24px', textAlign: 'center', fontSize: '14px', maxWidth: '360px' }}>
        Same username + password on phone and desktop. No need for your 12 words every time.
      </p>

      <div style={box}>
        <div style={{ display: 'flex', marginBottom: '20px' }}>
          <button type="button" style={tab(mode === 'login')} onClick={() => { setMode('login'); setError(''); }}>
            Log in
          </button>
          <button type="button" style={tab(mode === 'signup')} onClick={() => { setMode('signup'); setError(''); setUsername(suggestUsername()); }}>
            Sign up
          </button>
          <button type="button" style={tab(mode === 'restore')} onClick={() => { setMode('restore'); setError(''); }}>
            12 words
          </button>
        </div>

        {mode === 'signup' && (
          <form onSubmit={handleSignup}>
            <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
              Unique username (shown on leaderboard)
            </label>
            <input
              style={input}
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
              placeholder="Elf_1234"
              autoComplete="username"
              disabled={loading}
              required
            />
            <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
              Password (min 6 characters)
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
            <button type="submit" style={btn(true)} disabled={loading}>
              {loading ? 'Creating…' : 'Create account'}
            </button>
            <p style={{ color: '#666', fontSize: '11px', marginTop: '12px', lineHeight: 1.4 }}>
              Pick a name no one else has. You will still back up your wallet 12 words once for safety.
            </p>
          </form>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin}>
            <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
              Username
            </label>
            <input
              style={input}
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
              placeholder="YourUsername"
              autoComplete="username"
              disabled={loading}
              required
            />
            <label style={{ color: '#aaa', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
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
            />
            <button type="submit" style={btn(true)} disabled={loading}>
              {loading ? 'Logging in…' : 'Log in'}
            </button>
            <p style={{ color: '#666', fontSize: '11px', marginTop: '12px', lineHeight: 1.4 }}>
              Use the same username and password on your other phone or PC.
            </p>
          </form>
        )}

        {mode === 'restore' && (
          <form onSubmit={handleRestore}>
            <p style={{ color: '#aaa', fontSize: '13px', marginTop: 0 }}>
              Lost password or old Telegram account? Paste your 12-word wallet phrase.
            </p>
            <textarea
              style={{ ...input, minHeight: '90px', resize: 'vertical' }}
              value={mnemonic}
              onChange={(e) => setMnemonic(e.target.value)}
              placeholder="word1 word2 word3 …"
              disabled={loading}
              required
            />
            <button type="submit" style={btn(true)} disabled={loading || !onRestoreAccount}>
              {loading ? 'Restoring…' : 'Restore account'}
            </button>
          </form>
        )}

        {error && (
          <p style={{ color: '#ff6b6b', fontWeight: 'bold', fontSize: '13px', marginBottom: 0, marginTop: '16px' }}>
            ⚠️ {error}
          </p>
        )}
      </div>
    </div>
  );
};

export default AuthScreen;
