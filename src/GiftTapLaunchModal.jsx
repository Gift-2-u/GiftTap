import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Always the live site APK — never localhost / your PC.
 * Put the file at public/Gift2U.apk and deploy so https://gift2u.fun/Gift2U.apk works.
 * Override only with VITE_ANDROID_APK_URL (full https URL).
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
 * Gift Tap chooser: Play on web vs Download Android APK.
 */
export default function GiftTapLaunchModal({ open, onClose }) {
  if (!open) return null;

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
        <p className="text-center text-slate-400 text-sm mb-5 leading-relaxed">
          Play in the browser, or download the Android app (AdMob Free Energy — same as Seeker).
          Install from gift2u.fun; Google Play not required.
        </p>

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

        <a
          href={getGiftTapApkUrl()}
          download="Gift2U.apk"
          className="mb-3 flex w-full items-center justify-center rounded-full border-2 border-emerald-400/60 px-5 py-3.5 text-base font-black text-emerald-200 hover:bg-emerald-950/40"
        >
          Download Android app
        </a>

        <p className="text-center text-[11px] text-slate-500 mb-4 leading-snug">
          Hosted on gift2u.fun · Android app with AdMob · allow install from this site if asked
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
