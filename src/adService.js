// ==========================================
// AD NETWORKS — Gift Tap Free Energy
//
// WEB (browser): Monetag Direct link — Positive tag 11270717
//   Engagement gate (must leave Gift Tap for most of the timer).
//
// SEEKER (native shell): Google AdMob Rewarded via ReactNativeWebView bridge.
//   Real completion callback — energy only after reward earned.
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

/**
 * True when running inside the Gift2U Seeker / Android WebView shell.
 * Shell loads play URL with ?seeker=1 and injects ReactNativeWebView.
 */
export function isSeekerShell() {
  if (typeof window === 'undefined') return false;
  // Expo / native Gift2U APK WebView always has this bridge
  try {
    if (
      window.ReactNativeWebView &&
      typeof window.ReactNativeWebView.postMessage === 'function'
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    const q = new URLSearchParams(window.location.search || '');
    if (q.get('seeker') === '1' || q.get('seeker') === 'true') return true;
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

    const MIN_HIDDEN_MS = Math.floor(minMs * 0.6);

    console.log(
      `📺 ${networkName}: opened ad`,
      win ? '(window handle)' : '(no handle — wait for you to open/switch to the ad tab)',
      url,
    );

    const reportTick = () => {
      if (!onTick) return;
      const elapsed = Date.now() - started;
      const left = Math.max(0, Math.ceil((minMs - elapsed) / 1000));
      if (left !== lastReported) {
        lastReported = left;
        try {
          onTick(left);
        } catch {
          /* ignore */
        }
      }
    };

    const cleanup = () => {
      if (pollId != null) clearInterval(pollId);
      if (safetyId != null) clearTimeout(safetyId);
      try {
        document.removeEventListener('visibilitychange', onVisibility);
      } catch {
        /* ignore */
      }
    };

    const finish = (ok, message) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (onTick) {
        try {
          onTick(ok ? 0 : lastReported);
        } catch {
          /* ignore */
        }
      }
      if (ok) {
        console.log(`✅ ${networkName}: engaged watch complete`);
        try {
          if (win && !win.closed) win.close();
        } catch {
          /* ignore */
        }
        resolve({ network: networkName });
      } else {
        console.warn(`⚠️ ${networkName}: ${message}`);
        reject(new Error(message || 'Ad failed'));
      }
    };

    const accumulateHidden = () => {
      if (lastHiddenAt != null) {
        leftPageMs += Date.now() - lastHiddenAt;
        lastHiddenAt = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenAt = Date.now();
      } else if (document.visibilityState === 'visible') {
        accumulateHidden();
        checkDone();
      }
    };

    const checkDone = () => {
      if (settled) return;
      reportTick();
      const elapsed = Date.now() - started;

      if (win) {
        try {
          if (win.closed && leftPageMs < 2000 && elapsed < 5000) {
            finish(
              false,
              `${networkName}: ad closed or blocked before it could load.`,
            );
            return;
          }
        } catch {
          /* cross-origin after redirect */
        }
      }

      if (elapsed >= minMs) {
        const hiddenTotal =
          leftPageMs + (lastHiddenAt != null ? Date.now() - lastHiddenAt : 0);
        if (hiddenTotal >= MIN_HIDDEN_MS) {
          finish(true);
        } else {
          finish(
            false,
            `${networkName}: switch to the ad tab and stay there until the timer ends. If no tab opened, allow popups for this site and try again.`,
          );
        }
      }
    };

    reportTick();
    document.addEventListener('visibilitychange', onVisibility);
    if (document.visibilityState === 'hidden') lastHiddenAt = Date.now();

    pollId = setInterval(checkDone, 250);
    safetyId = setTimeout(() => {
      if (settled) return;
      accumulateHidden();
      checkDone();
      if (!settled) {
        finish(
          false,
          `${networkName}: timed out. Stay on the ad tab until the countdown finishes.`,
        );
      }
    }, minMs + 20000);
  });
};

/**
 * Seeker shell: ask native AdMob rewarded unit via WebView postMessage.
 * Native injects window.__gift2uOnAdResult({ requestId, success, error? }).
 */
const playSeekerRewardedAd = (options = {}) => {
  const { onTick } = options;

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Ads only work in the app'));
      return;
    }

    const bridge = window.ReactNativeWebView;
    if (!bridge || typeof bridge.postMessage !== 'function') {
      reject(
        new Error(
          'Seeker ad bridge missing. Update the Gift2U Seeker app, or open gift2u.fun in a browser for Monetag ads.',
        ),
      );
      return;
    }

    const requestId = `ad_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    let settled = false;
    let tickId = null;
    let safetyId = null;
    const started = Date.now();
    // Soft UI countdown while native ad loads/plays (not used as reward gate)
    const softSeconds = 30;

    const cleanup = () => {
      if (tickId != null) clearInterval(tickId);
      if (safetyId != null) clearTimeout(safetyId);
      try {
        if (window.__gift2uOnAdResult_req === requestId) {
          delete window.__gift2uOnAdResult;
          delete window.__gift2uOnAdResult_req;
        }
      } catch {
        /* ignore */
      }
    };

    const finish = (ok, message, network = 'AdMob') => {
      if (settled) return;
      settled = true;
      cleanup();
      if (onTick) {
        try {
          onTick(ok ? 0 : Math.max(0, softSeconds - Math.floor((Date.now() - started) / 1000)));
        } catch {
          /* ignore */
        }
      }
      if (ok) {
        console.log('✅ Seeker AdMob: reward earned');
        resolve({ network });
      } else {
        console.warn('⚠️ Seeker AdMob:', message);
        reject(new Error(message || 'Ad not completed'));
      }
    };

    window.__gift2uOnAdResult_req = requestId;
    window.__gift2uOnAdResult = (payload) => {
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

    if (onTick) {
      try {
        onTick(softSeconds);
      } catch {
        /* ignore */
      }
      tickId = setInterval(() => {
        if (settled) return;
        const left = Math.max(0, softSeconds - Math.floor((Date.now() - started) / 1000));
        try {
          onTick(left);
        } catch {
          /* ignore */
        }
      }, 500);
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
 * - Seeker shell → native AdMob rewarded (completion callback)
 * - Web browser → Monetag engaged direct link
 *
 * @param {{ onTick?: (secondsLeft: number) => void, ymid?: string }} [options]
 */
export const showRewardedAdWaterfall = async (options = {}) => {
  if (isSeekerShell()) {
    console.log('🌊 Free Energy: Seeker path → AdMob rewarded (native)');
    try {
      if (options.onTick) options.onTick(30);
      const result = await playSeekerRewardedAd(options);
      return { success: true, network: result.network || 'AdMob' };
    } catch (err) {
      const lastError = err?.message || String(err);
      console.log('⚠️ Seeker AdMob failed:', lastError);
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
