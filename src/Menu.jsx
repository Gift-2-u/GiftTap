import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import AppNotice from './AppNotice';
import { IDEAS_EMAIL, openIdeasEmail, copyIdeasEmail } from './contactIdeas';
import { SOCIAL_LINKS, openSocial } from './socialLinks';

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
  onOpenRoadmap,
  onOpenSecret,
  username,
  playerId,
  onLogout,
  onOpenClaimAccount,
  needsPassword,
  onOpenTerms,
  onOpenPrivacy,
  onOpenLeaderboard,
  onOpenAirdrop,
}) => {
  const playerIdHint = playerId ? String(playerId).slice(-8) : '';
  const [appNotice, setAppNotice] = useState({
    show: false,
    message: '',
    success: false,
  });
  /** Settings row expands a sub-menu (language, currency, password, 12 words) */
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Lock background scroll while menu is open (mobile browser chrome)
  useEffect(() => {
    if (!isMenuOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMenuOpen]);

  // Collapse settings when menu closes so it starts closed next open
  useEffect(() => {
    if (!isMenuOpen) setSettingsOpen(false);
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

            {/* Scrollable body — order: Home → Settings → Roadmap → Guide → Ranks → Ideas */}
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
              {/* 1. Gift2u Home */}
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

              {/* 2. Settings — tap arrow / row to open sub-menu */}
              <div style={{ marginBottom: '10px' }}>
                <button
                  type="button"
                  onClick={() => setSettingsOpen((o) => !o)}
                  aria-expanded={settingsOpen}
                  style={{
                    ...rowBtn,
                    marginBottom: settingsOpen ? 0 : '10px',
                    borderBottomLeftRadius: settingsOpen ? 0 : '12px',
                    borderBottomRightRadius: settingsOpen ? 0 : '12px',
                    borderColor: settingsOpen ? '#3a3a20' : '#222',
                    background: settingsOpen ? '#151510' : '#111',
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      color: '#ffd700',
                      fontWeight: 'bold',
                    }}
                  >
                    <span style={{ fontSize: '18px' }} aria-hidden>
                      ⚙️
                    </span>
                    Settings
                  </span>
                  <span
                    style={{
                      color: '#888',
                      fontSize: '16px',
                      transform: settingsOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.15s ease',
                      display: 'inline-block',
                    }}
                    aria-hidden
                  >
                    ❯
                  </span>
                </button>

                {settingsOpen && (
                  <div
                    style={{
                      background: '#0d0d0f',
                      border: '1px solid #2a2a2a',
                      borderTop: 'none',
                      borderBottomLeftRadius: '12px',
                      borderBottomRightRadius: '12px',
                      padding: '10px 10px 6px',
                      marginBottom: '10px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#111',
                        padding: '12px',
                        borderRadius: '10px',
                        marginBottom: '8px',
                        border: '1px solid #222',
                      }}
                    >
                      <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '13px' }}>
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
                        padding: '12px',
                        borderRadius: '10px',
                        marginBottom: '8px',
                        border: '1px solid #222',
                      }}
                    >
                      <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '13px' }}>
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
                          marginBottom: '8px',
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
                            fontSize: '13px',
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
                      style={{ ...rowBtn, marginBottom: '4px' }}
                    >
                      <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '13px' }}>
                        🔐 {t('secret') || 'View 12 words'}
                      </span>
                      <span style={{ color: '#888' }}>{'❯'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 3. Roadmap */}
              {typeof onOpenRoadmap === 'function' && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenRoadmap();
                  }}
                  style={rowBtn}
                >
                  <span style={{ color: '#a78bfa', fontWeight: 'bold' }}>
                    🗺️ {t('roadmap') || 'Roadmap'}
                  </span>
                  <span style={{ color: '#888' }}>{'❯'}</span>
                </button>
              )}

              {/* 4. Game guide */}
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenWhitepaper();
                }}
                style={rowBtn}
              >
                <span style={{ color: '#fff', fontWeight: 'bold' }}>
                  📖 {t('rules') || 'Game guide'}
                </span>
                <span style={{ color: '#888' }}>{'❯'}</span>
              </button>

              {/* 5. Ranks / Leaderboard */}
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

              {/* G2U Airdrop board */}
              {typeof onOpenAirdrop === 'function' ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenAirdrop();
                  }}
                  style={rowBtn}
                >
                  <span style={{ color: '#67e8f9', fontWeight: 'bold', textAlign: 'left' }}>
                    🪂 G2U Airdrop
                    <span
                      style={{
                        display: 'block',
                        color: '#888',
                        fontSize: 11,
                        fontWeight: 'normal',
                        marginTop: 4,
                      }}
                    >
                      Q4 · your checklist & bonus %
                    </span>
                  </span>
                  <span style={{ color: '#888' }}>{'❯'}</span>
                </button>
              ) : (
                <a href="/airdrop" style={rowBtn}>
                  <span style={{ color: '#67e8f9', fontWeight: 'bold' }}>🪂 G2U Airdrop</span>
                  <span style={{ color: '#888' }}>{'❯'}</span>
                </a>
              )}

              {/* 6. Ideas & suggestions */}
              <button
                type="button"
                onClick={async () => {
                  setIsMenuOpen(false);
                  await openIdeasEmail();
                  const copied = await copyIdeasEmail();
                  setAppNotice({
                    show: true,
                    message: copied
                      ? `Opening your mail app to ${IDEAS_EMAIL}…\n\nAddress copied if mail did not open.`
                      : `Write to ${IDEAS_EMAIL} from your mail app.`,
                    success: true,
                    title: 'Ideas & suggestions',
                  });
                }}
                style={{
                  ...rowBtn,
                  border: 'none',
                }}
              >
                <span style={{ color: '#e9d5ff', fontWeight: 'bold', textAlign: 'left' }}>
                  💡 Ideas & suggestions
                  <span
                    style={{
                      display: 'block',
                      color: '#888',
                      fontSize: 11,
                      fontWeight: 'normal',
                      marginTop: 4,
                    }}
                  >
                    {IDEAS_EMAIL} · opens your mail app
                  </span>
                </span>
                <span style={{ color: '#888' }}>{'❯'}</span>
              </button>

              {/* Socials — X, Telegram, Discord */}
              <div
                style={{
                  marginTop: '18px',
                  borderTop: '1px solid #333',
                  paddingTop: '14px',
                }}
              >
                <div
                  style={{
                    color: '#888',
                    fontSize: 11,
                    fontWeight: 'bold',
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    marginBottom: 10,
                    textAlign: 'center',
                  }}
                >
                  Community
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  {SOCIAL_LINKS.map((s) => (
                    <a
                      key={s.id}
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        e.preventDefault();
                        openSocial(s.href);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 14px',
                        borderRadius: 12,
                        border: '1px solid #333',
                        background: '#111',
                        color: s.color || '#fff',
                        textDecoration: 'none',
                        fontWeight: 'bold',
                        fontSize: 13,
                        minWidth: 100,
                        justifyContent: 'center',
                      }}
                    >
                      <span style={{ fontSize: 16 }} aria-hidden>
                        {s.glyph}
                      </span>
                      {s.label}
                    </a>
                  ))}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '20px',
                  marginTop: '16px',
                  paddingTop: '12px',
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
