import React from 'react';

/**
 * In-app notice modal — replaces browser alert() ("gift2u.fun says…").
 *
 * @param {boolean} show
 * @param {string} message
 * @param {boolean} [loading]
 * @param {boolean|null} [success] true=ok, false=error, null=neutral
 * @param {() => void} onClose
 * @param {string} [title]
 */
export default function AppNotice({
  show,
  message,
  loading = false,
  success = null,
  onClose,
  title,
}) {
  if (!show) return null;

  const border =
    loading
      ? '2px solid #3b82f6'
      : success === true
        ? '2px solid #4ade80'
        : success === false
          ? '2px solid #f87171'
          : '2px solid #ffd700';

  const heading =
    title ||
    (loading
      ? 'Processing…'
      : success === true
        ? 'Done'
        : success === false
          ? 'Notice'
          : 'Gift Tap');

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 200000,
        padding: 16,
        boxSizing: 'border-box',
      }}
      onClick={() => {
        if (!loading && onClose) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          background: '#1c1e22',
          padding: '25px',
          borderRadius: '15px',
          border,
          textAlign: 'center',
          width: '100%',
          maxWidth: '320px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ color: '#fff', marginTop: 0, marginBottom: '15px', fontSize: 18 }}>
          {loading ? '⚙️ ' : success === true ? '✅ ' : success === false ? '⚠️ ' : 'ℹ️ '}
          {heading}
        </h3>
        <p
          style={{
            color: '#ccc',
            fontSize: '13px',
            lineHeight: '1.45',
            marginBottom: loading ? 0 : '25px',
            wordBreak: 'break-word',
            whiteSpace: 'pre-line',
          }}
        >
          {message}
        </p>
        {!loading && (
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              background: '#333',
              color: '#fff',
              border: '1px solid #555',
              padding: '12px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            OK
          </button>
        )}
      </div>
    </div>
  );
}

/** Optional helper shape for setState */
export function noticeState(message, { loading = false, success = null, title } = {}) {
  return { show: true, message: String(message ?? ''), loading, success, title };
}
