import React from 'react';
import {
  ROADMAP_META,
  ROADMAP_PHASES,
  STATUS_COLOR,
  STATUS_LABEL,
} from './roadmapContent';

/**
 * In-game roadmap (Menu → Roadmap). Same content as /roadmap on the website.
 */
export default function RoadmapModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.92)',
        zIndex: 100050,
        display: 'flex',
        flexDirection: 'column',
        padding: '12px',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          flex: 1,
          maxWidth: 480,
          width: '100%',
          margin: '0 auto',
          background: '#131517',
          border: '1px solid #333',
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          maxHeight: '92vh',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 16px',
            borderBottom: '1px solid #222',
            flexShrink: 0,
          }}
        >
          <div>
            <h2 style={{ margin: 0, color: '#ffd700', fontSize: 18 }}>{ROADMAP_META.title}</h2>
            <p style={{ margin: '4px 0 0', color: '#666', fontSize: 11 }}>
              {ROADMAP_META.lastUpdated}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#222',
              border: 'none',
              color: '#fff',
              width: 36,
              height: 36,
              borderRadius: 10,
              fontSize: 18,
              cursor: 'pointer',
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <p style={{ color: '#aaa', fontSize: 13, lineHeight: 1.45, margin: '0 0 16px' }}>
            {ROADMAP_META.subtitle}
          </p>

          {ROADMAP_PHASES.map((phase) => {
            const color = STATUS_COLOR[phase.status] || '#888';
            return (
              <div
                key={phase.id}
                style={{
                  marginBottom: 14,
                  background: '#111',
                  border: `1px solid ${color}44`,
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                    gap: 8,
                  }}
                >
                  <h3 style={{ margin: 0, color: '#fff', fontSize: 15 }}>{phase.title}</h3>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 'bold',
                      color: '#000',
                      background: color,
                      padding: '3px 8px',
                      borderRadius: 20,
                    }}
                  >
                    {STATUS_LABEL[phase.status] || phase.status}
                  </span>
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    color: '#ccc',
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  {phase.items.map((item, i) => (
                    <li key={`${phase.id}-${i}`} style={{ marginBottom: 4 }}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          <p style={{ color: '#555', fontSize: 10, lineHeight: 1.4, margin: '8px 0 0' }}>
            {ROADMAP_META.disclaimer}
          </p>
          <a
            href="/roadmap"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block',
              marginTop: 12,
              textAlign: 'center',
              color: '#a78bfa',
              fontSize: 12,
              fontWeight: 'bold',
            }}
          >
            Open full page on website →
          </a>
        </div>
      </div>
    </div>
  );
}
