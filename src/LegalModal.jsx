import React from 'react';
import { TERMS_BODY, PRIVACY_BODY } from './legalContent';

/**
 * In-app Terms / Privacy modal (Gift Tap menu).
 * Public pages: https://gift2u.fun/terms and /privacy
 */
const LegalModal = ({ kind, isOpen, onClose }) => {
  if (!isOpen || !kind) return null;

  const title = kind === 'privacy' ? 'Privacy Policy' : 'Terms of Use';
  const body = kind === 'privacy' ? PRIVACY_BODY : TERMS_BODY;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.9)',
        zIndex: 12000,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '20px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          background: '#1c1e22',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          borderRadius: '16px',
          border: '1px solid #333',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 18px',
            borderBottom: '1px solid #333',
            background: '#111',
            flexShrink: 0,
          }}
        >
          <h2 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
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
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>
        <div
          style={{
            padding: '18px',
            overflowY: 'auto',
            color: '#ccc',
            fontSize: '13px',
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
          }}
        >
          <p style={{ color: '#888', fontSize: '11px', fontStyle: 'italic', marginTop: 0 }}>
            Gift2u / Gift Tap. Public pages:{' '}
            <a href="/terms" style={{ color: '#a78bfa' }} target="_blank" rel="noreferrer">
              /terms
            </a>
            {' · '}
            <a href="/privacy" style={{ color: '#a78bfa' }} target="_blank" rel="noreferrer">
              /privacy
            </a>
            . Not a substitute for advice from a licensed attorney.
          </p>
          {body}
        </div>
      </div>
    </div>
  );
};

export default LegalModal;
