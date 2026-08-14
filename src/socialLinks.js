/**
 * Official Gift2U / Gift Tap socials — single source for game menu + main site.
 * Use real brand logos from /icons/social (not emoji + text labels in chrome).
 * Discord: set VITE_DISCORD_URL in .env if the invite differs.
 */
export const SOCIAL_LINKS = [
  {
    id: 'x',
    label: 'X (Twitter)',
    href: 'https://x.com/Gift2udev',
    icon: '/icons/social/x.svg',
    color: '#e7e9ea',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    href: 'https://t.me/Gift2u_GiftTap_official',
    icon: '/icons/social/telegram.svg',
    color: '#2AABEE',
  },
  {
    id: 'discord',
    label: 'Discord',
    href:
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DISCORD_URL) ||
      'https://discord.gg/d8aEvFbHW',
    icon: '/icons/social/discord.svg',
    color: '#5865F2',
  },
];

export function openSocial(href) {
  if (!href) return;
  window.open(href, '_blank', 'noopener,noreferrer');
}
