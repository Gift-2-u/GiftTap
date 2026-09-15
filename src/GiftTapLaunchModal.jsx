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

/** Android phone in Chrome/Samsung browser — not already inside Gift2U / Seeker app. */
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
 * Android browser: force download (no web play).
 * Desktop: Play on web + Download.
 */
export default function GiftTapLaunchModal({ open, onClose, forceAndroid = false }) {
  if (!open) return null;

  const androidOnly = forceAndroid || mustDownloadGiftTapApp();

  return (
    <div
      className="fixed inset-0 z-[200000] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={androidOnly ? undefined : onClose}
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
            Gift Tap is updating to an <strong className="text-white">app</strong>. Download{' '}
            <strong className="text-emerald-300">Gift2U</strong> to continue playing (AdMob Free
            Energy). Same login = same stats.
          </p>
        ) : (
          <p className="text-center text-slate-400 text-sm mb-5 leading-relaxed">
            Play Gift Tap on web, or download the <strong className="text-emerald-300">Gift2U</strong>{' '}
            Android app (AdMob Free Energy).
          </p>
        )}

        {!androidOnly ? (
          <Link
            to="/play"
            onClick={onClose}
            className="mb-3 flex w-full items-center justify-center rounded-full px-5 py-3.5 text-base font-black text-slate-950"
            style={{
              background: 'linear-gradient(90deg,#fbef43,#fbbf24)',
            }}
          >
            Play on web
          </Link>
        ) : null}

        <a
          href={getGiftTapApkUrl()}
          download="Gift2U.apk"
          className="mb-3 flex w-full items-center justify-center rounded-full border-2 border-emerald-400/60 px-5 py-3.5 text-base font-black text-emerald-200 hover:bg-emerald-950/40"
          style={
            androidOnly
              ? {
                  background: 'linear-gradient(90deg,#34d399,#059669)',
                  color: '#042f2e',
                  border: 'none',
                }
              : undefined
          }
        >
          Download Gift2U (Gift Tap)
        </a>

        <p className="text-center text-[11px] text-slate-500 mb-4 leading-snug">
          App name on your phone: <strong className="text-slate-400">Gift2U</strong> · Game inside:{' '}
          <strong className="text-slate-400">Gift Tap</strong>
          <br />
          Hosted on gift2u.fun · allow install from this site if asked
        </p>

        {!androidOnly ? (
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-full border border-slate-600 py-2.5 text-sm font-bold text-slate-400 hover:text-white"
          >
            Close
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Full-screen gate when Android opens /play in a browser */
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
          Gift Tap is updating to play as an app. Download{' '}
          <strong className="text-emerald-300">Gift2U</strong> to continue playing.
          <br />
          <span className="text-slate-500 text-xs">
            Same username + password = same stats · Free Energy uses AdMob
          </span>
        </p>
        <a
          href={getGiftTapApkUrl()}
          download="Gift2U.apk"
          className="mb-3 flex w-full items-center justify-center rounded-full px-5 py-3.5 text-base font-black"
          style={{
            background: 'linear-gradient(90deg,#34d399,#059669)',
            color: '#042f2e',
          }}
        >
          Download Gift2U (Gift Tap)
        </a>
        <p className="text-[11px] text-slate-500 leading-snug">
          On your phone the app is named Gift2U — inside you play Gift Tap.
        </p>
      </div>
    </div>
  );
}
