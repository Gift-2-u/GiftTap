import React, { useState } from 'react';
import { HELP_TIPS } from './helpContent';

/**
 * Small "?" circle — opens an in-app explainer popup.
 * Use next to HUD labels players find confusing.
 */
export default function HelpTip({
  tipKey,
  size = 16,
  style = {},
  onOpenPlaybook,
}) {
  const [open, setOpen] = useState(false);
  const tip = HELP_TIPS[tipKey];
  if (!tip) return null;

  const openTip = (e) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    setOpen(true);
  };

  const closeTip = (e) => {
    e?.stopPropagation?.();
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={openTip}
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

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`help-tip-${tipKey}`}
          onClick={closeTip}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 250000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            boxSizing: 'border-box',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1c1e22',
              border: '2px solid #ffd700',
              borderRadius: 16,
              padding: 22,
              width: '100%',
              maxWidth: 320,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              textAlign: 'left',
            }}
          >
            <h3
              id={`help-tip-${tipKey}`}
              style={{
                color: '#ffd700',
                margin: '0 0 12px',
                fontSize: 17,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  border: '1.5px solid #ffd700',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                ?
              </span>
              {tip.title}
            </h3>
            <p
              style={{
                color: '#ccc',
                fontSize: 13,
                lineHeight: 1.5,
                margin: '0 0 18px',
                whiteSpace: 'pre-line',
              }}
            >
              {tip.body}
            </p>
            <button
              type="button"
              onClick={closeTip}
              style={{
                width: '100%',
                background: '#ffd700',
                color: '#000',
                border: 'none',
                borderRadius: 30,
                padding: '12px',
                fontWeight: 'bold',
                fontSize: 14,
                cursor: 'pointer',
                marginBottom: onOpenPlaybook ? 10 : 0,
              }}
            >
              Got it
            </button>
            {typeof onOpenPlaybook === 'function' && (
              <button
                type="button"
                onClick={(e) => {
                  closeTip(e);
                  onOpenPlaybook();
                }}
                style={{
                  width: '100%',
                  background: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid #334155',
                  borderRadius: 30,
                  padding: '12px',
                  fontWeight: 'bold',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Open Game Guide
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
