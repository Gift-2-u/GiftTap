// ==========================================
// AD NETWORKS — Gift Tap Free Energy
//
// WEB (browser): Monetag Rewarded Interstitial via monetag-tg-sdk.
//   Their ad UI owns the watch timer. We only grant after the SDK Promise
//   resolves with a valued (paid) event — not our own page-visibility clock.
//
// SEEKER (native shell): Google AdMob Rewarded via ReactNativeWebView bridge.
//   Real completion callback — energy only after reward earned.
//   NEVER fall back to Monetag inside the Seeker shell.
// ==========================================

import createAdHandler from 'monetag-tg-sdk';

/**
 * Kept for UI fallbacks only — Monetag SDK owns the real watch timer now.
 * @deprecated web path no longer uses a local countdown for rewards
 */
export const AD_MIN_WATCH_SECONDS = 15;

/**
 * Monetag Rewarded Interstitial main zone ID (dashboard → SDK / Rewarded).
 * Override with VITE_MONETAG_ZONE_ID if the Rewarded zone differs from Direct Link.
 */
const MONETAG_ZONE_ID = Number(
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_MONETAG_ZONE_ID) ||
    11270717,
);

const SEEKER_STORAGE_KEY = 'gift2u_seeker';

let monetagHandler = null;

function getMonetagHandler() {
  if (monetagHandler) return monetagHandler;
  if (!Number.isFinite(MONETAG_ZONE_ID) || MONETAG_ZONE_ID <= 0) {
    throw new Error('Monetag zone not configured');
  }
  monetagHandler = createAdHandler(MONETAG_ZONE_ID);
  return monetagHandler;
}

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
 * If this is false, Free Energy uses Monetag SDK — that must never happen in the APK.
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
 * Web: Monetag Rewarded Interstitial (SDK).
 * type:'end' → Promise resolves after their ad is shown AND closed.
 * Only treat as success when reward_event_type is valued (paid), when present.
 */
const playMonetagSdkRewarded = (options = {}) => {
  const { ymid } = options;

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Ads only work in the browser'));
      return;
    }
    if (isSeekerShell()) {
      reject(new Error('Monetag is disabled on Seeker — use AdMob'));
      return;
    }

    let show;
    try {
      show = getMonetagHandler();
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }

    const opts = {
      type: 'end',
      catchIfNoFeed: true,
      requestVar: 'free_energy',
    };
    if (ymid) opts.ymid = String(ymid);

    console.log(`📺 Monetag SDK: show zone ${MONETAG_ZONE_ID} (rewarded end)`);

    Promise.resolve()
      .then(() => show(opts))
      .then((result) => {
        const eventType =
          result && typeof result === 'object'
            ? String(result.reward_event_type || '').toLowerCase()
            : '';

        // Prefer valued (Monetag paid). If field missing, still accept completed show
        // (some zone configs omit reward_event_type on frontend callback).
        if (eventType === 'non_valued') {
          reject(
            new Error(
              'Ad shown but not monetized (blocked / unpaid). Free Energy was not granted.',
            ),
          );
          return;
        }
        if (eventType && eventType !== 'valued') {
          reject(new Error(`Ad not rewarded (${eventType}). Free Energy was not granted.`));
          return;
        }

        console.log('✅ Monetag SDK: rewarded complete', result || {});
        resolve({
          network: 'Monetag',
          reward_event_type: eventType || 'valued',
          estimated_price:
            result && typeof result === 'object' ? result.estimated_price : undefined,
        });
      })
      .catch((err) => {
        const msg =
          err?.message ||
          (typeof err === 'string' ? err : 'Monetag ad did not complete');
        console.warn('⚠️ Monetag SDK:', msg);
        reject(new Error(msg));
      });
  });
};

/**
 * Seeker shell: ask native AdMob rewarded unit via WebView postMessage.
 * Native injects window.__gift2uOnAdResult({ requestId, success, error? }).
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
 * - Seeker shell → native AdMob rewarded ONLY (never Monetag)
 * - Web browser → Monetag Rewarded SDK (their timer + completion callback)
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
    `🌊 Free Energy: Web path → Monetag Rewarded SDK zone ${MONETAG_ZONE_ID}`,
  );

  try {
    const result = await playMonetagSdkRewarded({ ymid: options.ymid });
    return {
      success: true,
      network: result.network || 'Monetag',
      reward_event_type: result.reward_event_type,
      estimated_price: result.estimated_price,
    };
  } catch (err) {
    const lastError = err?.message || String(err);
    console.log('⚠️ Monetag failed:', lastError);
    return {
      success: false,
      error: lastError,
    };
  }
};
