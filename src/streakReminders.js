/**
 * Device notifications for streak (not in-game popups).
 * If we need to remind them, they are NOT in the game — use OS notification.
 *
 * - After play / daily limit: schedule "come back tomorrow" for next UTC day
 * - If not played today: schedule "streak at risk" ~2h before UTC midnight
 * - markPlayedTodayUtc cancels same-day risk notice and re-arms tomorrow
 *
 * Limits: setTimeout dies if the browser/WebView is fully killed (no FCM yet).
 * Still works when the tab/app is backgrounded on many phones.
 */

function utcTodayStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

const STORAGE_LAST_TAP = 'gift2u_last_tap_utc';
const STORAGE_NOTIF_PERM_ASKED = 'gift2u_streak_notif_asked';

let comeBackTimerId = null;
let riskTimerId = null;

export function markPlayedTodayUtc(today = utcTodayStr()) {
  try {
    localStorage.setItem(STORAGE_LAST_TAP, today);
  } catch {
    /* ignore */
  }
  // Notifications disabled for now (user will design a better reminder later)
  clearRiskTimer();
  clearComeBackTimer();
}

export function getLastPlayedUtc() {
  try {
    return localStorage.getItem(STORAGE_LAST_TAP) || '';
  } catch {
    return '';
  }
}

function clearRiskTimer() {
  if (riskTimerId != null) {
    clearTimeout(riskTimerId);
    riskTimerId = null;
  }
}

function clearComeBackTimer() {
  if (comeBackTimerId != null) {
    clearTimeout(comeBackTimerId);
    comeBackTimerId = null;
  }
}

/** ms until next UTC calendar day at hourUtc:00 (0–23). */
function msUntilNextUtcDayAtHour(hourUtc = 2) {
  const now = Date.now();
  const d = new Date();
  let target = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 1,
    hourUtc,
    0,
    0,
    0,
  );
  if (target <= now) {
    target += 24 * 60 * 60 * 1000;
  }
  return target - now;
}

/** ms until (next UTC midnight − hoursBefore). Null if already past that window today. */
export function msUntilUtcReminder(hoursBefore = 2) {
  const now = Date.now();
  const d = new Date();
  const nextMidnight = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  const remindAt = nextMidnight - hoursBefore * 3600 * 1000;
  if (remindAt <= now) return null;
  return remindAt - now;
}

/**
 * @returns {'granted'|'denied'|'default'|'unsupported'}
 */
export async function ensureNotificationPermission({ forcePrompt = false } = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';

  try {
    let asked = false;
    try {
      asked = localStorage.getItem(STORAGE_NOTIF_PERM_ASKED) === '1';
    } catch {
      /* ignore */
    }
    if (asked && !forcePrompt) return 'default';

    try {
      localStorage.setItem(STORAGE_NOTIF_PERM_ASKED, '1');
    } catch {
      /* ignore */
    }
    const res = await Notification.requestPermission();
    return res;
  } catch {
    return 'denied';
  }
}

function showDeviceNotification(title, body, tag) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const opts = {
      body,
      tag: tag || 'gift2u-streak',
      renotify: true,
      data: { url: '/play' },
    };

    if (navigator.serviceWorker?.ready) {
      navigator.serviceWorker.ready
        .then((reg) => {
          if (reg.showNotification) return reg.showNotification(title, opts);
          // eslint-disable-next-line no-new
          new Notification(title, opts);
        })
        .catch(() => {
          // eslint-disable-next-line no-new
          new Notification(title, opts);
        });
    } else {
      // eslint-disable-next-line no-new
      new Notification(title, opts);
    }
  } catch (e) {
    console.warn('device notification failed', e?.message || e);
  }
}

function fireComeBackTomorrowNotification() {
  const today = utcTodayStr();
  // If they already played "today" when this fires, skip
  if (getLastPlayedUtc() === today) return;
  showDeviceNotification(
    'Gift2U — keep your streak',
    'Come back and tap today (UTC) so your streak does not reset.',
    'gift2u-streak-comeback',
  );
  // Arm same-day risk reminder for later today
  scheduleStreakDeviceNotice(2);
}

function fireStreakAtRiskNotification() {
  const today = utcTodayStr();
  if (getLastPlayedUtc() === today) return;
  showDeviceNotification(
    'Gift2U — streak at risk',
    'You have not played yet today (UTC). Tap before midnight or your streak resets!',
    'gift2u-streak-risk',
  );
}

/**
 * After they finished playing today: notify them TOMORROW on the device.
 * Call on valid tap (via markPlayed) and when daily limit hits.
 */
export function scheduleComeBackTomorrowNotice() {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  clearComeBackTimer();

  // Next UTC day at 02:00 UTC — “tomorrow”, not while they’re still finishing today’s session
  const delay = msUntilNextUtcDayAtHour(2);
  // Browsers clamp very long timers; keep under ~24h
  const safeDelay = Math.min(delay, 24 * 60 * 60 * 1000 - 60 * 1000);

  comeBackTimerId = setTimeout(() => {
    comeBackTimerId = null;
    fireComeBackTomorrowNotification();
  }, Math.max(safeDelay, 5000));
}

/**
 * If they have NOT played today: remind on device ~2h before UTC midnight.
 */
export function scheduleStreakDeviceNotice(hoursBefore = 2) {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  clearRiskTimer();

  const today = utcTodayStr();
  if (getLastPlayedUtc() === today) {
    // Already played — only tomorrow comeback matters
    scheduleComeBackTomorrowNotice();
    return;
  }

  const delay = msUntilUtcReminder(hoursBefore);
  if (delay == null || delay <= 0) {
    riskTimerId = setTimeout(() => {
      riskTimerId = null;
      fireStreakAtRiskNotification();
    }, 8000);
    return;
  }

  riskTimerId = setTimeout(() => {
    riskTimerId = null;
    fireStreakAtRiskNotification();
  }, delay);
}

/**
 * Call when user hits daily limit (user gesture: OK / Battery).
 * Soft-asks notification permission once, then schedules device "come back tomorrow".
 * No in-game reminder modal.
 */
export async function armStreakDeviceRemindersAfterPlay() {
  const perm = await ensureNotificationPermission({ forcePrompt: false });
  if (perm === 'granted') {
    markPlayedTodayUtc(utcTodayStr());
    scheduleComeBackTomorrowNotice();
    return 'granted';
  }
  // Still mark play for local state; no notification until they allow later
  try {
    localStorage.setItem(STORAGE_LAST_TAP, utcTodayStr());
  } catch {
    /* ignore */
  }
  return perm;
}
