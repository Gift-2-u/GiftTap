/** Player ideas → info@gift2u.fun (opens device mail when possible). */

export const IDEAS_EMAIL = 'info@gift2u.fun';

export function buildIdeasMailto({ username, playerId } = {}) {
  const subject = encodeURIComponent('Gift2U idea / suggestion');
  const hasId = !!(username || playerId);
  const body = hasId
    ? encodeURIComponent(
        `Hi Gift2U team,\n\nMy idea:\n\n\n---\nUsername: ${username || ''}\nPlayer ID: ${playerId || ''}\n`,
      )
    : '';
  return `mailto:${IDEAS_EMAIL}?subject=${subject}${body ? `&body=${body}` : ''}`;
}

/**
 * Open the user's mail app with a prefilled message.
 * - Seeker APK: postMessage → native Linking.openURL(mailto)
 * - Browser: location / <a> click simulation
 * Always returns the mailto string so UI can copy as fallback.
 */
export async function openIdeasEmail({ username, playerId } = {}) {
  const mailto = buildIdeasMailto({ username, playerId });

  // Native shell (Seeker WebView) — mailto never works as a page navigation
  try {
    const bridge = typeof window !== 'undefined' ? window.ReactNativeWebView : null;
    if (bridge && typeof bridge.postMessage === 'function') {
      bridge.postMessage(
        JSON.stringify({
          type: 'OPEN_URL',
          url: mailto,
        }),
      );
      return { ok: true, via: 'seeker', mailto };
    }
  } catch {
    /* fall through */
  }

  // Browser / in-app browser
  try {
    const a = document.createElement('a');
    a.href = mailto;
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
    return { ok: true, via: 'anchor', mailto };
  } catch {
    /* fall through */
  }

  try {
    window.location.href = mailto;
    return { ok: true, via: 'location', mailto };
  } catch {
    return { ok: false, via: 'none', mailto };
  }
}

export async function copyIdeasEmail() {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(IDEAS_EMAIL);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
