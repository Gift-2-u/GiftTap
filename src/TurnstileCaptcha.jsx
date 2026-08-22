import React, { useEffect, useRef, useState } from 'react';

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

function isLocalDevHost() {
  if (typeof window === 'undefined') return false;
  const h = String(window.location.hostname || '');
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

let scriptLoading = null;
function loadTurnstileScript() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptLoading) return scriptLoading;
  scriptLoading = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-turnstile]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.defer = true;
    s.dataset.turnstile = '1';
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return scriptLoading;
}

/**
 * Cloudflare Turnstile widget. Calls onToken(token) when solved; '' when expired.
 * If VITE_TURNSTILE_SITE_KEY is empty, renders nothing (dev bypass).
 *
 * Local npm run dev: your real sitekey only works if the widget Hostname Management
 * includes BOTH `localhost` and `127.0.0.1`. Phone on gift2u.fun works without that.
 */
export default function TurnstileCaptcha({ onToken, resetKey = 0 }) {
  const hostRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [widgetError, setWidgetError] = useState('');

  useEffect(() => {
    if (!SITE_KEY || !hostRef.current) {
      if (typeof onToken === 'function') onToken('');
      return undefined;
    }
    let cancelled = false;
    setWidgetError('');

    (async () => {
      try {
        await loadTurnstileScript();
        if (cancelled || !hostRef.current || !window.turnstile) return;
        if (widgetIdRef.current != null) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            /* ignore */
          }
          widgetIdRef.current = null;
        }
        hostRef.current.innerHTML = '';
        widgetIdRef.current = window.turnstile.render(hostRef.current, {
          sitekey: SITE_KEY,
          theme: 'dark',
          callback: (token) => {
            setWidgetError('');
            if (typeof onToken === 'function') onToken(token || '');
          },
          'expired-callback': () => {
            if (typeof onToken === 'function') onToken('');
          },
          'error-callback': () => {
            if (typeof onToken === 'function') onToken('');
            setWidgetError(
              isLocalDevHost()
                ? 'Cloudflare blocked this host. In Turnstile → your widget → Hostname Management, add BOTH localhost and 127.0.0.1 — then hard-refresh. (gift2u.fun on phone does not need this.)'
                : 'Captcha failed to load. Disable adblock for this page, then refresh.',
            );
          },
        });
      } catch (e) {
        console.warn('Turnstile load failed', e);
        if (typeof onToken === 'function') onToken('');
        setWidgetError(
          isLocalDevHost()
            ? 'Could not load Turnstile. Check Hostname Management includes localhost and 127.0.0.1.'
            : 'Could not load Cloudflare Turnstile script.',
        );
      }
    })();

    return () => {
      cancelled = true;
      if (widgetIdRef.current != null && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
        widgetIdRef.current = null;
      }
    };
  }, [onToken, resetKey]);

  if (!SITE_KEY) return null;

  return (
    <div style={{ margin: '8px 0 12px' }}>
      <div
        ref={hostRef}
        style={{
          display: 'flex',
          justifyContent: 'center',
          minHeight: 65,
        }}
      />
      {isLocalDevHost() ? (
        <p
          style={{
            color: '#666',
            fontSize: 10,
            textAlign: 'center',
            margin: '6px 0 0',
            lineHeight: 1.35,
          }}
        >
          Local Vite: Turnstile needs hostnames <strong style={{ color: '#888' }}>localhost</strong> and{' '}
          <strong style={{ color: '#888' }}>127.0.0.1</strong> on your Cloudflare widget. Try{' '}
          <strong style={{ color: '#888' }}>http://localhost:5173/play</strong> if you only added localhost.
        </p>
      ) : null}
      {widgetError ? (
        <p
          style={{
            color: '#fbbf24',
            fontSize: 11,
            textAlign: 'center',
            margin: '6px 0 0',
            lineHeight: 1.35,
          }}
        >
          {widgetError}
        </p>
      ) : null}
    </div>
  );
}

export function turnstileRequired() {
  return !!SITE_KEY;
}
