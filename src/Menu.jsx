import React from 'react';

// We store the massive arrays here to keep the main game file clean!
const ALL_CURRENCIES = [
  'USD', 'EUR', 'CAD', 'GBP', 'AUD', 'JPY', 'CNY', 'INR', 'PHP', 'IDR', 
  'BRL', 'MXN', 'ARS', 'NGN', 'ZAR', 'TRY', 'AED', 'SGD', 'HKD', 'NZD', 
  'KRW', 'THB', 'VND', 'MYR', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK'
];

const ALL_LANGUAGES = [
  { code: 'EN', label: 'English' },
  { code: 'FR', label: 'Français' },
  { code: 'ES', label: 'Español' },
  { code: 'PT', label: 'Português' },
  { code: 'RU', label: 'Русский' },
  { code: 'ID', label: 'Bahasa Indonesia' },
  { code: 'ZH', label: '中文' }
];

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
}) => {
  const playerIdHint = playerId ? String(playerId).slice(-8) : '';
  
  // If the menu is closed, render absolutely nothing
  if (!isMenuOpen) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
      <div style={{ background: '#1c1e22', width: '100%', borderTopLeftRadius: '20px', borderTopRightRadius: '20px', padding: '25px', paddingBottom: '40px', boxSizing: 'border-box', borderTop: '1px solid #333' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: '22px' }}>{t('menu')}</h2>
          <button onClick={() => setIsMenuOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: '24px', cursor: 'pointer' }}>×</button>
        </div>

        {/* 1. Global Language Dropdown */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', padding: '15px', borderRadius: '12px', marginBottom: '10px', border: '1px solid #222' }}>
          <span style={{ color: '#fff', fontWeight: 'bold' }}>🌐 {t('language')}</span>
          <select 
            value={appLanguage}
            onChange={(e) => setAppLanguage(e.target.value)}
            style={{ background: '#333', color: '#fff', border: '1px solid #555', padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', outline: 'none' }}
          >
            {ALL_LANGUAGES.map(lang => (
              <option key={lang.code} value={lang.code}>
                {lang.code} - {lang.label}
              </option>
            ))}
          </select>
        </div>

        {/* 2. Global Fiat Dropdown */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', padding: '15px', borderRadius: '12px', marginBottom: '10px', border: '1px solid #222' }}>
          <span style={{ color: '#fff', fontWeight: 'bold' }}>💱 {t('currency')}</span>
          <select 
            value={displayCurrency}
            onChange={(e) => setDisplayCurrency(e.target.value)}
            style={{ background: '#333', color: '#fff', border: '1px solid #555', padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', outline: 'none' }}
          >
            {ALL_CURRENCIES.map(currency => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </div>

        {/* Account identity — always show when props provided (including 12-word restore) */}
        <div style={{ background: '#111', padding: '15px', borderRadius: '12px', marginBottom: '10px', border: '1px solid #222' }}>
          <div style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>Logged in as</div>
          <div style={{ color: '#ffd700', fontWeight: 'bold', fontSize: '16px' }}>
            {(username && String(username).trim()) || 'Player'}
          </div>
          {playerIdHint ? (
            <div style={{ color: '#555', fontSize: '10px', marginTop: '6px', wordBreak: 'break-all' }}>
              ID …{playerIdHint}
            </div>
          ) : null}
          {needsPassword && (
            <div style={{ color: '#fbbf24', fontSize: '11px', marginTop: '8px', lineHeight: 1.35 }}>
              No password yet — set one to log in on other devices without 12 words.
            </div>
          )}
        </div>

        {/* Username + password (Telegram / restore accounts) */}
        {onOpenClaimAccount && (
          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false);
              onOpenClaimAccount();
            }}
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: needsPassword ? 'rgba(255,215,0,0.08)' : '#111',
              padding: '15px',
              borderRadius: '12px',
              marginBottom: '10px',
              border: needsPassword ? '1px solid #ffd700' : '1px solid #222',
              cursor: 'pointer',
            }}
          >
            <span style={{ color: needsPassword ? '#ffd700' : '#fff', fontWeight: 'bold' }}>
              {needsPassword ? '⚡ Set username & password' : '✏️ Change username / password'}
            </span>
            <span style={{ color: '#888' }}>{'❯'}</span>
          </button>
        )}

        {/* 3. Security Words */}
        <button 
          onClick={() => {
            setIsMenuOpen(false);
            onOpenSecret();
          }}
          style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', padding: '15px', borderRadius: '12px', marginBottom: '10px', border: '1px solid #222', cursor: 'pointer' }}
        >
          <span style={{ color: '#ef4444', fontWeight: 'bold' }}>🔐 {t('secret')}</span>
          <span style={{ color: '#888' }}>{'❯'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setIsMenuOpen(false);
            if (typeof onLogout === 'function') onLogout();
            else alert('Log out is not available. Refresh the page.');
          }}
          style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', padding: '15px', borderRadius: '12px', marginBottom: '10px', border: '1px solid #442222', cursor: 'pointer' }}
        >
          <span style={{ color: '#f87171', fontWeight: 'bold' }}>🚪 Log out</span>
          <span style={{ color: '#888' }}>{'❯'}</span>
        </button>

        {/* 4. Whitepaper & Rules */}
        <button 
          onClick={() => {
            setIsMenuOpen(false);
            onOpenWhitepaper();
          }}
          style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', padding: '15px', borderRadius: '12px', marginBottom: '10px', border: '1px solid #222', cursor: 'pointer' }}
        >
          <span style={{ color: '#fff', fontWeight: 'bold' }}>📄 {t('rules')}</span>
          <span style={{ color: '#888' }}>{'❯'}</span>
        </button>

        {/* --- LEGAL FOOTER --- */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '30px', borderTop: '1px solid #333', paddingTop: '15px' }}>
          <button 
            onClick={() => {/* TODO: Open Terms */}}
            style={{ background: 'none', border: 'none', color: '#666', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {t('terms') || "Terms of Use"}
          </button>
          
          <button 
            onClick={() => {/* TODO: Open Privacy */}}
            style={{ background: 'none', border: 'none', color: '#666', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {t('privacy') || "Privacy Policy"}
          </button>
        </div>

      </div>
    </div>
  );
};

export default Menu;