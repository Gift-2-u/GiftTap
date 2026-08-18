/**
 * Gift2u Elves — badge socket geometry (LOCKED 2026-08-17)
 *
 * Use for Fate and every future elf that has a badge socket.
 * Same corner, same proportions, opaque well (no scene bleed).
 *
 * Approved preview: socketR = original×1.45, badge fill 0.82
 * (star tips clear the rim; star blended darker to match NFT lighting).
 */

/** Fraction of art side (pre-border) → socket radius. Was 0.028; locked at ×1.45. */
export const SOCKET_R_FRAC = 0.028 * 1.45; // ≈ 0.0406

/** Distance from art bottom-right edge to socket edge (frac of art side). */
export const SOCKET_MARGIN_FRAC = 0.03;

/** Outer rarity border thickness (frac of source square side). */
export const BORDER_FRAC = 0.012;

/**
 * Equipped badge radius as a fraction of socket radius.
 * 0.82 leaves a clear gap so star tips do not touch the rim.
 */
export const BADGE_FILL_FRAC = 0.82;

/** Stroke relative to socket radius (rim thickness). */
export const SOCKET_STROKE_OF_R = 0.12;

/** Soft blend when compositing a badge into the socket (preview / equip overlay art). */
export const BADGE_BLEND = {
  brightness: -0.18,
  contrast: -0.08,
  alphaMul: 0.88,
  opacitySource: 0.92,
  fadeStartFrac: 0.72,
};

/**
 * @param {number} artSide - width/height of square art BEFORE outer rarity border
 */
export function socketMetricsFromArtSide(artSide) {
  const side = Math.max(1, Math.round(artSide));
  const socketR = Math.max(18, Math.round(side * SOCKET_R_FRAC));
  const socketMargin = Math.max(14, Math.round(side * SOCKET_MARGIN_FRAC));
  const socketStroke = Math.max(3, Math.round(socketR * SOCKET_STROKE_OF_R));
  const cx = side - socketMargin - socketR;
  const cy = side - socketMargin - socketR;
  const badgeR = Math.max(8, Math.round(socketR * BADGE_FILL_FRAC));
  return { artSide: side, socketR, socketMargin, socketStroke, cx, cy, badgeR };
}

/**
 * Metrics on a FINAL bordered card (Fate-common.jpg etc.).
 * Border width matches make-borders (side * BORDER_FRAC, min 12),
 * but when reading a finished file use measured border from geometry.
 */
export function socketMetricsFromBorderedCard(W, H) {
  const S = Math.min(W, H);
  // make-borders used border = max(12, round(side*0.012)) on pre-border art.
  // Finished card: W = artSide + 2*border. Recover artSide ≈ S - 2*borderEst.
  const borderEst = Math.max(12, Math.round((S * BORDER_FRAC) / (1 + 2 * BORDER_FRAC)));
  // Prefer the preview convention used in production previews:
  const border = Math.max(12, Math.round(S * (17 / 1442)));
  const artSide = S - border * 2;
  const m = socketMetricsFromArtSide(artSide);
  return {
    ...m,
    border,
    // center in bordered coordinates
    cx: border + m.cx,
    cy: border + m.cy,
    cardSide: S,
  };
}
