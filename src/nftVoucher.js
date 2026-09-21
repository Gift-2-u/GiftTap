/**
 * Common elf NFT voucher — 60% off next Fate/Echo/Rush/Shadow Common (one use).
 * Option B: player pays 40% on a SEPARATE promo candy machine (live CMs untouched).
 *
 * Safest CM setup:
 * - Deploy 4 promo Common CMs (one per elf) at 40% solPayment
 * - Gate with allowList (or keep addresses null until allowList is ready)
 * - Never lower price on the public Wave-1 CMs
 */

export const NFT_VOUCHER_KEY = 'nft_voucher';

/** 60% off → pay 40% */
export const NFT_VOUCHER_DISCOUNT_BPS = 6000;

export const NFT_VOUCHER_KINDS = ['fate', 'echo', 'rush', 'shadow'];

export const NFT_VOUCHER_TEMPLATE_COMMON60 = {
  id: 'common60_v1',
  discount_bps: NFT_VOUCHER_DISCOUNT_BPS,
  applies_to: [...NFT_VOUCHER_KINDS],
  rarity: 'common',
  uses_left: 1,
  source: 'promo',
};

export function promoPriceSol(fullPriceSol, discountBps = NFT_VOUCHER_DISCOUNT_BPS) {
  const full = Number(fullPriceSol) || 0;
  const bps = Math.min(10000, Math.max(0, Math.floor(Number(discountBps) || 0)));
  const payBps = 10000 - bps;
  return Math.round(full * payBps) / 10000;
}

export function readNftVoucher(inv) {
  if (!inv || typeof inv !== 'object') return null;
  const v = inv[NFT_VOUCHER_KEY];
  if (!v || typeof v !== 'object') return null;
  return v;
}

export function isNftVoucherActive(inv, now = Date.now()) {
  const v = readNftVoucher(inv);
  if (!v) return false;
  const uses = Math.floor(Number(v.uses_left) || 0);
  if (uses < 1) return false;
  if (v.expires_at) {
    const exp = new Date(String(v.expires_at)).getTime();
    if (Number.isFinite(exp) && exp <= now) return false;
  }
  const rarity = String(v.rarity || 'common').toLowerCase();
  if (rarity !== 'common') return false;
  return true;
}

export function voucherAppliesToMint(inv, kind, rarityKey) {
  if (!isNftVoucherActive(inv)) return false;
  if (String(rarityKey || '').toLowerCase() !== 'common') return false;
  const k = String(kind || '').toLowerCase();
  if (!NFT_VOUCHER_KINDS.includes(k)) return false;
  const v = readNftVoucher(inv);
  const list = Array.isArray(v.applies_to)
    ? v.applies_to.map((x) => String(x).toLowerCase())
    : NFT_VOUCHER_KINDS;
  return list.includes(k);
}

/** Display price for shop: promo if voucher applies, else full. */
export function shopMintPriceSol(inv, kind, rarityKey, fullPriceSol) {
  if (voucherAppliesToMint(inv, kind, rarityKey)) {
    const v = readNftVoucher(inv);
    return promoPriceSol(fullPriceSol, v?.discount_bps);
  }
  return Number(fullPriceSol) || 0;
}
