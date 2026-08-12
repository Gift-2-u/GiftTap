/**
 * Official Gift2U / Gift Tap socials — single source for game menu + main site.
 * Discord: set VITE_DISCORD_URL in .env if the invite differs.
 */
export const SOCIAL_LINKS = [
  {
    id: 'x',
    label: 'X',
    href: 'https://x.com/Gift2udev',
    glyph: '𝕏',
    color: '#e7e9ea',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    href: 'https://t.me/Gift2u_GiftTap_official',
    glyph: '✈️',
    color: '#2AABEE',
  },
  {
    id: 'discord',
    label: 'Discord',
    href:
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DISCORD_URL) ||
      'https://discord.gg/d8aEvFbHW',
    glyph: '💬',
    color: '#5865F2',
  },
];

export function openSocial(href) {
  if (!href) return;
  window.open(href, '_blank', 'noopener,noreferrer');
}
