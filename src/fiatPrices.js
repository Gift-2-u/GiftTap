/**
 * Fiat pricing helpers for game wallet (CoinGecko).
 * SOL + USDC have live prices; G2U / G2Ushards stay unpriced until token market exists.
 */

export const FIAT_CURRENCIES = [
  'USD', 'EUR', 'CAD', 'GBP', 'AUD', 'JPY', 'CNY', 'INR', 'PHP', 'IDR',
  'BRL', 'MXN', 'ARS', 'NGN', 'ZAR', 'TRY', 'AED', 'SGD', 'HKD', 'NZD',
  'KRW', 'THB', 'VND', 'MYR', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK',
];

/** @returns {Promise<{ sol: Record<string, number>, usdc: Record<string, number> }>} */
export async function fetchFiatRates() {
  const vs = FIAT_CURRENCIES.join(',').toLowerCase();
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=solana,usd-coin&vs_currencies=${vs}`,
  );
  if (!res.ok) throw new Error(`Price API ${res.status}`);
  const data = await res.json();

  const mapCoin = (coinKey) => {
    const rates = {};
    const src = data?.[coinKey] || {};
    FIAT_CURRENCIES.forEach((c) => {
      const v = src[c.toLowerCase()];
      if (typeof v === 'number') rates[c] = v;
    });
    return rates;
  };

  return {
    sol: mapCoin('solana'),
    usdc: mapCoin('usd-coin'),
  };
}

export function formatFiat(amount, currency = 'USD') {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  const n = Number(amount);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: n >= 1000 ? 0 : n >= 1 ? 2 : 4,
      minimumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

/**
 * @param {object} bal - { sol, G2U, G2Ushards, usdc } amounts
 * @param {string} currency - e.g. USD
 * @param {{ sol?: Record<string,number>, usdc?: Record<string,number> }} rates
 */
export function valuePortfolio(bal, currency, rates) {
  const solAmt = Number(bal?.sol ?? bal?.SOL ?? 0) || 0;
  const usdcAmt = Number(bal?.usdc ?? bal?.USDC ?? 0) || 0;
  const gftAmt = Number(bal?.G2U ?? bal?.g2u ?? 0) || 0;
  const shardsAmt = Number(bal?.G2Ushards ?? bal?.shard_balance ?? 0) || 0;

  const solPrice = rates?.sol?.[currency] ?? null;
  const usdcPrice = rates?.usdc?.[currency] ?? (currency === 'USD' ? 1 : null);

  const solFiat = solPrice != null ? solAmt * solPrice : null;
  const usdcFiat = usdcPrice != null ? usdcAmt * usdcPrice : null;
  // No liquid market for in-game shards / pre-launch G2U
  const gftFiat = null;
  const shardsFiat = null;

  const priced = [solFiat, usdcFiat].filter((v) => v != null);
  const total = priced.length ? priced.reduce((a, b) => a + b, 0) : null;
  const hasUnpriced = gftAmt > 0 || shardsAmt > 0;

  return {
    lines: {
      sol: { amount: solAmt, fiat: solFiat, priced: solPrice != null },
      usdc: { amount: usdcAmt, fiat: usdcFiat, priced: usdcPrice != null },
      G2U: { amount: gftAmt, fiat: gftFiat, priced: false },
      G2Ushards: { amount: shardsAmt, fiat: shardsFiat, priced: false },
    },
    total,
    hasUnpriced,
    currency,
  };
}
