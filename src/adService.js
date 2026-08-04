// ==========================================
// AD NETWORKS — Gift Tap Free Energy
//
// Primary: Monetag Direct link — Positive tag 11270717
// Fallback: Adsterra smartlink
//
// Direct links have NO completion callback.
// We require engagement (tab opens + user leaves Gift Tap)
// so blocked/"security" pages do NOT grant free energy.
// ==========================================

/** UI countdown while ad tab is open (not a free auto-reward). */
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

/** Adsterra Smartlink (fallback) */
const ADSTERRA_SMARTLINK =
  'https://www.effectivecpmnetwork.com/bdacmkhj?key=7e3996662a009f6b36c14bdf3d76d8ed';

const isPlaceholder = (url) =>
  !url ||
  url.includes('YOUR_') ||
  url.includes('XXXX') ||
  url.trim() === '';

const openAdTab = (url) => {
  let win = null;
  try {
    win = window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    /* ignore */
  }
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
 * Direct / smartlink with engagement gate.
 * - Popup must open
 * - User must leave Gift Tap for most of the wait
 * - Early-closed / blocked tabs fail → no energy
 *
 * @param {string} url
 * @param {string} networkName
 * @param {{ onTick?: (secondsLeft: number) => void }} [options]
 * @returns {Promise<{ network: string }>}
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
    if (!win) {
      reject(
        new Error(
          `${networkName}: popup blocked. Allow popups for Gift2U and try again.`,
        ),
      );
      return;
    }

    const minMs = AD_MIN_WATCH_SECONDS * 1000;
    const started = Date.now();
    let settled = false;
    let leftPageMs = 0;
    let lastHiddenAt = null;
    let lastReported = AD_MIN_WATCH_SECONDS + 1;
    let pollId = null;
    let safetyId = null;

    // Must actually switch away to the ad for most of the timer
    const MIN_HIDDEN_MS = Math.floor(minMs * 0.6);

    console.log(`📺 ${networkName}: opened direct link`, url);

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

      if (elapsed >= minMs) {
        const hiddenTotal =
          leftPageMs + (lastHiddenAt != null ? Date.now() - lastHiddenAt : 0);
        if (hiddenTotal >= MIN_HIDDEN_MS) {
          finish(true);
        } else {
          finish(
            false,
            `${networkName}: open the ad tab and stay on it until the timer ends. Blocked ads do not give energy.`,
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
          `${networkName}: timed out. Ad may be blocked by security software.`,
        );
      }
    }, minMs + 20000);
  });
};

const playMonetag = (opts) =>
  playEngagedLink(MONETAG_DIRECT_LINK, 'Monetag', opts);
const playAdsterra = (opts) =>
  playEngagedLink(ADSTERRA_SMARTLINK, 'Adsterra', opts);

/**
 * Free Energy waterfall: Monetag Positive tag (11270717) → Adsterra.
 * No pure timer rewards — blocked ads do not grant energy.
 * @param {{ onTick?: (secondsLeft: number) => void }} [options]
 */
export const showRewardedAdWaterfall = async (options = {}) => {
  console.log(
    `🌊 Ad waterfall: Monetag zone ${MONETAG_ZONE_ID} → Adsterra (engaged only)`,
  );

  const steps = [
    { name: 'Monetag', play: playMonetag },
    { name: 'Adsterra', play: playAdsterra },
  ];

  let lastError =
    'No ads available. If security software blocks ads, Free Energy cannot run.';

  for (const step of steps) {
    try {
      console.log(`▶️ ${step.name}…`);
      if (options.onTick) options.onTick(AD_MIN_WATCH_SECONDS);
      const result = await step.play(options);
      return { success: true, network: result.network };
    } catch (err) {
      lastError = err?.message || String(err);
      console.log(`⚠️ ${step.name} failed:`, lastError);
    }
  }

  return { success: false, error: lastError };
};
