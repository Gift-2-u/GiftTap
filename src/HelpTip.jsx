import React from 'react';
import { HELP_TIPS } from './helpContent';

/**
 * "?" trigger only — same as Milestone / Wallet / Free Energy buttons.
 * Parent (GiftTap) owns the overlay via onOpen(tipKey).
 */
export default function HelpTip({
  tipKey,
  size = 16,
  style = {},
  onOpen,
}) {
  const tip = HELP_TIPS[tipKey];
  if (!tip) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e?.stopPropagation?.();
        e?.preventDefault?.();
        if (typeof onOpen === 'function') onOpen(tipKey);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={`Help: ${tip.title}`}
      title={tip.title}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: '50%',
        border: '1.5px solid #888',
        background: 'rgba(0,0,0,0.45)',
        color: '#ffd700',
        fontSize: Math.max(10, size * 0.65),
        fontWeight: 800,
        lineHeight: 1,
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flexShrink: 0,
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
        ...style,
      }}
    >
      ?
    </button>
  );
}
