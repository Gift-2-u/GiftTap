/**
 * Local streak reminders (web / WebView).
 * - scheduleStreakDeviceNotice: device notification ~2h before UTC midnight if not played today
 * - markPlayedTodayUtc: call after a valid tap so the notice is cancelled for today
 */

function utcTodayStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

const STORAGE_LAST_TAP = 'gift2u_last_tap_utc';
const STORAGE_NOTIF_PERM_ASKED = 'gift2u_streak_notif_asked';

let scheduledTimerId = null;

export function markPlayedTodayUtc(today = utcTodayStr()) {
  try {
    localStorage.setItem(STORAGE_LAST_TAP, today);
  } catch {
    /* ignore */
  }
  // Cancel pending same-day reminder; reschedule for tomorrow after play
  if (scheduledTimerId != null) {
    clearTimeout(scheduledTimerId);
    scheduledTimerId = null;
  }
}

export function getLastPlayedUtc() {
  try {
    return localStorage.getItem(STORAGE_LAST_TAP) || '';
  } catch {
    return '';
  }
}

/** ms until (next UTC midnight − hoursBefore hours). Null if already past window. */
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

export async function ensureNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const asked = localStorage.getItem(STORAGE_NOTIF_PERM_ASKED);
    // Only prompt once from our side unless already granted
    if (asked === '1' && Notification.permission === 'default') {
      // still allow request after streak popup
    }
    localStorage.setItem(STORAGE_NOTIF_PERM_ASKED, '1');
    const res = await Notification.requestPermission();
    return res;
  } catch {
    return 'denied';
  }
}

function fireStreakNotification() {
  try {
    const today = utcTodayStr();
    if (getLastPlayedUtc() === today) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const title = 'Gift2U — streak at risk';
    const body =
      'You have not played yet today (UTC). Tap before midnight or your streak resets!';
    // Prefer service worker if available (better when backgrounded)
    if (navigator.serviceWorker?.ready) {
      navigator.serviceWorker.ready
        .then((reg) => {
          if (reg.showNotification) {
            return reg.showNotification(title, {
              body,
              tag: 'gift2u-streak-utc',
              renotify: true,
              data: { url: '/play' },
            });
          }
          // eslint-disable-next-line no-new
          new Notification(title, { body, tag: 'gift2u-streak-utc' });
        })
        .catch(() => {
          // eslint-disable-next-line no-new
          new Notification(title, { body, tag: 'gift2u-streak-utc' });
        });
    } else {
      // eslint-disable-next-line no-new
      new Notification(title, { body, tag: 'gift2u-streak-utc' });
    }
  } catch (e) {
    console.warn('streak notification failed', e?.message || e);
  }
}

/**
 * Schedule one local notice before end of current UTC day if player has not tapped today.
 * Call on app load and after permission grant. Safe to call repeatedly.
 */
export function scheduleStreakDeviceNotice(hoursBefore = 2) {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;

  if (scheduledTimerId != null) {
    clearTimeout(scheduledTimerId);
    scheduledTimerId = null;
  }

  const today = utcTodayStr();
  if (getLastPlayedUtc() === today) {
    // Already played — schedule for next UTC day window after midnight is complex offline;
    // next load / next tap will re-arm.
    return;
  }

  if (Notification.permission !== 'granted') return;

  const delay = msUntilUtcReminder(hoursBefore);
  if (delay == null || delay <= 0) {
    // Inside last hoursBefore window and not played — fire once soon
    scheduledTimerId = setTimeout(() => {
      scheduledTimerId = null;
      fireStreakNotification();
    }, 5000);
    return;
  }

  // Cap setTimeout (browsers) — delay always < 24h here
  scheduledTimerId = setTimeout(() => {
    scheduledTimerId = null;
    fireStreakNotification();
  }, delay);
}
