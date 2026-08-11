/**
 * Gift2U claim rule (DEFAULT — do not change lightly)
 * =====================================================
 * Every task / quest / reward that is "claimable" is ONCE-ONLY unless the
 * feature explicitly opts out.
 *
 * After a successful claim:
 *   - UI must show DONE / CLAIMED (not Claim)
 *   - Server must record the claim so a refresh cannot re-grant
 *   - Concurrent inventory saves must not wipe the claim record
 *
 * Opt-out (must be intentional in code + product copy):
 *   - onceOnly: false          → unlimited claims (rare)
 *   - period: 'utc-day'        → once per UTC day (pass periodKey = YYYY-MM-DD)
 *   - period: 'utc-week'       → once per UTC week (pass periodKey = 2026-W33)
 *
 * Always use helpers from this file for new claimables. Do not invent a new
 * "claimed" array that is easy to wipe with a stale inventory write.
 */

import { supabase } from './supabaseClient';
import { DB_PLAYER_ID } from './playerIdentity';

/** Product default — only set onceOnly:false when the design says so */
export const CLAIM_ONCE_BY_DEFAULT = true;

/**
 * Build a durable claim key.
 * @param {{ scope: string, id: string, periodKey?: string|null }} p
 * @example claimKey({ scope: 'lifetime', id: 'streak_7' })
 * @example claimKey({ scope: 'weekly', id: 'wq_tap500_1', periodKey: '2026-W33' })
 */
export function claimKey({ scope, id, periodKey = null }) {
  const s = String(scope || 'app').trim();
  const i = String(id || '').trim();
  if (!i) throw new Error('claimKey: id is required');
  if (periodKey) return `${s}:${periodKey}:${i}`;
  return `${s}:${i}`;
}

/** Union of claim_log arrays — never drop a claim key */
export function mergeClaimLogs(a, b) {
  const out = new Set();
  for (const src of [a, b]) {
    if (!Array.isArray(src)) continue;
    for (const k of src) {
      if (typeof k === 'string' && k.length > 0) out.add(k);
    }
  }
  return [...out].sort();
}

export function inventoryHasClaim(inv, key) {
  if (!key) return false;
  const log = inv?.claim_log;
  if (Array.isArray(log) && log.includes(key)) return true;
  return false;
}

/** Mark claim on inventory (durable claim_log). Does not grant rewards. */
export function withInventoryClaim(inv, key) {
  const base = inv && typeof inv === 'object' ? { ...inv } : {};
  base.claim_log = mergeClaimLogs(base.claim_log, [key]);
  return base;
}

/**
 * Merge two inventory objects while preserving claim_log (and optional weekly keys).
 * Call this on every inventory write path that might race a claim.
 */
export function mergeInventoryPreservingClaims(a, b) {
  const A = a && typeof a === 'object' ? a : {};
  const B = b && typeof b === 'object' ? b : {};
  return {
    ...A,
    ...B,
    claim_log: mergeClaimLogs(A.claim_log, B.claim_log),
    // Keep weekly durable keys if either side has them
    weekly_claim_keys: mergeClaimLogs(A.weekly_claim_keys, B.weekly_claim_keys),
  };
}

/**
 * Run a claim with default once-only semantics.
 *
 * Flow:
 *  1) Read inventory from server
 *  2) If onceOnly and already claimed → { ok: true, alreadyClaimed: true } (no grant)
 *  3) Mark claim_log, write inventory (+ optional extra fields)
 *  4) Call grant() only when this was a fresh claim
 *  5) Re-assert claim_log after grant (anti wipe)
 *
 * @param {object} opts
 * @param {string} opts.playerId
 * @param {string} opts.claimKey - from claimKey()
 * @param {boolean} [opts.onceOnly=true] - DEFAULT true; set false only if product allows multi-claim
 * @param {(ctx: { inv: object, alreadyClaimed: boolean }) => Promise<object|void>|object|void} [opts.grant]
 *        Mutate/return inventory updates for reward. Only called when !alreadyClaimed (or onceOnly false).
 * @param {(inv: object) => object} [opts.beforeWrite] - extra inventory fields before first write
 * @param {object} [opts.extraPlayerFields] - top-level players columns to update with inventory
 * @returns {Promise<{ ok: boolean, alreadyClaimed: boolean, inv?: object, error?: Error }>}
 */
