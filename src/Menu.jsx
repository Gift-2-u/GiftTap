import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import AppNotice from './AppNotice';

// We store the massive arrays here to keep the main game file clean!
const ALL_CURRENCIES = [
  'USD', 'EUR', 'CAD', 'GBP', 'AUD', 'JPY', 'CNY', 'INR', 'PHP', 'IDR',
  'BRL', 'MXN', 'ARS', 'NGN', 'ZAR', 'TRY', 'AED', 'SGD', 'HKD', 'NZD',
  'KRW', 'THB', 'VND', 'MYR', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK',
];

const ALL_LANGUAGES = [
  { code: 'EN', label: 'English' },
  { code: 'FR', label: 'Français' },
  { code: 'ES', label: 'Español' },
  { code: 'PT', label: 'Português' },
  { code: 'RU', label: 'Русский' },
  { code: 'ID', label: 'Bahasa Indonesia' },
  { code: 'ZH', label: '中文' },
];

const rowBtn = {
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  background: '#111',
  padding: '15px',
  borderRadius: '12px',
  marginBottom: '10px',
  border: '1px solid #222',
  cursor: 'pointer',
  boxSizing: 'border-box',
  textDecoration: 'none',
  color: 'inherit',
  font: 'inherit',
};

const Menu = ({
  isMenuOpen,
  setIsMenuOpen,
  appLanguage,
  setAppLanguage,
  displayCurrency,
  setDisplayCurrency,
  t,
  onOpenWhitepaper,
  onOpenSecret,
  username,
  playerId,
  onLogout,
  onOpenClaimAccount,
  needsPassword,
  onOpenTerms,
  onOpenPrivacy,
  onOpenLeaderboard,
}) => {
  const playerIdHint = playerId ? String(playerId).slice(-8) : '';
  const [appNotice, setAppNotice] = useState({
    show: false,
    message: '',
    success: false,
  });

  // Lock background scroll while menu is open (mobile browser chrome)
  useEffect(() => {
    if (!isMenuOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMenuOpen]);

  if (!isMenuOpen && !appNotice.show) return null;

  const handleLogout = () => {
    setIsMenuOpen(false);
    if (typeof onLogout === 'function') onLogout();
    else {
      setAppNotice({
        show: true,
        message: 'Log out is not available. Refresh the page.',
        success: false,
      });
    }
  };

  const overlay = (
    <>
      <AppNotice
        show={appNotice.show}
        message={appNotice.message}
        success={appNotice.success}
        onClose={() => setAppNotice((n) => ({ ...n, show: false }))}
      />
      {isMenuOpen ? (
        <div
          role="presentation"
          onClick={() => setIsMenuOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            zIndex: 10000,
            display: 'flex',
            justifyContent: 'center',
            // Center on tall desktop; bottom sheet on short mobile still max-height constrained
            alignItems: 'center',
            paddingTop: 'max(12px, env(safe-area-inset-top, 0px))',
            paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))',
            paddingLeft: 'max(12px, env(safe-area-inset-left, 0px))',
            paddingRight: 'max(12px, env(safe-area-inset-right, 0px))',
            boxSizing: 'border-box',
            overflow: 'hidden',
            touchAction: 'none',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('menu') || 'Menu'}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1c1e22',
              width: '100%',
              maxWidth: '440px',
              // Critical: never taller than viewport — content scrolls inside
              maxHeight: 'min(92dvh, 100%)',
              height: 'auto',
              borderRadius: '20px',
              border: '1px solid #333',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              touchAction: 'pan-y',
              boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
            }}
          >
            {/* Sticky header — always visible (title + close + logout) */}
            <div
              style={{
                flexShrink: 0,
                padding: '16px 18px 10px',
                borderBottom: '1px solid #2a2a2a',
                background: '#1c1e22',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                }}
              >
                <h2 style={{ color: '#fff', margin: 0, fontSize: '22px' }}>
                  {t('menu')}
                </h2>
                <button
                  type="button"
                  onClick={() => setIsMenuOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#888',
                    fontSize: '28px',
                    cursor: 'pointer',
                    lineHeight: 1,
                    padding: '0 4px',
                  }}
                  aria-label="Close menu"
                >
                  ×
                </button>
              </div>

              {/* Logged in as + Log out — pinned so logout is never off-screen */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  background: '#111',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: '1px solid #222',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      color: '#888',
                      fontSize: '10px',
                      marginBottom: '2px',
                    }}
                  >
                    Logged in as
                  </div>
                  <div
                    style={{
                      color: '#ffd700',
                      fontWeight: 'bold',
                      fontSize: '15px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {(username && String(username).trim()) || 'Player'}
                  </div>
                  {playerIdHint ? (
                    <div
                      style={{ color: '#555', fontSize: '9px', marginTop: '2px' }}
                    >
                      ID …{playerIdHint}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  style={{
                    flexShrink: 0,
                    background: 'transparent',
                    border: '1px solid #663333',
                    color: '#f87171',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                  }}
                >
                  Log out
                </button>
              </div>
              {needsPassword && (
                <div
                  style={{
                    color: '#fbbf24',
                    fontSize: '11px',
                    marginTop: '10px',
                    lineHeight: 1.35,
                  }}
                >
                  No password yet — set one to log in on other devices without 12
                  words.
                </div>
              )}
            </div>

            {/* Scrollable body */}
            <div
              style={{
                flex: '1 1 auto',
                minHeight: 0,
                overflowY: 'auto',
                overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
                touchAction: 'pan-y',
                padding: '12px 18px 24px',
                boxSizing: 'border-box',
              }}
            >
              {/* Back to gift2u.fun marketing site */}
              <a href="/" style={rowBtn}>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    color: '#a78bfa',
                    fontWeight: 'bold',
                  }}
                >
                  <img
                    src="/Gift2u_logo.png"
                    alt=""
                    style={{
                      width: '28px',
                      height: '28px',
                      objectFit: 'contain',
                      borderRadius: '50%',
                      flexShrink: 0,
                    }}
                  />
                  Gift2u Home
                </span>
                <span style={{ color: '#888' }}>{'❯'}</span>
              </a>

              {typeof onOpenLeaderboard === 'function' && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenLeaderboard();
                  }}
                  style={rowBtn}
                >
                  <span style={{ color: '#ffd700', fontWeight: 'bold' }}>
                    🏆 Ranks / Leaderboard
                  </span>
                  <span style={{ color: '#888' }}>{'❯'}</span>
                </button>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#111',
                  padding: '15px',
                  borderRadius: '12px',
                  marginBottom: '10px',
                  border: '1px solid #222',
                }}
              >
                <span style={{ color: '#fff', fontWeight: 'bold' }}>
                  🌐 {t('language')}
                </span>
                <select
                  value={appLanguage}
                  onChange={(e) => setAppLanguage(e.target.value)}
                  style={{
                    background: '#333',
                    color: '#fff',
                    border: '1px solid #555',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    outline: 'none',
                    maxWidth: '55%',
                  }}
                >
                  {ALL_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.code} - {lang.label}
                    </option>
                  ))}
                </select>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#111',
                  padding: '15px',
                  borderRadius: '12px',
                  marginBottom: '10px',
                  border: '1px solid #222',
                }}
              >
                <span style={{ color: '#fff', fontWeight: 'bold' }}>
                  💱 {t('currency')}
                </span>
                <select
                  value={displayCurrency}
                  onChange={(e) => setDisplayCurrency(e.target.value)}
                  style={{
                    background: '#333',
                    color: '#fff',
                    border: '1px solid #555',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    outline: 'none',
                    maxWidth: '55%',
                  }}
                >
                  {ALL_CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </div>

              {onOpenClaimAccount && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenClaimAccount();
                  }}
                  style={{
                    ...rowBtn,
                    background: needsPassword
                      ? 'rgba(255,215,0,0.08)'
                      : '#111',
                    border: needsPassword
                      ? '1px solid #ffd700'
                      : '1px solid #222',
                  }}
                >
                  <span
                    style={{
                      color: needsPassword ? '#ffd700' : '#fff',
                      fontWeight: 'bold',
                    }}
                  >
                    {needsPassword
                      ? '⚡ Set username & password'
                      : '✏️ Change username / password'}
                  </span>
                  <span style={{ color: '#888' }}>{'❯'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenSecret();
                }}
                style={rowBtn}
              >
                <span style={{ color: '#ef4444', fontWeight: 'bold' }}>
                  🔐 {t('secret')}
                </span>
                <span style={{ color: '#888' }}>{'❯'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenWhitepaper();
                }}
                style={rowBtn}
              >
                <span style={{ color: '#fff', fontWeight: 'bold' }}>
                  📖 {t('rules')}
                </span>
                <span style={{ color: '#888' }}>{'❯'}</span>
              </button>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '20px',
                  marginTop: '20px',
                  borderTop: '1px solid #333',
                  paddingTop: '15px',
                  paddingBottom: '8px',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (typeof onOpenTerms === 'function') {
                      setIsMenuOpen(false);
                      onOpenTerms();
                    }
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#666',
                    fontSize: '12px',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  {t('terms') || 'Terms of Use'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (typeof onOpenPrivacy === 'function') {
                      setIsMenuOpen(false);
                      onOpenPrivacy();
                    }
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#666',
                    fontSize: '12px',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  {t('privacy') || 'Privacy Policy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );

  if (typeof document === 'undefined') return overlay;
  return createPortal(overlay, document.body);
};

export default Menu;
