/**
 * Official Gift2U / Gift Tap socials — single source for Menu + Tasks surprise gift.
 * Discord: set VITE_DISCORD_URL in .env if the invite differs.
 */

/**
 * Optional timed surprise window for the Tasks social banner.
 * Leave null for default: “check them every day.”
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
      'https://discord.gg/d8aEvFbHW',
    icon: '/icons/social/discord.svg',
    color: '#5865F2',
  },
];

/**
 * Open X / Telegram / Discord.
 * APK WebView blocks window.open and target=_blank.
 * Never return after only postMessage — that made buttons do nothing.
 */
export function openSocial(href) {
  const url = String(href || '').trim();
  if (!url) return false;

  const hasBridge =
    typeof window !== 'undefined' &&
    window.ReactNativeWebView &&
    typeof window.ReactNativeWebView.postMessage === 'function';

  // Ask native shell (does not guarantee open — always continue below)
  if (hasBridge) {
    try {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: 'OPEN_URL', url }),
      );
    } catch {
      /* continue */
    }
  }

  // Real click navigation (restores “button does something”)
  // In APK: no target=_blank — same-window load; shell can open OS browser.
  // In browser: new tab.
  try {
    const a = document.createElement('a');
    a.href = url;
    if (!hasBridge) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
      } catch {
        /* ignore */
      }
    }, 0);
    return true;
  } catch {
    /* fall through */
  }

  try {
    if (hasBridge) {
      window.location.assign(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    return true;
  } catch {
    return false;
  }
}
