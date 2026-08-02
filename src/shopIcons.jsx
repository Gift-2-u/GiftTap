/**
 * Professional SVG icons for Gift Shop (no emoji).
 * Unique gradient ids via useId so multiple icons can render on one page.
 */
import React, { useId } from 'react';

const S = ({ children, size = 28, viewBox = '0 0 48 48' }) => (
  <svg
    width={size}
    height={size}
    viewBox={viewBox}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
    style={{ display: 'block', flexShrink: 0 }}
  >
    {children}
  </svg>
);

export function IconFrenzy({ size }) {
  const id = useId().replace(/:/g, '');
  return (
    <S size={size}>
      <path
        d="M28 4C28 4 18 14 18 24c0 5.5 4 10 10 10 2 0 4-.5 5.5-1.5C32 38 26 42 20 42 11 42 6 35 6 27 6 15 18 6 28 4z"
        fill={`url(#${id}g)`}
        stroke="#FDBA74"
        strokeWidth="1.2"
      />
      <path
        d="M30 14c0 0-5 6-5 11 0 3 2 5.5 5 5.5.8 0 1.6-.2 2.3-.6-.8 3.2-3.5 5.1-6.3 5.1-4.5 0-7.5-3.5-7.5-8 0-7 5.5-12 11.5-13z"
        fill="#FDE68A"
        opacity="0.9"
      />
      <defs>
        <linearGradient id={`${id}g`} x1="10" y1="8" x2="36" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FB923C" />
          <stop offset="1" stopColor="#DC2626" />
        </linearGradient>
      </defs>
    </S>
  );
}

export function IconBattery({ size }) {
  const id = useId().replace(/:/g, '');
  return (
    <S size={size}>
      <rect x="8" y="14" width="28" height="20" rx="3" stroke="#86EFAC" strokeWidth="2" fill={`url(#${id}g)`} />
      <rect x="36" y="19" width="4" height="10" rx="1" fill="#86EFAC" />
      <rect x="12" y="18" width="6" height="12" rx="1" fill="#4ADE80" />
      <rect x="20" y="18" width="6" height="12" rx="1" fill="#4ADE80" />
      <rect x="28" y="18" width="4" height="12" rx="1" fill="#4ADE80" opacity="0.5" />
      <defs>
        <linearGradient id={`${id}g`} x1="8" y1="14" x2="36" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#14532D" />
          <stop offset="1" stopColor="#052E16" />
        </linearGradient>
      </defs>
    </S>
  );
}

/** Heavy Hands — boxing glove (original preferred art) */
export function IconHeavy({ size }) {
  const id = useId().replace(/:/g, '');
  return (
    <S size={size}>
      {/* Glove body */}
      <path
        d="M16 20c0-5 3.5-9 8-10 4.5 1 8 5 8 10v2c2 .5 3.5 2.5 3.5 5 0 3-2 5.5-5 6.5V38c0 1.5-1.5 3-3.5 3h-6c-2 0-3.5-1.5-3.5-3v-4.5c-3-1-5-3.5-5-6.5 0-2.5 1.5-4.5 3.5-5V20z"
        fill={`url(#${id}g)`}
        stroke="#FDBA74"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* Knuckle ridges */}
      <path
        d="M19 24h3M23 23h3M27 24h3"
        stroke="#FED7AA"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.85"
      />
      {/* Wrist strap */}
      <rect x="18" y="34" width="12" height="4" rx="1" fill="#7C2D12" stroke="#FDBA74" strokeWidth="1" />
      <defs>
        <linearGradient id={`${id}g`} x1="14" y1="10" x2="36" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FB923C" />
          <stop offset="1" stopColor="#9A3412" />
        </linearGradient>
      </defs>
    </S>
  );
}

export function IconRefill({ size }) {
  const id = useId().replace(/:/g, '');
  return (
    <S size={size}>
      <path
        d="M26 6L12 26h10l-2 16 16-22H26l2-14z"
        fill={`url(#${id}g)`}
        stroke="#FDE68A"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id={`${id}g`} x1="14" y1="6" x2="36" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FDE047" />
          <stop offset="1" stopColor="#CA8A04" />
        </linearGradient>
      </defs>
    </S>
  );
}

export function IconBot({ size }) {
  const id = useId().replace(/:/g, '');
  return (
    <S size={size}>
      <rect x="12" y="16" width="24" height="20" rx="4" fill={`url(#${id}g)`} stroke="#C4B5FD" strokeWidth="1.5" />
      <circle cx="20" cy="26" r="3" fill="#67E8F9" />
      <circle cx="28" cy="26" r="3" fill="#67E8F9" />
      <rect x="18" y="32" width="12" height="2" rx="1" fill="#A78BFA" />
      <path d="M24 10v6M18 12l-3 4M30 12l3 4" stroke="#C4B5FD" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="24" cy="10" r="2" fill="#F0ABFC" />
      <defs>
        <linearGradient id={`${id}g`} x1="12" y1="16" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6D28D9" />
          <stop offset="1" stopColor="#312E81" />
        </linearGradient>
      </defs>
    </S>
  );
}

