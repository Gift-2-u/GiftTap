/**
 * Weekly season auto-rollover (client side).
 *
 * Server owns the real freeze via ensure_weekly_leaderboard_rollover():
 *  - snapshots finished UTC weeks into weekly_leaderboard_snapshots
 *  - durable scores live in weekly_score_ledger (safe after week_id rolls)
 *  - new week is live automatically via ISO week id
 *
 * Call this often-ish; the RPC is idempotent + advisory-locked.
 */
import { supabase } from './supabaseClient';

let inFlight = null;
let lastOkAt = 0;
const MIN_GAP_MS = 60_000; // at most once per minute per tab

/**
 * Ensure any finished week is snapshotted. Safe no-op if SQL not applied yet.
 * @returns {Promise<object|null>}
 */
export async function ensureWeeklySeasonRollover(opts = {}) {
  const force = Boolean(opts.force);
  const now = Date.now();
  if (!force && now - lastOkAt < MIN_GAP_MS) {
    return { ok: true, skipped: 'throttle' };
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const { data, error } = await supabase.rpc('ensure_weekly_leaderboard_rollover');
      if (error) {
        // Migration not applied yet — don't spam
        console.warn('weekly rollover:', error.message || error);
        return { ok: false, error: error.message || String(error) };
      }
      lastOkAt = Date.now();
      if (data?.snapped?.length) {
        console.log('weekly season rolled:', data);
      }
      return data || { ok: true };
    } catch (e) {
      console.warn('weekly rollover failed', e?.message || e);
      return { ok: false, error: e?.message || String(e) };
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
