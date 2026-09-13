// ==========================================
// AD NETWORKS — Gift Tap Free Energy
//
// WEB (browser): Monetag Direct Link (Positive tag).
//   Monetag does not offer Rewarded SDK for normal websites — only Telegram Mini Apps.
//   We use an engagement gate: ad tab must stay open; player must spend most of the
//   timer off Gift Tap. Not as clean as AdMob, but it's what Monetag supports on web.
//
// SEEKER (native shell): Google AdMob Rewarded via ReactNativeWebView bridge.
//   Real completion callback — energy only after reward earned.
//   NEVER fall back to Monetag inside the Seeker shell.
// ==========================================

/** UI countdown while Monetag Direct Link engagement runs (web only). */
export const AD_MIN_WATCH_SECONDS = 20;
/** Must spend this fraction of the timer on the ad tab (off Gift Tap). */
const MONETAG_AWAY_RATIO = 0.85;

/**
 * Monetag Direct Link / Positive tag zone.
 * Override URL with VITE_MONETAG_DIRECT_LINK if dashboard "Get tag" differs.
 */
const MONETAG_ZONE_ID = Number(
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_MONETAG_ZONE_ID) ||
    11270717,
);
const MONETAG_DIRECT_LINK =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_MONETAG_DIRECT_LINK) ||
  `https://omg10.com/4/${MONETAG_ZONE_ID}`;

const isPlaceholder = (url) =>
  !url ||
  url.includes('YOUR_') ||
  url.includes('XXXX') ||
  url.trim() === '';

const SEEKER_STORAGE_KEY = 'gift2u_seeker';

