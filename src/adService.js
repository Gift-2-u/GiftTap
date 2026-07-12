// ==========================================
// AD NETWORKS (web app — Monetag first)
// ==========================================

/** Minimum watch time the game accepts for a reward (seconds). */
export const AD_MIN_WATCH_SECONDS = 13;

/**
 * Monetag Direct Link (web).
 * Paste your zone / smartlink from the Monetag dashboard.
 * Example formats: https://otieu.com/4/XXXX  or  https://omg10.com/4/XXXX
 */
const MONETAG_DIRECT_LINK = 'https://omg10.com/4/11263036';

const isPlaceholder = (url) =>
  !url ||
  url.includes('YOUR_MONETAG') ||
  url.includes('XXXX') ||
  url.trim() === '';

const playMonetag = () => {
  return new Promise((resolve, reject) => {
    if (isPlaceholder(MONETAG_DIRECT_LINK)) {
      console.warn('⚠️ Monetag Direct Link not set in adService.js');
      reject(new Error('Monetag not configured'));
      return;
    }

    try {
      // User gesture required — must open from the click handler chain
      const win = window.open(MONETAG_DIRECT_LINK, '_blank');

      if (!win || win.closed || typeof win.closed === 'undefined') {
        // Popup blocked (common on mobile browsers)
        // Fallback: same-tab navigate is too disruptive; show instruction + still require wait
        console.warn('⚠️ Popup blocked — opening via top-level location is not used; reject so UI can retry');
        reject(new Error('Popup blocked. Allow popups for this site and try again.'));
        return;
      }

      // Wait long enough to satisfy GiftTap's elapsed >= 13s check
      const waitMs = (AD_MIN_WATCH_SECONDS + 2) * 1000;
      setTimeout(() => {
        console.log('✅ Monetag direct link window opened; granting reward after timer.');
        resolve({ network: 'Monetag' });
      }, waitMs);
    } catch (e) {
      console.warn('❌ Monetag failed:', e);
      reject(e);
    }
  });
};

const playAdsterra = () => {
  return new Promise((resolve, reject) => {
    reject(new Error('Adsterra not configured yet'));
  });
};

// ==========================================
// WATERFALL: Monetag → Adsterra
// ==========================================

export const showRewardedAdWaterfall = async () => {
  console.log('🌊 Starting Ad Waterfall (Monetag first)...');

  try {
    console.log('1️⃣ Monetag...');
    await playMonetag();
    return { success: true, network: 'Monetag' };
  } catch (err1) {
    console.log('⚠️ Monetag failed:', err1?.message || err1);

    try {
      console.log('2️⃣ Adsterra...');
      await playAdsterra();
      return { success: true, network: 'Adsterra' };
    } catch (err2) {
      console.log('⚠️ Adsterra failed:', err2?.message || err2);
      return {
        success: false,
        error: err1?.message || 'No ads currently available.',
      };
    }
  }
};
