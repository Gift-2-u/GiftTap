/**
 * Compact NFT filters — one row of category buttons.
 * Tap a category to reveal a horizontal scroll of options.
 */
import React, { useState } from 'react';
import {
  NFT_RARITY_OPTS,
  NFT_ROLE_OPTS,
  NFT_LEVEL_OPTS,
  NFT_SORT_OPTS,
} from './nftMarketFilters';

const CATEGORIES = [
  { key: 'rarity', label: 'Rarity', opts: NFT_RARITY_OPTS, defaultId: 'all' },
  { key: 'role', label: 'Role', opts: NFT_ROLE_OPTS, defaultId: 'all' },
  { key: 'level', label: 'Level', opts: NFT_LEVEL_OPTS, defaultId: 'all' },
  { key: 'sort', label: 'Sort', opts: NFT_SORT_OPTS, defaultId: 'default' },
];

function optLabel(opts, id) {
  return opts.find((o) => o.id === id)?.label || id;
}

/**
 * @param {{
 *   rarity: string,
 *   role: string,
 *   level: string,
 *   sort: string,
 *   onChange: (next: { rarity?: string, role?: string, level?: string, sort?: string }) => void,
 *   resultCount?: number,
 *   totalCount?: number,
 *   trailing?: React.ReactNode,
 * }} props
 */
export default function NftFilterBar({
  rarity = 'all',
  role = 'all',
  level = 'all',
  sort = 'default',
  onChange,
  resultCount,
  totalCount,
  trailing = null,
}) {
  const [openKey, setOpenKey] = useState(null);

  const values = { rarity, role, level, sort };

  const isDirty =
    rarity !== 'all' || role !== 'all' || level !== 'all' || sort !== 'default';

  const openCat = CATEGORIES.find((c) => c.key === openKey) || null;

  const setField = (key, id) => {
    if (typeof onChange === 'function') onChange({ [key]: id });
  };

  const clearAll = () => {
    if (typeof onChange === 'function') {
      onChange({
        rarity: 'all',
        role: 'all',
        level: 'all',
        sort: 'default',
      });
    }
    setOpenKey(null);
  };

  return (
    <div
      style={{
        marginBottom: 10,
        background: '#141414',
        border: '1px solid #2a2a2a',
        borderRadius: 12,
        padding: 8,
      }}
    >
      {/* Category buttons — one row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 5,
            flex: 1,
            minWidth: 0,
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {CATEGORIES.map((cat) => {
            const val = values[cat.key];
            const active = val !== cat.defaultId;
            const expanded = openKey === cat.key;
            const shown = active
              ? optLabel(cat.opts, val)
              : cat.label;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() =>
                  setOpenKey((k) => (k === cat.key ? null : cat.key))
                }
                style={{
                  flexShrink: 0,
                  padding: '7px 10px',
                  borderRadius: 999,
                  border: expanded
                    ? '1px solid #c084fc'
                    : active
                      ? '1px solid #a78bfa88'
                      : '1px solid #333',
                  background: expanded
                    ? 'rgba(192,132,252,0.2)'
                    : active
                      ? 'rgba(192,132,252,0.1)'
                      : '#1c1e22',
                  color: expanded || active ? '#c084fc' : '#888',
                  fontSize: 11,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>{shown}</span>
                <span style={{ fontSize: 9, opacity: 0.7 }}>
                  {expanded ? '▴' : '▾'}
                </span>
              </button>
            );
          })}
        </div>
        {trailing}
      </div>

      {/* Options strip — scroll horizontally when a category is open */}
      {openCat ? (
        <div
          style={{
            display: 'flex',
            gap: 5,
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            marginTop: 8,
            paddingTop: 6,
            borderTop: '1px solid #222',
          }}
        >
          {openCat.opts.map((opt) => {
            const selected = values[openCat.key] === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setField(openCat.key, opt.id);
                  setOpenKey(null);
                }}
                style={{
                  flexShrink: 0,
                  padding: '6px 11px',
                  borderRadius: 999,
                  border: selected ? '1px solid #c084fc' : '1px solid #333',
                  background: selected
                    ? 'rgba(192,132,252,0.18)'
                    : '#111',
                  color: selected ? '#c084fc' : '#aaa',
                  fontSize: 11,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Count + clear */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 6,
        }}
      >
        <span style={{ color: '#555', fontSize: 9 }}>
          {typeof resultCount === 'number' && typeof totalCount === 'number'
            ? `${resultCount} of ${totalCount}`
            : typeof resultCount === 'number'
              ? `${resultCount}`
              : ''}
        </span>
        {isDirty ? (
          <button
            type="button"
            onClick={clearAll}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              fontSize: 10,
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            Clear
          </button>
        ) : (
          <span style={{ fontSize: 9, color: '#444' }}>tap a filter</span>
        )}
      </div>
    </div>
  );
}
