// ==========================================
// AD NETWORKS — Gift Tap rewarded energy
// Waterfall: Adsterra Smartlink → Monetag (optional)
//
// Smartlinks cannot prove "ad completed". We only reward if the ad tab
// stays open for AD_MIN_WATCH_SECONDS. Closing early = no reward.
// ==========================================

/** Ad tab must stay open at least this long (seconds). */
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
 * Open smartlink after user click.
 * Reward only if the ad tab stays open for the full minimum time.
 * Early close → fail (no energy reward).
 */
const playDirectLink = (url, networkName) => {
  return new Promise((resolve, reject) => {
    if (isPlaceholder(url)) {
      reject(new Error(`${networkName} not configured`));
      return;
    }

    let win;
    try {
      win = window.open(url, '_blank');
    } catch (e) {
      reject(e);
      return;
    }

    if (!win || typeof win.closed === 'undefined') {
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

    const finish = (ok, message) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(maxTimer);
      if (ok) {
        console.log(`✅ ${networkName}: ad tab open long enough — reward OK`);
        try {
          if (win && !win.closed) win.close();
        } catch {
          /* cross-origin may block close */
        }
        resolve({ network: networkName });
      } else {
        console.warn(`⚠️ ${networkName}: ${message}`);
        reject(new Error(message));
      }
    };

    // Poll: if player closes ad tab early → no reward
    const poll = setInterval(() => {
      const elapsed = Date.now() - started;
      let closed = false;
      try {
        closed = win.closed;
      } catch {
        closed = false;
      }

      if (closed) {
        if (elapsed < minMs) {
          finish(
            false,
            'Ad closed too early. Keep the ad tab open until the timer finishes (~15s), then return here.',
          );
        } else {
          // Closed after enough time — OK
          finish(true);
        }
      }
    }, 300);

    // After minimum time, if tab still open, grant reward
    const maxTimer = setTimeout(() => {
      const elapsed = Date.now() - started;
      let closed = false;
      try {
        closed = win.closed;
      } catch {
        closed = false;
      }

      if (elapsed >= minMs) {
        // Still open or closed after min — both OK if not already failed early
        finish(true);
      } else if (closed) {
        finish(false, 'Ad closed too early.');
      }
    }, minMs + 200);
  });
};

const playAdsterra = () => playDirectLink(ADSTERRA_SMARTLINK, 'Adsterra');
const playMonetag = () => playDirectLink(MONETAG_DIRECT_LINK, 'Monetag');

// ==========================================
// WATERFALL: Adsterra first
// ==========================================

export const showRewardedAdWaterfall = async () => {
  console.log('🌊 Starting Ad Waterfall (Adsterra first)...');

  try {
    console.log('1️⃣ Adsterra Smartlink...');
    await playAdsterra();
    return { success: true, network: 'Adsterra' };
  } catch (err1) {
    console.log('⚠️ Adsterra failed:', err1?.message || err1);

    try {
      console.log('2️⃣ Monetag fallback...');
      await playMonetag();
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
