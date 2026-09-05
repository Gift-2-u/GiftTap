import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const VERSION_URL = '/version.json';
const POLL_MS = 45_000;
const SNOOZE_MS = 15 * 60_000;
const SNOOZE_KEY = 'gift2u_update_snooze';

/** Baked in at `vite build` time — must match version.json from the same deploy. */
const LOADED_BUILD_ID = String(import.meta.env.VITE_GIFT2U_BUILD_ID || '');

/** Hard reload that busts WebView / browser cache (Seeker-friendly). */
export function hardRefreshGame() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_r', String(Date.now()));
    const seeker =
      window.__GIFT2U_SEEKER_SHELL__ ||
      sessionStorage.getItem('gift2u_seeker') === '1' ||
      localStorage.getItem('gift2u_seeker') === '1';
    if (seeker) url.searchParams.set('seeker', '1');
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

function readSnooze() {
  try {
    const raw = sessionStorage.getItem(SNOOZE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeSnooze(v, until) {
  try {
    sessionStorage.setItem(SNOOZE_KEY, JSON.stringify({ v, until }));
  } catch {
    /* ignore */
  }
}

/**
 * When a new deploy lands, players still on an old tab/WebView see
 * "New game update" with a Refresh button that actually reloads fresh.
 *
 * version.json is written on every `vite build` (see vite.config.js).
 * Optional fields: title, message, force (hide Later).
 */
export default function UpdatePrompt() {
  const location = useLocation();
  const [remote, setRemote] = useState(null);
  const [visible, setVisible] = useState(false);

  const onPlay = location.pathname.startsWith('/play');

  const check = useCallback(async () => {
    if (import.meta.env.DEV) return;
    if (!LOADED_BUILD_ID || LOADED_BUILD_ID === 'dev') return;
    try {
      const res = await fetch(`${VERSION_URL}?_=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return;
      const data = await res.json();
      const v = data?.v != null ? String(data.v) : '';
      if (!v) return;

      if (v === LOADED_BUILD_ID) {
        setVisible(false);
        setRemote(null);
        return;
      }

      const snooze = readSnooze();
      if (
        snooze &&
        snooze.v === v &&
        typeof snooze.until === 'number' &&
        Date.now() < snooze.until &&
        !data.force
      ) {
        return;
      }

      setRemote({
        v,
        title: data.title || 'New game update',
        message:
          data.message ||
          'A new version of GiftTap is ready. Tap Refresh to load it — no need to close the app.',
        force: !!data.force,
      });
      setVisible(true);
    } catch {
      /* offline / blocked — ignore */
    }
  }, []);

  useEffect(() => {
    if (!onPlay) return undefined;
    check();
    const id = setInterval(check, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') check();
    };
    const onFocus = () => check();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [check, onPlay]);

  if (!onPlay || !visible || !remote) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 300000,
        padding: 16,
        boxSizing: 'border-box',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gift2u-update-title"
    >
      <div
        style={{
          background: '#1c1e22',
          padding: 25,
          borderRadius: 15,
          border: '2px solid #fbef43',
          textAlign: 'center',
          width: '100%',
          maxWidth: 320,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}
      >
        <h3
          id="gift2u-update-title"
          style={{ color: '#fff', marginTop: 0, marginBottom: 15, fontSize: 18 }}
        >
          ✨ {remote.title}
        </h3>
        <p
          style={{
            color: '#ccc',
            fontSize: 13,
            lineHeight: 1.45,
            marginBottom: 25,
            whiteSpace: 'pre-line',
          }}
        >
          {remote.message}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={hardRefreshGame}
            style={{
              width: '100%',
              background: '#fbef43',
              color: '#0f172a',
              border: 'none',
              padding: 14,
              borderRadius: 30,
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: 15,
            }}
          >
            Refresh
          </button>
          {!remote.force ? (
            <button
              type="button"
              onClick={() => {
                writeSnooze(remote.v, Date.now() + SNOOZE_MS);
                setVisible(false);
              }}
              style={{
                width: '100%',
                background: 'transparent',
                color: '#888',
                border: '1px solid #555',
                padding: 14,
                borderRadius: 30,
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: 14,
              }}
            >
              Later
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
