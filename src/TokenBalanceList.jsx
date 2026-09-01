import React from 'react';
import { formatFiat, valuePortfolio } from './fiatPrices';

const TOKEN_META = {
  sol: { label: 'SOL', decimals: 4 },
  usdc: { label: 'USDC', decimals: 2 },
  G2U: { label: 'G2U', decimals: 4 },
  G2Ushards: { label: 'G2Ushards', decimals: 0 },
};

/**
 * Crypto-wallet style balances: amount + fiat under each line, total at top.
 */
export default function TokenBalanceList({
  balances,
  currency = 'USD',
  rates = {},
  style = {},
}) {
  const portfolio = valuePortfolio(balances, currency, rates);
  const order = ['sol', 'usdc', 'G2U', 'G2Ushards'];

  return (
    <div style={{ width: '100%', textAlign: 'left', ...style }}>
      {/* Portfolio total — compact single row for modal width */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(255,215,0,0.12), rgba(153,69,255,0.1))',
          border: '1px solid rgba(255,215,0,0.25)',
          borderRadius: '12px',
          padding: '10px 12px',
          marginBottom: '10px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <div style={{ color: '#888', fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.04em' }}>
            TOTAL BALANCE
          </div>
          <div
            style={{
              color: '#ffd700',
              fontSize: '16px',
              fontWeight: 800,
              lineHeight: 1.2,
              textAlign: 'right',
              whiteSpace: 'nowrap',
            }}
          >
            {portfolio.total != null ? formatFiat(portfolio.total, currency) : '—'}
          </div>
        </div>
        {portfolio.hasUnpriced ? (
          <div style={{ color: '#555', fontSize: '9px', marginTop: '6px', lineHeight: 1.3 }}>
            {portfolio.lines?.G2U?.priced
              ? 'G2Ushards not in total (in-game only).'
              : 'G2Ushards not in total; $G2U price loading or no pool yet.'}
          </div>
        ) : portfolio.total == null ? (
          <div style={{ color: '#555', fontSize: '9px', marginTop: '6px' }}>
            Fiat prices loading…
          </div>
        ) : null}
      </div>

      {/* Per-token rows */}
      <div style={{ background: '#111', borderRadius: '12px', border: '1px solid #2a2d34', overflow: 'hidden' }}>
        {order.map((key, i) => {
          const meta = TOKEN_META[key] || { label: key, decimals: 4 };
          const line = portfolio.lines[key];
          if (!line) return null;
          const amt = line.amount;
          const amtStr =
            meta.decimals === 0
              ? Number(amt).toLocaleString()
              : Number(amt).toFixed(meta.decimals);

          return (
            <div
              key={key}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 12px',
                borderBottom: i < order.length - 1 ? '1px solid #2a2d34' : 'none',
              }}
            >
              <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '13px' }}>{meta.label}</div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '13px' }}>{amtStr}</div>
                <div style={{ color: '#888', fontSize: '11px', marginTop: '2px' }}>
                  {line.priced && line.fiat != null
                    ? formatFiat(line.fiat, currency)
                    : key === 'G2Ushards'
                      ? 'In-game only'
                      : key === 'G2U'
                        ? 'Price loading…'
                        : '—'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
