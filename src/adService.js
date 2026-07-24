// ==========================================
// AD NETWORKS — Gift Tap rewarded energy
// Waterfall: Adsterra Smartlink → Monetag (optional)
//
// Smartlinks have no completion callback. We use WALL-CLOCK time
// (Date.now), not "how many times setInterval ran in background".
// Reward when AD_MIN_WATCH_SECONDS have passed since open.
// Early-close fail only if we saw the tab open, then it closed early.
// ==========================================

/** Seconds the ad experience must run before reward. */
export const AD_MIN_WATCH_SECONDS = 15;

/** Adsterra Smartlink (primary) */
const ADSTERRA_SMARTLINK =
  'https://www.effectivecpmnetwork.com/bdacmkhj?key=7e3996662a009f6b36c14bdf3d76d8ed';

/** Monetag direct link (fallback only) */
const MONETAG_DIRECT_LINK = 'https://omg10.com/4/11263036';

const isPlaceholder = (url) =>
  !url ||
  url.includes('YOUR_') ||
  url.includes('XXXX') ||
  url.trim() === '';

/**
 * @param {string} url
 * @param {string} networkName
 * @param {{ onTick?: (secondsLeft: number) => void }} [options]
 */
const playDirectLink = (url, networkName, options = {}) => {
  const { onTick } = options;

  return new Promise((resolve, reject) => {
    if (isPlaceholder(url)) {
      reject(new Error(`${networkName} not configured`));
      return;
    }

    let win = null;
    try {
      win = window.open(url, '_blank');
    } catch (e) {
      reject(e);
      return;
    }

    // Mobile often returns null if popup blocked
    if (!win) {
      reject(
        new Error(
          'Popup blocked. Allow popups for this site, then try again.',
        ),
      );
      return;
    }

    const minMs = AD_MIN_WATCH_SECONDS * 1000;
    const started = Date.now();
    let settled = false;
    /** True only after we observe closed === false at least once (real window). */
    let sawWindowOpen = false;
    let lastReported = AD_MIN_WATCH_SECONDS + 1;

    const reportTick = () => {
      if (!onTick) return;
      const elapsed = Date.now() - started;
      const left = Math.max(0, Math.ceil((minMs - elapsed) / 1000));
      if (left !== lastReported) {
        lastReported = left;
        try {
          onTick(left);
        } catch {
          /* ignore UI errors */
        }
      }
    };

    const finish = (ok, message) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      if (onTick) {
        try {
          onTick(ok ? 0 : lastReported);
        } catch {
          /* ignore */
        }
      }
      if (ok) {
        console.log(`✅ ${networkName}: ${AD_MIN_WATCH_SECONDS}s elapsed — reward OK`);
        try {
          if (win && !win.closed) win.close();
        } catch {
          /* ignore */
        }
        resolve({ network: networkName });
      } else {
        console.warn(`⚠️ ${networkName}: ${message}`);
        reject(new Error(message));
      }
    };

    reportTick();

    // Single poll: wall-clock success + careful early-close detection
    const poll = setInterval(() => {
      const elapsed = Date.now() - started;
      reportTick();

      // SUCCESS: enough real time has passed (works even if tab was backgrounded)
      if (elapsed >= minMs) {
        finish(true);
        return;
      }

      let closed = false;
      try {
        closed = !!win.closed;
      } catch {
        // Cross-origin access edge cases — ignore
        closed = false;
      }

      // Many mobile browsers report closed=true immediately on a broken popup.
      // Only treat as "open" when we see closed === false.
      if (!closed) {
        sawWindowOpen = true;
      }

      // EARLY CLOSE: only if we know a real window was open, then user closed it too soon
      if (sawWindowOpen && closed && elapsed < minMs) {
        finish(
          false,
          'Ad closed too early. Keep the ad open until the timer hits 0, then you get the reward.',
        );
      }
    }, 200);

    // Safety: never hang forever (e.g. 2 minutes)
    setTimeout(() => {
      if (settled) return;
      const elapsed = Date.now() - started;
      if (elapsed >= minMs) finish(true);
      else
        finish(
          false,
          'Ad timed out. Please try again and keep the ad open until the timer ends.',
        );
    }, Math.max(minMs + 5000, 120000));
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
  console.log('🌊 Starting Ad Waterfall (Adsterra first)...');

  try {
    console.log('1️⃣ Adsterra Smartlink...');
    await playAdsterra(options);
    return { success: true, network: 'Adsterra' };
  } catch (err1) {
    console.log('⚠️ Adsterra failed:', err1?.message || err1);

    // Don't start Monetag if user closed early on purpose — only if first open failed hard
    const msg = String(err1?.message || '');
    const skipFallback =
      msg.includes('too early') || msg.includes('Popup blocked');

    if (skipFallback) {
      return { success: false, error: msg };
    }

    try {
      console.log('2️⃣ Monetag fallback...');
      if (options.onTick) options.onTick(AD_MIN_WATCH_SECONDS);
      await playMonetag(options);
      return { success: true, network: 'Monetag' };
    } catch (err2) {
      console.log('⚠️ Monetag failed:', err2?.message || err2);
      return {
        success: false,
        error:
          err1?.message ||
          err2?.message ||
          'No ads currently available.',
      };
    }
  }
};
