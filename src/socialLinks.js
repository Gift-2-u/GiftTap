/**
 * Official Gift2U / Gift Tap socials — single source for game menu + main site.
 * Use real brand logos from /icons/social (not emoji + text labels in chrome).
 * Discord: set VITE_DISCORD_URL in .env if the invite differs.
 */

/**
 * Optional timed surprise window for the Tasks social banner.
 * Leave null for default: “check them every day.”
 *
 * Example (uncomment / set when you run a drop):
 *   {
 *     startUtc: '2026-08-26T14:00:00Z',
 *     endUtc: '2026-08-26T18:00:00Z',
 *     liveMessage: 'Reward live — go check socials!',
 *     soonMessage: 'Surprise drop soon — get ready on socials.',
 *   }
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
 * Open an external social URL.
 * Seeker / Android WebView blocks window.open + target=_blank — use OPEN_URL bridge
 * (same as mailto in contactIdeas.js → native Linking.openURL).
 */
export function openSocial(href) {
  const url = String(href || '').trim();
  if (!url) return false;

  // Native Gift2U / Seeker shell
  try {
    const bridge =
      typeof window !== 'undefined' ? window.ReactNativeWebView : null;
    if (bridge && typeof bridge.postMessage === 'function') {
      bridge.postMessage(JSON.stringify({ type: 'OPEN_URL', url }));
      return true;
    }
  } catch {
    /* fall through */
  }

  // Telegram Mini App (if ever embedded)
  try {
    if (window.Telegram?.WebApp?.openLink) {
      window.Telegram.WebApp.openLink(url);
      return true;
    }
  } catch {
    /* fall through */
  }

  // Browser: try window.open, then <a> click
  try {
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (win) return true;
  } catch {
    /* fall through */
  }

  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
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
    window.location.assign(url);
    return true;
  } catch {
    return false;
  }
}
