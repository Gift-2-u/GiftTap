// ==========================================
// AD NETWORKS — Gift Tap Free Energy
//
// WEB (browser): Monetag Direct link — Positive tag 11270717
//   Engagement gate (must leave Gift Tap for most of the timer).
//
// SEEKER (native shell): Google AdMob Rewarded via ReactNativeWebView bridge.
//   Real completion callback — energy only after reward earned.
//   NEVER fall back to Monetag inside the Seeker shell.
// ==========================================

/** UI countdown while ad is open (web Monetag; Seeker uses native ad UX). */
export const AD_MIN_WATCH_SECONDS = 15;

/**
 * Monetag "Positive tag" Direct link zone.
 * Override URL with VITE_MONETAG_DIRECT_LINK if dashboard "Get tag" differs.
 */
const MONETAG_ZONE_ID = 11270717;
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
 * Multiple signals — URL alone is not enough (SPA can drop ?seeker=1).
 */
export function isSeekerShell() {
  if (typeof window === 'undefined') return false;

  // 1) Explicit inject from native App.js (most reliable)
  try {
    if (window.__GIFT2U_SEEKER_SHELL__ === true || window.__GIFT2U_ADMOB__ === true) {
      markSeekerShell();
      return true;
    }
  } catch {
    /* ignore */
  }

  // 2) React Native WebView bridge (Expo APK)
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

  // 3) Persisted after first detection (survives SPA navigations that strip ?seeker=1)
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

  // 4) Query param from shell start URL
  try {
    const q = new URLSearchParams(window.location.search || '');
    if (q.get('seeker') === '1' || q.get('seeker') === 'true') {
      markSeekerShell();
      return true;
    }
  } catch {
    /* ignore */
  }

  // 5) Custom UA suffix from native WebView (applicationNameForUserAgent)
  try {
    const ua = String(navigator.userAgent || '');
    if (/Gift2USeeker/i.test(ua)) {
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
 *
 * IMPORTANT: do NOT pass "noopener" / "noreferrer" as window features —
 * modern browsers then always return null from window.open.
 */
const openAdTab = (url) => {
  // Hard block: never open Monetag tabs inside Seeker shell
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
 * Monetag direct link with engagement gate (WEB only).
 */
const playEngagedLink = (url, networkName, options = {}) => {
  const { onTick } = options;

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

    const win = openAdTab(url);

    const minMs = AD_MIN_WATCH_SECONDS * 1000;
    const started = Date.now();
    let settled = false;
    let leftPageMs = 0;
    let lastHiddenAt = null;
    let lastReported = AD_MIN_WATCH_SECONDS + 1;
    let pollId = null;
    let safetyId = null;

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
          onTick(ok ? 0 : Math.max(0, Math.ceil((minMs - (Date.now() - started)) / 1000)));
        } catch {
          /* ignore */
        }
      }
      if (ok) resolve({ network: networkName });
      else reject(new Error(message || `${networkName} not completed`));
    };

    const onVis = () => {
      if (document.hidden) {
        lastHiddenAt = Date.now();
      } else if (lastHiddenAt != null) {
        leftPageMs += Date.now() - lastHiddenAt;
        lastHiddenAt = null;
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

      let away = leftPageMs;
      if (document.hidden && lastHiddenAt != null) {
        away += Date.now() - lastHiddenAt;
      }

      // Must spend most of the timer off the game page (ad tab)
      if (elapsed >= minMs && away >= minMs * 0.55) {
        finish(true);
      }
    }, 400);

    safetyId = setTimeout(() => {
      if (!settled) {
        finish(
          false,
          `${networkName}: timed out. Stay on the ad tab until the countdown finishes.`,
        );
      }
    }, minMs + 20000);

    if (!win) {
      // Still allow engaged path if browser blocked popup but user can open link somehow
      console.warn(`${networkName}: popup blocked or failed to open`);
    }
  });
};

/**
 * Seeker shell: ask native AdMob rewarded unit via WebView postMessage.
 * Native injects window.__gift2uOnAdResult({ requestId, success, error? }).
 */
const playSeekerRewardedAd = (options = {}) => {
  // No game-side countdown: AdMob rewarded already shows its own timer/UI.
  // Reward is granted only via native __gift2uOnAdResult success.
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
 * - Seeker shell → native AdMob rewarded ONLY (never Monetag)
 * - Web browser → Monetag engaged direct link
 *
 * @param {{ onTick?: (secondsLeft: number) => void, ymid?: string }} [options]
 */
export const showRewardedAdWaterfall = async (options = {}) => {
  // Re-check shell every time (flags may be injected after first paint)
  if (isSeekerShell()) {
    console.log('🌊 Free Energy: Seeker path → AdMob rewarded (native) — Monetag blocked');
    try {
      const result = await playSeekerRewardedAd(options);
      return { success: true, network: result.network || 'AdMob' };
    } catch (err) {
      const lastError = err?.message || String(err);
      console.log('⚠️ Seeker AdMob failed:', lastError);
      // Do NOT fall back to Monetag on Seeker
      return { success: false, error: lastError };
    }
  }

  console.log(
    `🌊 Free Energy: Web path → Monetag zone ${MONETAG_ZONE_ID} (engaged only, single open)`,
  );

  try {
    if (options.onTick) options.onTick(AD_MIN_WATCH_SECONDS);
    const result = await playEngagedLink(
      MONETAG_DIRECT_LINK,
      'Monetag',
      options,
    );
    return { success: true, network: result.network };
  } catch (err) {
    const lastError = err?.message || String(err);
    console.log('⚠️ Monetag failed:', lastError);
    return {
      success: false,
      error: lastError,
    };
  }
};
