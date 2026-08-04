// ==========================================
// AD NETWORKS — Gift Tap Free Energy
//
// Monetag Direct link — Positive tag 11270717
//
// Direct links have NO completion callback.
// We require engagement (user leaves Gift Tap for the ad)
// so blocked/"security" pages do NOT grant free energy.
//
// One network per tap only — a second window.open after the
// first attempt loses the user gesture and looks "popup blocked".
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

const isPlaceholder = (url) =>
  !url ||
  url.includes('YOUR_') ||
  url.includes('XXXX') ||
  url.trim() === '';

/**
 * Open ad in a new tab during the user gesture.
 *
 * IMPORTANT: do NOT pass "noopener" / "noreferrer" as window features —
 * modern browsers then always return null from window.open, which made
 * Free Energy falsely report "popup blocked".
 */
const openAdTab = (url) => {
  let win = null;
  try {
    // No feature string → real Window handle when the tab opens
    win = window.open(url, '_blank');
  } catch {
    /* ignore */
  }

  if (win) {
    try {
      // Drop reverse access without losing the handle
      win.opener = null;
    } catch {
      /* ignore */
    }
    return win;
  }

  // Mobile / strict browsers: open() may return null even when a tab opened
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
 * Monetag direct link with engagement gate.
 * - Prefer a real window handle when available
 * - Null handle is OK (common on mobile) if user leaves Gift Tap
 * - Must leave Gift Tap for most of the wait → no free energy on blocked ads
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

      // Only trust win.closed when we have a handle
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
 * Free Energy: Monetag Positive tag only (one open per tap).
 * @param {{ onTick?: (secondsLeft: number) => void }} [options]
 */
export const showRewardedAdWaterfall = async (options = {}) => {
  console.log(
    `🌊 Free Energy: Monetag zone ${MONETAG_ZONE_ID} (engaged only, single open)`,
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
