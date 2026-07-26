// ==========================================
// AD NETWORKS — Gift Tap rewarded energy
// Waterfall: Adsterra Smartlink → Monetag
//
// Smartlinks have NO completion callback.
// We ONLY use wall-clock time (Date.now).
// We do NOT fail on window.closed — mobile/Adsterra
// redirects make that signal unreliable and were
// blocking +100 energy even after a full wait.
// ==========================================

/** Seconds the player must wait before +100 energy. */
export const AD_MIN_WATCH_SECONDS = 15;

/** Adsterra Smartlink */
const ADSTERRA_SMARTLINK =
  'https://www.effectivecpmnetwork.com/bdacmkhj?key=7e3996662a009f6b36c14bdf3d76d8ed';

/** Monetag direct link (fallback) */
const MONETAG_DIRECT_LINK = 'https://omg10.com/4/11263036';

const isPlaceholder = (url) =>
  !url ||
  url.includes('YOUR_') ||
  url.includes('XXXX') ||
  url.trim() === '';

/**
 * Open ad tab using user gesture. Prefer window.open; fall back to <a click>
 * (better on some mobile browsers). Null handle is OK — timer still runs.
 */
const openAdTab = (url) => {
  let win = null;
  try {
    win = window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    /* ignore */
  }

  // window.open often returns null on mobile even when a tab opened,
  // or returns a handle that immediately looks "closed" after redirect.
  if (!win) {
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
  }

  return win;
};

/**
 * @param {string} url
 * @param {string} networkName
 * @param {{ onTick?: (secondsLeft: number) => void }} [options]
 * @returns {Promise<{ network: string }>}
 */
const playDirectLink = (url, networkName, options = {}) => {
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
    let lastReported = AD_MIN_WATCH_SECONDS + 1;
    let pollId = null;
    let safetyId = null;

    console.log(
      `📺 ${networkName}: opened ad`,
      win ? '(window handle)' : '(no handle — countdown still runs in Gift Tap)',
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
          /* ignore UI */
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
        console.log(
          `✅ ${networkName}: ${AD_MIN_WATCH_SECONDS}s wall-clock done — reward OK`,
        );
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

    /** Only success path checks time — never reject on win.closed */
    const checkSuccess = () => {
      if (settled) return;
      reportTick();
      if (Date.now() - started >= minMs) {
        finish(true);
      }
    };

    // When user returns to Gift Tap, re-check (mobile throttles timers in bg)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkSuccess();
      }
    };

    reportTick();
    document.addEventListener('visibilitychange', onVisibility);

    // Poll while Gift Tap is active; also works when bg timers are throttled
    // because Date.now() is wall clock and visibilitychange rechecks.
    pollId = setInterval(checkSuccess, 250);

    // Absolute safety net (never hang the UI)
    safetyId = setTimeout(() => {
      if (settled) return;
      if (Date.now() - started >= minMs) finish(true);
      else
        finish(
          false,
          'Ad timed out. Keep Gift Tap open and wait until the countdown hits 0.',
        );
    }, minMs + 30000);
  });
};

const playAdsterra = (opts) =>
  playDirectLink(ADSTERRA_SMARTLINK, 'Adsterra', opts);
const playMonetag = (opts) =>
  playDirectLink(MONETAG_DIRECT_LINK, 'Monetag', opts);

/**
 * @param {{ onTick?: (secondsLeft: number) => void }} [options]
 */
export const showRewardedAdWaterfall = async (options = {}) => {
  console.log('🌊 Ad waterfall: Adsterra → Monetag (timer-only rewards)');

  const steps = [
    { name: 'Adsterra', play: playAdsterra },
    { name: 'Monetag', play: playMonetag },
  ];

  let lastError = 'No ads currently available.';

  for (const step of steps) {
    try {
      console.log(`▶️ ${step.name}...`);
      if (options.onTick) options.onTick(AD_MIN_WATCH_SECONDS);
      await step.play(options);
      return { success: true, network: step.name };
    } catch (err) {
      lastError = err?.message || String(err);
      console.log(`⚠️ ${step.name} failed:`, lastError);
      // Always try next network (including after popup issues)
    }
  }

  return { success: false, error: lastError };
};
