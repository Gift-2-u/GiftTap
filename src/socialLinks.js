/**
 * Official Gift2U socials — Menu + Tasks.
 * Plain hrefs only: X → x.com, Telegram → t.me, Discord → discord.gg
 */

export const SOCIAL_SURPRISE_EVENT = null;

export const SOCIAL_LINKS = [
  {
    id: 'x',
    label: 'X',
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
      'https://discord.gg/n7e9qF3Jd',
    icon: '/icons/social/discord.svg',
    color: '#5865F2',
  },
];
