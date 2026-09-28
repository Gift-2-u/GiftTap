import React from 'react';
import { Link } from 'react-router-dom';
import { isSeekerShell } from './adService';

/**
 * Always the live site APK — never localhost / your PC.
 * Put the file at public/Gift2U.apk and deploy so https://gift2u.fun/Gift2U.apk works.
 */
export function getGiftTapApkUrl() {
  const envUrl =
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    String(import.meta.env.VITE_ANDROID_APK_URL || '').trim();
  if (envUrl && /^https?:\/\//i.test(envUrl)) return envUrl;
  return 'https://gift2u.fun/Gift2U.apk';
}

export const GIFT_TAP_APK_URL = 'https://gift2u.fun/Gift2U.apk';

/**
 * Open installed Gift Tap app (fun.gift2u.tap) to /play.
 * Falls back to APK download if the app is not installed.
 */
export function getGiftTapOpenAppUrl() {
  const apk = encodeURIComponent(getGiftTapApkUrl());
  return (
    'intent://gift2u.fun/play#Intent;scheme=https;package=fun.gift2u.tap;' +
    `S.browser_fallback_url=${apk};end`
  );
}

/**
 * Gift Tap is app-only on the public site.
 * Browser (any device) → download / open app. Seeker / APK WebView → play.
 * Localhost stays open for your own testing.
 */
export function mustDownloadGiftTapApp() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  try {
    if (isSeekerShell()) return false;
  } catch {
    /* ignore */
  }
  try {
    const host = String(window.location.hostname || '');
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host.endsWith('.local')
    ) {
      return false;
    }
  } catch {
    /* ignore */
  }
  return true;
}

function isAndroidUa() {
  try {
    return /Android/i.test(String(navigator.userAgent || ''));
  } catch {
    return false;
  }
}

/**
 * Gift Tap chooser — Open app (Android) + Download. No web play.
 */
export default function GiftTapLaunchModal({ open, onClose }) {
  if (!open) return null;

  const showOpenApp = isAndroidUa();

  return (
    <div
      className="fixed inset-0 z-[200000] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gift-tap-launch-title"
    >
      <div
        className="w-full max-w-sm rounded-2xl border-2 border-yellow-400/80 p-5 shadow-2xl"
        style={{ background: '#131517' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="gift-tap-launch-title"
          className="text-center text-xl font-black text-yellow-300 mb-2"
        >
          Gift Tap
        </h2>

        <p className="text-center text-slate-300 text-sm mb-5 leading-relaxed">
          Gift Tap is an <strong className="text-white">Android app</strong> (AdMob Free
          Energy). Download it on your phone — same login = same stats.
        </p>

        {showOpenApp ? (
          <a
            href={getGiftTapOpenAppUrl()}
            onClick={onClose}
            className="mb-3 flex w-full items-center justify-center rounded-full px-5 py-3.5 text-base font-black"
            style={{
              background: 'linear-gradient(90deg,#fbef43,#fbbf24)',
              color: '#042f2e',
            }}
          >
            Open Gift Tap app
          </a>
        ) : null}

        <a
          href={getGiftTapApkUrl()}
          download="Gift2U.apk"
          className="mb-3 flex w-full items-center justify-center rounded-full border-2 border-emerald-400/60 px-5 py-3.5 text-base font-black text-emerald-200 hover:bg-emerald-950/40"
        >
          Download Gift Tap
        </a>

        <p className="text-center text-[11px] text-slate-500 mb-4 leading-snug">
          Same login = same stats · allow install from this site if asked
        </p>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-full border border-slate-600 py-2.5 text-sm font-bold text-slate-400 hover:text-white"
        >
          Close
        </button>
      </div>
    </div>
  );
}

/** Full-screen gate when a browser opens /play — Open app + Download (no web play). */
export function AndroidMustDownloadGate() {
  const showOpenApp = isAndroidUa();

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4"
      style={{ background: '#0f172a' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border-2 border-yellow-400/80 p-5 text-center"
        style={{ background: '#131517' }}
      >
        <h1 className="text-xl font-black text-yellow-300 mb-3">Gift Tap</h1>
        <p className="text-slate-300 text-sm mb-5 leading-relaxed">
          Gift Tap runs in the <strong className="text-emerald-300">Gift Tap</strong> Android
          app.
          <br />
          <span className="text-slate-500 text-xs">
            Download on your phone for Free Energy ads (AdMob). Same login = same stats.
          </span>
        </p>
        {showOpenApp ? (
          <a
            href={getGiftTapOpenAppUrl()}
            className="mb-3 flex w-full items-center justify-center rounded-full px-5 py-3.5 text-base font-black"
            style={{
              background: 'linear-gradient(90deg,#fbef43,#fbbf24)',
              color: '#042f2e',
            }}
          >
            Open Gift Tap app
          </a>
        ) : null}
        <a
          href={getGiftTapApkUrl()}
          download="Gift2U.apk"
          className="mb-3 flex w-full items-center justify-center rounded-full px-5 py-3.5 text-base font-black"
          style={{
            background: 'linear-gradient(90deg,#34d399,#059669)',
            color: '#042f2e',
          }}
        >
          Download Gift Tap
        </a>
        <p className="text-[11px] text-slate-500 leading-snug mb-4">
          Same login = same stats · allow install from this site if asked
        </p>
        <Link
          to="/"
          className="block w-full rounded-full border border-slate-600 py-2.5 text-sm font-bold text-slate-400 hover:text-white"
        >
          Back to site
        </Link>
      </div>
    </div>
  );
}
