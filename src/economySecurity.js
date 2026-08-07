/**
 * Economy security helpers — soft client clamps.
 *
 * Reality: anything in the browser can be edited in DevTools.
 * These helpers stop *naive* cheats from writing fake G2Ushards / G2U
 * into Supabase when the save path runs. Real security still needs
 * server-side guards (see supabase/migrations/20260807_economy_guard.sql).
 *
 * Design goals:
 * - Never punish normal taps / offline bot (lifetime_taps rises with shards)
 * - Allow small extras (referrals, races): EXTRA_SHARD_SLACK
 * - Allow spends (balance can only go down freely)
 * - Cap absurd single-write jumps
 */

/** Shards that may appear without a matching lifetime_taps rise (referrals, race). */
export const EXTRA_SHARD_SLACK = 6000;

/** Hard ceiling for shards gained in one write (blocks 999,999,999 DevTools). */
export const MAX_SHARD_GAIN_PER_WRITE = 5_000_000;

/** Hard ceiling for G2U credit gained in one write without a shard burn. */
export const MAX_GFT_GAIN_BARE = 50_000;

/**
 * Clamp a proposed shard balance against the last known server row.
 * @param {number} proposedShards - what the client wants to write
 * @param {number} proposedLifetime - lifetime_taps client wants to write
 * @param {{ b?: number, ltt?: number }} server - last server snapshot
 * @returns {{ shards: number, clamped: boolean, reason?: string }}
 */
export function clampShardWrite(proposedShards, proposedLifetime, server = {}) {
  const want = Math.max(0, Number(proposedShards) || 0);
  const wantLtt = Math.max(0, Number(proposedLifetime) || 0);
  const serverB = Math.max(0, Number(server.b) || 0);
  const serverLtt = Math.max(0, Number(server.ltt) || 0);

  // Spends / admin downs: always allow lower or equal
  if (want <= serverB + 0.001) {
    return { shards: want, clamped: false };
  }

  const lttGain = Math.max(0, wantLtt - serverLtt);
  // Earnings track lifetime_taps in this game (taps add shards into both)
  let maxAllowed = serverB + lttGain + EXTRA_SHARD_SLACK;
  maxAllowed = Math.min(maxAllowed, serverB + MAX_SHARD_GAIN_PER_WRITE);

  if (want > maxAllowed + 0.001) {
    return {
      shards: Math.round(maxAllowed * 1000) / 1000,
      clamped: true,
      reason: `shard gain capped (want ${want}, max ${maxAllowed})`,
    };
  }
  return { shards: want, clamped: false };
}

/**
 * Clamp G2U credit (gft_token_balance) gain.
 * Swaps burn shards → credit; bare huge jumps are blocked.
 * @param {number} proposedGft
 * @param {number} serverGft
 * @param {number} shardDelta - newShards - oldShards (negative when swapping)
 */
export function clampGftWrite(proposedGft, serverGft, shardDelta = 0) {
  const want = Math.max(0, Number(proposedGft) || 0);
  const server = Math.max(0, Number(serverGft) || 0);
  if (want <= server + 0.000001) {
    return { gft: want, clamped: false };
  }

  const gain = want - server;
  const shardsBurned = Math.max(0, -(Number(shardDelta) || 0));
  // At worst rate ~1000 shards per 1 G2U; allow 2x slack for fees/tiers
  const maxFromShards = shardsBurned > 0 ? (shardsBurned / 100) * 2 : 0;
  const maxAllowed = server + Math.max(maxFromShards, MAX_GFT_GAIN_BARE);

  if (want > maxAllowed + 0.000001) {
    return {
      gft: Math.round(maxAllowed * 1e6) / 1e6,
      clamped: true,
      reason: `gft gain capped (want ${want}, max ${maxAllowed})`,
    };
  }
  return { gft: want, clamped: false };
}

/**
 * Fetch authoritative economy columns for a player.
 */
export async function fetchServerEconomy(supabase, playerId, idCol = 'id') {
  const { data, error } = await supabase
    .from('players')
    .select('shard_balance, gft_token_balance, lifetime_taps, season_shards, daily_taps')
    .eq(idCol, String(playerId))
    .maybeSingle();
  if (error) throw error;
  return {
    b: Number(data?.shard_balance) || 0,
    gft: Number(data?.gft_token_balance) || 0,
    ltt: Number(data?.lifetime_taps) || 0,
    s: Number(data?.season_shards) || 0,
    dt: Number(data?.daily_taps) || 0,
  };
}
