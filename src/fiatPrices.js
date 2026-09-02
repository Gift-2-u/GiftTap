/**
 * Fiat pricing helpers for game wallet.
 * SOL + USDC: CoinGecko. $G2U: DexScreener after launch. G2Ushards: in-game only.
 */

import { MINT_ADDRESS } from './config';

export const FIAT_CURRENCIES = [
  'USD', 'EUR', 'CAD', 'GBP', 'AUD', 'JPY', 'CNY', 'INR', 'PHP', 'IDR',
  'BRL', 'MXN', 'ARS', 'NGN', 'ZAR', 'TRY', 'AED', 'SGD', 'HKD', 'NZD',
  'KRW', 'THB', 'VND', 'MYR', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK',
];

const G2U_MINT = String(MINT_ADDRESS?.toBase58?.() || MINT_ADDRESS || '').trim();

/** USD price of 1 $G2U from DexScreener (best liquidity pair). */
async function fetchG2uUsdPrice() {
  if (!G2U_MINT) return null;
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${G2U_MINT}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
    if (!pairs.length) return null;
    const ranked = [...pairs].sort((a, b) => {
      const aSol = /sol/i.test(String(a?.quoteToken?.symbol || '')) ? 1 : 0;
      const bSol = /sol/i.test(String(b?.quoteToken?.symbol || '')) ? 1 : 0;
      if (bSol !== aSol) return bSol - aSol;
      return (Number(b?.liquidity?.usd) || 0) - (Number(a?.liquidity?.usd) || 0);
    });
    const px = Number(ranked[0]?.priceUsd);
    return Number.isFinite(px) && px > 0 ? px : null;
  } catch {
    return null;
  }
}

function usdToFiatMap(usdPrice, usdcRates) {
  const out = {};
  if (usdPrice == null || !Number.isFinite(usdPrice)) return out;
  for (const c of FIAT_CURRENCIES) {
    if (c === 'USD') {
      out[c] = usdPrice;
      continue;
    }
    const usdc = usdcRates?.[c];
    if (typeof usdc === 'number' && usdc > 0) out[c] = usdPrice * usdc;
  }
  return out;
}

/** @returns {Promise<{ sol: Record<string, number>, usdc: Record<string, number>, g2u: Record<string, number> }>} */
export async function fetchFiatRates() {
  const vs = FIAT_CURRENCIES.join(',').toLowerCase();
  const [cgRes, g2uUsd] = await Promise.all([
    fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=solana,usd-coin&vs_currencies=${vs}`,
    ),
    fetchG2uUsdPrice(),
  ]);
  if (!cgRes.ok) throw new Error(`Price API ${cgRes.status}`);
  const data = await cgRes.json();

  const mapCoin = (coinKey) => {
    const rates = {};
    const src = data?.[coinKey] || {};
    FIAT_CURRENCIES.forEach((c) => {
      const v = src[c.toLowerCase()];
      if (typeof v === 'number') rates[c] = v;
    });
    return rates;
  };

  const usdc = mapCoin('usd-coin');
  return {
    sol: mapCoin('solana'),
    usdc,
    g2u: usdToFiatMap(g2uUsd, usdc),
  };
}

export function formatFiat(amount, currency = 'USD') {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  const n = Number(amount);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: n >= 1000 ? 0 : n >= 1 ? 2 : 6,
      minimumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

/**
 * Fiat value of a swap token amount (SOL / USDC / G2U).
 * @returns {number|null}
 */
export function tokenFiatValue(token, amount, currency = 'USD', rates) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return null;
  const t = String(token || '').toUpperCase();
  let price = null;
  if (t === 'SOL') price = rates?.sol?.[currency] ?? null;
  else if (t === 'USDC')
    price = rates?.usdc?.[currency] ?? (currency === 'USD' ? 1 : null);
  else if (t === 'G2U' || t === 'GFT') price = rates?.g2u?.[currency] ?? null;
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  return amt * price;
}

/** Ready-to-display swap line, e.g. "≈ $12.34" or "" if unknown. */
export function formatTokenFiatLine(token, amount, currency = 'USD', rates) {
  const v = tokenFiatValue(token, amount, currency, rates);
  if (v == null) return '';
  return `≈ ${formatFiat(v, currency)}`;
}

/**
 * @param {object} bal - { sol, G2U, G2Ushards, usdc } amounts
 * @param {string} currency - e.g. USD
 * @param {{ sol?: Record<string,number>, usdc?: Record<string,number>, g2u?: Record<string,number> }} rates
 */
export function valuePortfolio(bal, currency, rates) {
  const solAmt = Number(bal?.sol ?? bal?.SOL ?? 0) || 0;
  const usdcAmt = Number(bal?.usdc ?? bal?.USDC ?? 0) || 0;
  const gftAmt = Number(bal?.G2U ?? bal?.g2u ?? 0) || 0;
  const shardsAmt = Number(bal?.G2Ushards ?? bal?.shard_balance ?? 0) || 0;

  const solPrice = rates?.sol?.[currency] ?? null;
  const usdcPrice = rates?.usdc?.[currency] ?? (currency === 'USD' ? 1 : null);
  const g2uPrice = rates?.g2u?.[currency] ?? null;

  const solFiat = solPrice != null ? solAmt * solPrice : null;
  const usdcFiat = usdcPrice != null ? usdcAmt * usdcPrice : null;
  const gftFiat = g2uPrice != null ? gftAmt * g2uPrice : null;
  const shardsFiat = null; // in-game only

  const priced = [solFiat, usdcFiat, gftFiat].filter((v) => v != null);
  const total = priced.length ? priced.reduce((a, b) => a + b, 0) : null;
  const hasUnpriced = shardsAmt > 0 || (gftAmt > 0 && g2uPrice == null);

  return {
    lines: {
      sol: { amount: solAmt, fiat: solFiat, priced: solPrice != null },
      usdc: { amount: usdcAmt, fiat: usdcFiat, priced: usdcPrice != null },
      G2U: { amount: gftAmt, fiat: gftFiat, priced: g2uPrice != null },
      G2Ushards: { amount: shardsAmt, fiat: shardsFiat, priced: false },
    },
    total,
    hasUnpriced,
    currency,
  };
}
