import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import GiftTapLaunchModal, { getGiftTapApkUrl } from './GiftTapLaunchModal';

/** Nav/link look — transparent, inherits yellow text (no white browser button). */
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

/** Homepage CTA — keep Tailwind gradient; only kill default button chrome. */
const ctaBtnReset = {
  border: 'none',
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
};

/**
 * Gift Tap entry: dropdown menu under the button (header/nav),
 * or full modal for big homepage CTA (variant="modal").
 */
export default function GiftTapPlayButton({
  children,
  className = '',
  style,
  asLinkStyle = false,
  /** "menu" = dropdown under button; "modal" = centered popup */
  variant = 'menu',
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const btnRef = useRef(null);

  const placeMenu = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 224;
    let left = r.right - width;
    if (left < 8) left = 8;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    setMenuPos({
      top: r.bottom + 8,
      left,
      width,
    });
  };

  useLayoutEffect(() => {
    if (!open || variant !== 'menu') {
      setMenuPos(null);
      return undefined;
    }
    placeMenu();
    const onScrollOrResize = () => placeMenu();
    window.addEventListener('resize', onScrollOrResize);
    // capture scroll from any ancestor without making the header grow
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, variant]);

  useEffect(() => {
    if (!open || variant !== 'menu') return undefined;
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
  }, [open, variant]);

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
              Download Android app
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
