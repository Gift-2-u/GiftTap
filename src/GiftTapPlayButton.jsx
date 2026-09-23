import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import GiftTapLaunchModal, {
  getGiftTapApkUrl,
  mustDownloadGiftTapApp,
} from './GiftTapLaunchModal';

const navBtnReset = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  margin: 0,
  cursor: 'pointer',
  font: 'inherit',
  color: 'inherit',
  appearance: 'none',
  WebkitAppearance: 'none',
};

const ctaBtnReset = {
  border: 'none',
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
};

/**
 * Gift Tap entry.
 * Android browser → must download Gift2U app (modal).
 * Desktop → menu or modal with Play on web + Download.
 */
export default function GiftTapPlayButton({
  children,
  className = '',
  style,
  asLinkStyle = false,
  variant = 'menu',
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const btnRef = useRef(null);
  const forceApp = mustDownloadGiftTapApp();

  const placeMenu = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 240;
    let left = r.right - width;
    if (left < 8) left = 8;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    setMenuPos({ top: r.bottom + 8, left, width });
  };

  useLayoutEffect(() => {
    if (!open || variant !== 'menu' || forceApp) {
      setMenuPos(null);
      return undefined;
    }
    placeMenu();
    const onScrollOrResize = () => placeMenu();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, variant, forceApp]);

  useEffect(() => {
    if (!open || variant !== 'menu' || forceApp) return undefined;
    const onDoc = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      const menu = document.getElementById('gift-tap-play-menu');
      if (menu?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, variant, forceApp]);

  // Android phone browser: Open app + Download chooser (no web play)
  if (forceApp) {
    return (
      <>
        <button
          type="button"
          className={className}
          style={
            variant === 'modal'
              ? { ...ctaBtnReset, ...style }
              : { ...navBtnReset, ...style }
          }
          onClick={() => setOpen(true)}
        >
          {children}
        </button>
        <GiftTapLaunchModal
          open={open}
          onClose={() => setOpen(false)}
          forceAndroid
        />
      </>
    );
  }

  if (variant === 'modal') {
    return (
      <>
        <button
          type="button"
          className={className}
          style={{ ...ctaBtnReset, ...style }}
          onClick={() => setOpen(true)}
        >
          {children}
        </button>
        <GiftTapLaunchModal open={open} onClose={() => setOpen(false)} />
      </>
    );
  }

  const menu =
    open && menuPos && typeof document !== 'undefined'
      ? createPortal(
          <div
            id="gift-tap-play-menu"
            role="menu"
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              zIndex: 300000,
              overflow: 'hidden',
              borderRadius: 12,
              border: '1px solid rgba(251,239,67,0.5)',
              background: '#131517',
              boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
            }}
          >
            <Link
              to="/play"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block w-full px-4 py-3 text-left text-sm font-bold text-slate-950 hover:brightness-110"
              style={{ background: 'linear-gradient(90deg,#fbef43,#fbbf24)' }}
            >
              Play on web
            </Link>
            <a
              href={getGiftTapApkUrl()}
              download="Gift2U.apk"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block w-full border-t border-white/10 px-4 py-3 text-left text-sm font-bold text-emerald-300 hover:bg-emerald-950/40"
            >
              Download Gift2U (Gift Tap)
            </a>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={className}
        aria-expanded={open}
        aria-haspopup="menu"
        style={{ ...navBtnReset, ...style }}
        onClick={() => setOpen((v) => !v)}
      >
        {children}
      </button>
      {menu}
    </>
  );
}