function markSeekerShell() {
  try {
    window.__GIFT2U_SEEKER_SHELL__ = true;
    window.__GIFT2U_ADMOB__ = true;
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.setItem(SEEKER_STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(SEEKER_STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
}

/**
 * True when running inside the Gift2U Seeker / Android WebView shell.
 * If this is false, Free Energy opens Monetag — that must never happen in the APK.
 */
export function isSeekerShell() {
  if (typeof window === 'undefined') return false;

  try {
    if (window.__GIFT2U_SEEKER_SHELL__ === true || window.__GIFT2U_ADMOB__ === true) {
      markSeekerShell();
      return true;
    }
  } catch {
    /* ignore */
  }

  try {
    if (
      window.ReactNativeWebView &&
      typeof window.ReactNativeWebView.postMessage === 'function'
    ) {
      markSeekerShell();
      return true;
    }
  } catch {
    /* ignore */
  }

  try {
    if (
      sessionStorage.getItem(SEEKER_STORAGE_KEY) === '1' ||
      localStorage.getItem(SEEKER_STORAGE_KEY) === '1'
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }

  try {
    const q = new URLSearchParams(window.location.search || '');
    if (q.get('seeker') === '1' || q.get('seeker') === 'true') {
      markSeekerShell();
      return true;
    }
  } catch {
    /* ignore */
  }

  try {
    const ua = String(navigator.userAgent || '');
    if (/Gift2USeeker/i.test(ua)) {
      markSeekerShell();
      return true;
    }
    if (
      /;\s*wv\)/i.test(ua) &&
      /gift2u\.fun/i.test(String(window.location.hostname || ''))
    ) {
      markSeekerShell();
      return true;
    }
  } catch {
    /* ignore */
  }

  return false;
}

/**
 * Open ad in a new tab during the user gesture (web only).
 * Do NOT pass "noopener" as window features — browsers then return null from window.open.
 */
const openAdTab = (url) => {
  if (isSeekerShell()) {
    console.warn('[Gift2U] Blocked Monetag tab open inside Seeker shell');
    return null;
  }

  let win = null;
  try {
    win = window.open(url, '_blank');
  } catch {
    /* ignore */
  }

  if (win) {
    try {
      win.opener = null;
    } catch {
      /* ignore */
    }
    return win;
  }

  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    /* ignore */
  }

  return null;
};

/**
 * Monetag Direct Link + engagement gate (WEB only).
 * Requires: real popup, long off-page time, no early close, return to Gift Tap.
 */
const playEngagedLink = (url, networkName, options = {}) => {
  const { onTick, ymid } = options;

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Ads only work in the browser'));
      return;
    }
    if (isSeekerShell()) {
      reject(new Error('Monetag is disabled on Seeker — use AdMob'));
      return;
    }
    if (isPlaceholder(url)) {
      reject(new Error(`${networkName} not configured`));
      return;
    }

    let finalUrl = url;
    if (ymid) {
      try {
        const u = new URL(url);
        u.searchParams.set('ymid', String(ymid));
        finalUrl = u.toString();
      } catch {
        finalUrl = `${url}${url.includes('?') ? '&' : '?'}ymid=${encodeURIComponent(String(ymid))}`;
      }
    }

    const win = openAdTab(finalUrl);
    if (!win) {
      reject(
        new Error(
          `${networkName}: popup blocked. Allow popups for gift2u.fun, then try Free Energy again.`,
        ),
      );
      return;
    }

    const minMs = AD_MIN_WATCH_SECONDS * 1000;
    const needAwayMs = Math.floor(minMs * MONETAG_AWAY_RATIO);
    const started = Date.now();
    let settled = false;
    let leftPageMs = 0;
    let lastHiddenAt = null;
    let lastReported = AD_MIN_WATCH_SECONDS + 1;
    let pollId = null;
    let safetyId = null;
    let awayMet = false;

    const cleanup = () => {
      if (pollId != null) clearInterval(pollId);
      if (safetyId != null) clearTimeout(safetyId);
      document.removeEventListener('visibilitychange', onVis);
    };

    const finish = (ok, message) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (onTick) {
        try {
          onTick(
            ok ? 0 : Math.max(0, Math.ceil((minMs - (Date.now() - started)) / 1000)),
          );
        } catch {
          /* ignore */
        }
      }
      if (ok) resolve({ network: networkName });
      else reject(new Error(message || `${networkName} not completed`));
    };

    const awayNow = () => {
      let away = leftPageMs;
      if (document.hidden && lastHiddenAt != null) {
        away += Date.now() - lastHiddenAt;
      }
      return away;
    };

    const onVis = () => {
      if (document.hidden) {
        lastHiddenAt = Date.now();
        return;
      }
      if (lastHiddenAt != null) {
        leftPageMs += Date.now() - lastHiddenAt;
        lastHiddenAt = null;
      }
      if (awayMet && Date.now() - started >= minMs && awayNow() >= needAwayMs) {
        try {
          if (win && !win.closed) win.close();
        } catch {
          /* ignore */
        }
        finish(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    if (document.hidden) lastHiddenAt = Date.now();

    pollId = setInterval(() => {
      if (settled) return;
      const elapsed = Date.now() - started;
      const left = Math.max(0, Math.ceil((minMs - elapsed) / 1000));
      if (onTick && left !== lastReported) {
        lastReported = left;
        try {
          onTick(left);
        } catch {
          /* ignore */
        }
      }

      try {
        if (win.closed) {
          finish(
            false,
            `${networkName}: ad tab closed early. Stay on the ad until the timer finishes.`,
          );
          return;
        }
      } catch {
        /* ignore */
      }

      const away = awayNow();
      if (elapsed >= minMs && away >= needAwayMs) {
        awayMet = true;
        if (!document.hidden) {
          try {
            if (win && !win.closed) win.close();
          } catch {
            /* ignore */
          }
          finish(true);
        }
      }
    }, 400);

    safetyId = setTimeout(() => {
      if (!settled) {
        finish(
          false,
          `${networkName}: timed out. Stay on the ad tab until the countdown finishes, then return here.`,
        );
      }
    }, minMs + 25000);
  });
};

/**
 * Seeker shell: native AdMob rewarded via WebView postMessage.
 */
const playSeekerRewardedAd = () => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Ads only work in the app'));
      return;
    }

    const bridge = window.ReactNativeWebView;
    if (!bridge || typeof bridge.postMessage !== 'function') {
      reject(
        new Error(
          'Seeker AdMob bridge missing. Update/reinstall Gift2U from the Solana Mobile store (native shell required — not Chrome).',
        ),
      );
      return;
    }

    const requestId = `ad_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    let settled = false;
    let safetyId = null;

    const cleanup = () => {
      if (safetyId != null) clearTimeout(safetyId);
      try {
        if (window.__gift2uOnAdResult_req === requestId) {
          delete window.__gift2uOnAdResult;
          delete window.__gift2uOnAdResult_req;
        }
      } catch {
        /* ignore */
      }
      try {
        window.removeEventListener('gift2u-ad-result', onEvent);
      } catch {
        /* ignore */
      }
    };

    const finish = (ok, message, network = 'AdMob') => {
      if (settled) return;
      settled = true;
      cleanup();
      if (ok) {
        console.log('✅ Seeker AdMob: reward earned');
        resolve({ network });
      } else {
        console.warn('⚠️ Seeker AdMob:', message);
        reject(new Error(message || 'Ad not completed'));
      }
    };

    const handlePayload = (payload) => {
      try {
        const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
        if (!data || data.requestId !== requestId) return;
        if (data.success) {
          finish(true, null, data.network || 'AdMob');
        } else {
          finish(false, data.error || 'Ad not completed');
        }
      } catch (e) {
        finish(false, e?.message || 'Bad ad result');
      }
    };

    const onEvent = (ev) => {
      handlePayload(ev?.detail);
    };

    window.__gift2uOnAdResult_req = requestId;
    window.__gift2uOnAdResult = handlePayload;
    try {
      window.addEventListener('gift2u-ad-result', onEvent);
    } catch {
      /* ignore */
    }

    safetyId = setTimeout(() => {
      finish(false, 'Ad timed out. Close and try Free Energy again.');
    }, 180000);

    try {
      bridge.postMessage(
        JSON.stringify({
          type: 'WATCH_REWARDED_AD',
          requestId,
        }),
      );
      console.log('📺 Seeker: requested native rewarded ad', requestId);
    } catch (e) {
      finish(false, e?.message || 'Could not start Seeker ad');
    }
  });
};

/**
 * Free Energy waterfall:
 * - Seeker → AdMob rewarded ONLY
 * - Web → Monetag Direct Link + engagement gate
 *
 * @param {{ onTick?: (secondsLeft: number) => void, ymid?: string }} [options]
 */
export const showRewardedAdWaterfall = async (options = {}) => {
  let forceNative = false;
  try {
    forceNative =
      !!(window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') ||
      isSeekerShell();
  } catch {
    forceNative = isSeekerShell();
  }

  if (forceNative) {
    markSeekerShell();
    console.log('🌊 Free Energy: Seeker path → AdMob rewarded (native) — Monetag blocked');
    try {
      const result = await playSeekerRewardedAd();
      return { success: true, network: result.network || 'AdMob' };
    } catch (err) {
      const lastError = err?.message || String(err);
      console.log('⚠️ Seeker AdMob failed:', lastError);
      return { success: false, error: lastError };
    }
  }

  console.log(
    `🌊 Free Energy: Web path → Monetag Direct Link zone ${MONETAG_ZONE_ID} (engaged)`,
  );

  try {
    if (options.onTick) options.onTick(AD_MIN_WATCH_SECONDS);
    const result = await playEngagedLink(MONETAG_DIRECT_LINK, 'Monetag', {
      onTick: options.onTick,
      ymid: options.ymid,
    });
    return { success: true, network: result.network };
  } catch (err) {
    const lastError = err?.message || String(err);
    console.log('⚠️ Monetag failed:', lastError);
    return { success: false, error: lastError };
  }
};
