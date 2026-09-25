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

/** Android phone in Chrome/Samsung browser — not already inside Gift Tap / Seeker app. */
export function mustDownloadGiftTapApp() {
  if (typeof navigator === 'undefined') return false;
  try {
    if (isSeekerShell()) return false;
  } catch {
    /* ignore */
  }
  const ua = String(navigator.userAgent || '');
  return /Android/i.test(ua);
}

/**
 * Gift Tap chooser.
 * Android: Open app (if installed) + Download — no web play.
 * Desktop: Play Gift Tap + Download Gift Tap.
 */
export default function GiftTapLaunchModal({ open, onClose, forceAndroid = false }) {
  if (!open) return null;

  const androidOnly = forceAndroid || mustDownloadGiftTapApp();

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

        {androidOnly ? (
          <p className="text-center text-slate-300 text-sm mb-5 leading-relaxed">
            Gift Tap is an <strong className="text-white">app</strong> on your phone. Open it
            if you already installed it, or download it.
          </p>
        ) : (
          <p className="text-center text-slate-400 text-sm mb-5 leading-relaxed">
            Play Gift Tap here, or download the{' '}
            <strong className="text-emerald-300">Gift Tap</strong> Android app (AdMob Free
            Energy).
          </p>
        )}

        {androidOnly ? (
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
        ) : (
          <Link
            to="/play"
            onClick={onClose}
            className="mb-3 flex w-full items-center justify-center rounded-full px-5 py-3.5 text-base font-black text-slate-950"
            style={{
              background: 'linear-gradient(90deg,#fbef43,#fbbf24)',
            }}
          >
            Play Gift Tap
          </Link>
        )}

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

/** Full-screen gate when Android opens /play in a browser — Open app + Download (no web play). */
export function AndroidMustDownloadGate() {
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
          Gift Tap runs in the <strong className="text-emerald-300">Gift Tap</strong> app.
          <br />
          <span className="text-slate-500 text-xs">
            Already installed? Open the app. Otherwise download it. Same login = same stats.
          </span>
        </p>
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
