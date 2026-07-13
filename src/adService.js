// ==========================================
// AD NETWORKS — Gift Tap rewarded energy
// Waterfall: Adsterra Smartlink → Monetag (optional)
// ==========================================

/** Minimum watch time before granting reward (seconds). */
export const AD_MIN_WATCH_SECONDS = 13;

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
 * Open a smartlink / direct link after user click, then wait before reward.
 */
const playDirectLink = (url, networkName) => {
  return new Promise((resolve, reject) => {
    if (isPlaceholder(url)) {
      reject(new Error(`${networkName} not configured`));
      return;
    }

    try {
      const win = window.open(url, '_blank');

      if (!win || win.closed || typeof win.closed === 'undefined') {
        reject(
          new Error('Popup blocked. Allow popups for this site and try again.'),
        );
        return;
      }

      const waitMs = (AD_MIN_WATCH_SECONDS + 2) * 1000;
      setTimeout(() => {
        console.log(`✅ ${networkName} opened; granting reward after timer.`);
        resolve({ network: networkName });
      }, waitMs);
    } catch (e) {
      console.warn(`❌ ${networkName} failed:`, e);
      reject(e);
    }
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