/** Daily energy cap boost — battery + raised limit bar + “2K” */
export function IconEnergy2K({ size }) {
  const id = useId().replace(/:/g, '');
  return (
    <S size={size}>
      <rect x="10" y="12" width="22" height="26" rx="3" fill={`url(#${id}g)`} stroke="#93C5FD" strokeWidth="1.5" />
      <rect x="32" y="20" width="4" height="10" rx="1" fill="#93C5FD" />
      {/* Energy fill bars */}
      <rect x="14" y="28" width="14" height="6" rx="1" fill="#4ADE80" />
      <rect x="14" y="20" width="14" height="6" rx="1" fill="#4ADE80" opacity="0.7" />
      <rect x="14" y="16" width="10" height="2" rx="0.5" fill="#86EFAC" opacity="0.5" />
      {/* Cap raise arrow */}
      <path d="M38 30V16M38 16l-3 3M38 16l3 3" stroke="#FDE68A" strokeWidth="1.6" strokeLinecap="round" />
      <text x="21" y="11" textAnchor="middle" fill="#FDE68A" fontSize="7" fontWeight="800" fontFamily="system-ui,sans-serif">
        +2K
      </text>
      <defs>
        <linearGradient id={`${id}g`} x1="10" y1="12" x2="32" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1D4ED8" />
          <stop offset="1" stopColor="#0F172A" />
        </linearGradient>
      </defs>
    </S>
  );
}

/** Daily energy cap boost — larger battery + “5K” */
export function IconEnergy5K({ size }) {
  const id = useId().replace(/:/g, '');
  return (
    <S size={size}>
      <rect x="8" y="10" width="24" height="28" rx="3" fill={`url(#${id}g)`} stroke="#7DD3FC" strokeWidth="1.5" />
      <rect x="32" y="18" width="5" height="12" rx="1" fill="#7DD3FC" />
      <rect x="12" y="30" width="16" height="5" rx="1" fill="#22D3EE" />
      <rect x="12" y="23" width="16" height="5" rx="1" fill="#22D3EE" opacity="0.85" />
      <rect x="12" y="16" width="16" height="5" rx="1" fill="#67E8F9" opacity="0.65" />
      <path d="M40 32V12M40 12l-3.5 3.5M40 12l3.5 3.5" stroke="#FDE68A" strokeWidth="1.7" strokeLinecap="round" />
      <text x="20" y="9" textAnchor="middle" fill="#FDE68A" fontSize="7.5" fontWeight="800" fontFamily="system-ui,sans-serif">
        +5K
      </text>
      <defs>
        <linearGradient id={`${id}g`} x1="8" y1="10" x2="34" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0891B2" />
          <stop offset="1" stopColor="#0C4A6E" />
        </linearGradient>
      </defs>
    </S>
  );
}

export function IconGem({ size }) {
  const id = useId().replace(/:/g, '');
  return (
    <S size={size}>
      <path d="M24 6l10 10-10 26L14 16 24 6z" fill={`url(#${id}g)`} stroke="#FDE68A" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M14 16h20L24 6 14 16z" fill="#FDE68A" opacity="0.35" />
      <path d="M18 18l6 20 6-20" stroke="#FEF3C7" strokeWidth="1" opacity="0.5" />
      <defs>
        <linearGradient id={`${id}g`} x1="14" y1="6" x2="34" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FBBF24" />
          <stop offset="0.5" stopColor="#F59E0B" />
          <stop offset="1" stopColor="#92400E" />
        </linearGradient>
      </defs>
    </S>
  );
}

export function IconX2({ size }) {
  const id = useId().replace(/:/g, '');
  return (
    <S size={size}>
      <circle cx="24" cy="24" r="16" fill={`url(#${id}g)`} stroke="#FDA4AF" strokeWidth="1.5" />
      <text
        x="24"
        y="29"
        textAnchor="middle"
        fill="#FFF1F2"
        fontSize="14"
        fontWeight="800"
        fontFamily="system-ui,sans-serif"
      >
        2×
      </text>
      <defs>
        <linearGradient id={`${id}g`} x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F43F5E" />
          <stop offset="1" stopColor="#9F1239" />
        </linearGradient>
      </defs>
    </S>
  );
}

export function IconX3({ size }) {
  const id = useId().replace(/:/g, '');
  return (
    <S size={size}>
      <circle cx="24" cy="24" r="16" fill={`url(#${id}g)`} stroke="#E9D5FF" strokeWidth="1.5" />
      <text
        x="24"
        y="29"
        textAnchor="middle"
        fill="#FAF5FF"
        fontSize="14"
        fontWeight="800"
        fontFamily="system-ui,sans-serif"
      >
        3×
      </text>
      <path d="M32 12l2 3 3-1-1 3 2 2-3 1-1 3-2-3-3 1 1-3-2-2 3-1 1-3z" fill="#FDE68A" opacity="0.9" />
      <defs>
        <linearGradient id={`${id}g`} x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A855F7" />
          <stop offset="1" stopColor="#5B21B6" />
        </linearGradient>
      </defs>
    </S>
  );
}

const BY_ID = {
  frenzy: IconFrenzy,
  battery: IconBattery,
  heavy: IconHeavy,
  refill: IconRefill,
  bot: IconBot,
  grinder: IconEnergy2K,
  whale: IconEnergy5K,
  crate: IconGem,
  x2_boost: IconX2,
  x3_boost: IconX3,
};

export function ShopGlyph({ itemId, size = 28 }) {
  const Comp = BY_ID[itemId];
  if (!Comp) {
    return (
      <S size={size}>
        <circle cx="24" cy="24" r="14" fill="#334155" stroke="#94A3B8" strokeWidth="1.5" />
        <path d="M24 16v12M18 22h12" stroke="#E2E8F0" strokeWidth="2" strokeLinecap="round" />
      </S>
    );
  }
  return <Comp size={size} />;
}