export async function runClaimOnce({
  playerId,
  claimKey: key,
  onceOnly = CLAIM_ONCE_BY_DEFAULT,
  grant,
  beforeWrite,
  extraPlayerFields = {},
  dbCol = DB_PLAYER_ID,
} = {}) {
  if (!playerId) {
    return { ok: false, alreadyClaimed: false, error: new Error('playerId required') };
  }
  if (!key) {
    return { ok: false, alreadyClaimed: false, error: new Error('claimKey required') };
  }

  try {
    const { data: row, error: selErr } = await supabase
      .from('players')
      .select('inventory')
      .eq(dbCol, String(playerId))
      .maybeSingle();
    if (selErr) throw selErr;

    let inv = { ...(row?.inventory || {}) };
    const alreadyClaimed = onceOnly && inventoryHasClaim(inv, key);

    if (alreadyClaimed) {
      return { ok: true, alreadyClaimed: true, inv };
    }

    // Mark claim BEFORE grant so a crash mid-grant cannot infinite-retry free rewards
    // without a deliberate support reset of claim_log.
    inv = withInventoryClaim(inv, key);
    if (typeof beforeWrite === 'function') {
      inv = { ...inv, ...(beforeWrite(inv) || {}) };
    }

    const { error: writeErr } = await supabase
      .from('players')
      .update({
        inventory: inv,
        last_updated: new Date().toISOString(),
        ...extraPlayerFields,
      })
      .eq(dbCol, String(playerId));
    if (writeErr) throw writeErr;

    // Fresh claim (or multi-claim allowed) → grant reward
    if (typeof grant === 'function') {
      const grantResult = await grant({ inv, alreadyClaimed: false });
      if (grantResult && typeof grantResult === 'object') {
        inv = mergeInventoryPreservingClaims(inv, grantResult);
        inv = withInventoryClaim(inv, key);
        await supabase
          .from('players')
          .update({
            inventory: inv,
            last_updated: new Date().toISOString(),
          })
          .eq(dbCol, String(playerId));
      } else {
        // Re-assert claim after side-effect grants (e.g. grantTaskEnergy inventory write)
        const { data: row2 } = await supabase
          .from('players')
          .select('inventory')
          .eq(dbCol, String(playerId))
          .maybeSingle();
        inv = withInventoryClaim(
          mergeInventoryPreservingClaims(row2?.inventory || {}, inv),
          key,
        );
        await supabase
          .from('players')
          .update({
            inventory: inv,
            last_updated: new Date().toISOString(),
          })
          .eq(dbCol, String(playerId));
      }
    }

    return { ok: true, alreadyClaimed: false, inv };
  } catch (error) {
    console.error('runClaimOnce', key, error);
    return { ok: false, alreadyClaimed: false, error };
  }
}

/**
 * UI helper: should the Claim button show?
 * @param {boolean} progressReady - met requirements (taps, streak, …)
 * @param {boolean} isClaimed - already claimed this period
 * @param {{ onceOnly?: boolean }} [opts]
 */
export function isClaimButtonReady(progressReady, isClaimed, opts = {}) {
  const onceOnly = opts.onceOnly !== false && CLAIM_ONCE_BY_DEFAULT;
  if (!progressReady) return false;
  if (onceOnly && isClaimed) return false;
  return true;
}

/**
 * Session lock so double-taps cannot fire two grants before the server responds.
 * Use one Map per feature screen (or a module-level map keyed by claimKey).
 */
export function createClaimLock() {
  const locked = new Set();
  return {
    tryLock(key) {
      if (locked.has(key)) return false;
      locked.add(key);
      return true;
    },
    unlock(key) {
      locked.delete(key);
    },
    isLocked(key) {
      return locked.has(key);
    },
  };
}
