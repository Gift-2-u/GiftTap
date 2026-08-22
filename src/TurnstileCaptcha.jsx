import React, { useEffect, useRef } from 'react';

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

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
 */
export default function TurnstileCaptcha({ onToken, resetKey = 0 }) {
  const hostRef = useRef(null);
  const widgetIdRef = useRef(null);

  useEffect(() => {
    if (!SITE_KEY || !hostRef.current) {
      if (typeof onToken === 'function') onToken('');
      return undefined;
    }
    let cancelled = false;

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
            if (typeof onToken === 'function') onToken(token || '');
          },
          'expired-callback': () => {
            if (typeof onToken === 'function') onToken('');
          },
          'error-callback': () => {
            if (typeof onToken === 'function') onToken('');
          },
        });
      } catch (e) {
        console.warn('Turnstile load failed', e);
        if (typeof onToken === 'function') onToken('');
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
    <div
      ref={hostRef}
      style={{
        margin: '8px 0 12px',
        display: 'flex',
        justifyContent: 'center',
        minHeight: 65,
      }}
    />
  );
}

export function turnstileRequired() {
  return !!SITE_KEY;
}
