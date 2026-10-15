/**
 * Official Gift2U socials — Menu + Tasks surprise gift.
 * Plain <a href>. In the Gift Tap APK only, open outside the WebView
 * (X/Telegram break when loaded inside the game browser).
 */

export const SOCIAL_SURPRISE_EVENT = null;

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
      'https://discord.gg/n7e9qF3Jd',
    icon: '/icons/social/discord.svg',
    color: '#5865F2',
  },
];

/** APK only: open in system browser / app. Phone Chrome uses the normal href. */
export function onSocialClick(e, href) {
  const url = String(href || '').trim();
  if (!url) return;
  try {
    if (window.ReactNativeWebView?.postMessage) {
      e.preventDefault();
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: 'OPEN_URL', url }),
      );
    }
  } catch {
    /* keep default <a href> */
  }
}
