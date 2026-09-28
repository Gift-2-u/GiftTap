import React, { useState } from 'react';
import GiftTapLaunchModal from './GiftTapLaunchModal';

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
 * Gift Tap entry on the marketing site.
 * Always opens Download / Open app chooser — no web play link.
 */
export default function GiftTapPlayButton({
  children,
  className = '',
  style,
  asLinkStyle = false,
  variant = 'menu',
}) {
  const [open, setOpen] = useState(false);

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
      <GiftTapLaunchModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
