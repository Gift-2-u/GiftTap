/**
 * Personal milestone airdrop — level XP bands + lifetime tap bonuses
 * (mirror of src/personalMilestone.js). Season vault; stack into one open allocation.
 */

export const MILESTONE_G2U_PER_1000_SHARDS = 250;

/** Extra $G2U at lifetime tap thresholds (on top of per-level rewards). */
export const LIFETIME_G2U_MILESTONES: Array<{ taps: number; g2u: number }> = [
  { taps: 50000, g2u: 2500 },
  { taps: 100000, g2u: 5000 },
  { taps: 150000, g2u: 7500 },
  { taps: 200000, g2u: 10000 },
  { taps: 250000, g2u: 10000 },
  { taps: 300000, g2u: 15000 },
  { taps: 350000, g2u: 15000 },
  { taps: 400000, g2u: 20000 },
];

export function xpForLevel(level: number): number {
  const L = Math.max(0, Math.floor(Number(level) || 0));
  if (L < 5) return 10000;
  if (L < 10) return 15000;
  if (L < 20) return 50000;
  if (L < 30) return 150000;
  if (L < 50) return 350000;
  if (L < 75) return 1000000;
  if (L < 100) return 3000000;
  return 0;
}

export function g2uForLevel(level: number): number {
  const xp = xpForLevel(level);
  if (xp <= 0) return 0;
  return Math.floor(xp / 1000) * MILESTONE_G2U_PER_1000_SHARDS;
}

export function milestoneLevelFromTaps(taps: number): number {
  const t = Math.max(0, Number(taps) || 0);
  if (t < 50000) return Math.floor(t / 10000);
  if (t < 125000) return 5 + Math.floor((t - 50000) / 15000);
  if (t < 625000) return 10 + Math.floor((t - 125000) / 50000);
  if (t < 2125000) return 20 + Math.floor((t - 625000) / 150000);
  if (t < 9125000) return 30 + Math.floor((t - 2125000) / 350000);
  if (t < 34125000) return 50 + Math.floor((t - 9125000) / 1000000);
  if (t < 109125000) return 75 + Math.floor((t - 34125000) / 3000000);
  return 100;
}

export function tapsToReachLevel(level: number): number {
  const L = Math.max(0, Math.floor(Number(level) || 0));
  if (L <= 0) return 0;
  if (L <= 5) return L * 10000;
  if (L <= 10) return 50000 + (L - 5) * 15000;
  if (L <= 20) return 125000 + (L - 10) * 50000;
  if (L <= 30) return 625000 + (L - 20) * 150000;
  if (L <= 50) return 2125000 + (L - 30) * 350000;
  if (L <= 75) return 9125000 + (L - 50) * 1000000;
  if (L <= 100) return 34125000 + (L - 75) * 3000000;
  return 109125000;
}

export function needsMilestoneSeed(
  inv: Record<string, unknown> | null | undefined,
): boolean {
  return (
    inv == null ||
    inv.personal_milestone_claimed_level == null ||
    inv.personal_milestone_claimed_level === ""
  );
}

export function getClaimedMilestoneLevel(
  inv: Record<string, unknown> | null | undefined,
  lifetimeTaps = 0,
): number {
  if (needsMilestoneSeed(inv)) {
    return milestoneLevelFromTaps(lifetimeTaps);
  }
  return Math.max(
    0,
    Math.floor(Number(inv?.personal_milestone_claimed_level) || 0),
  );
}

/** Persist seed into inv (mutates). Returns seeded claimed level. */
export function seedMilestoneClaimedLevel(
  inv: Record<string, unknown>,
  lifetimeTaps: number,
): number {
  if (!needsMilestoneSeed(inv)) {
    return getClaimedMilestoneLevel(inv, lifetimeTaps);
  }
  const seeded = milestoneLevelFromTaps(lifetimeTaps);
  inv.personal_milestone_claimed_level = seeded;
  return seeded;
}

export function nextMilestoneClaim(
  lifetimeTaps: number,
  inv: Record<string, unknown> | null | undefined,
): {
  claimedLevel: number;
  nextLevel: number;
  amount: number;
  tapsNeeded: number;
  canClaim: boolean;
  needsSeed: boolean;
} {
  const needsSeed = needsMilestoneSeed(inv);
  const claimed = getClaimedMilestoneLevel(inv, lifetimeTaps);
  if (claimed >= 100) {
    return {
      claimedLevel: claimed,
      nextLevel: 100,
      amount: 0,
      tapsNeeded: tapsToReachLevel(100),
      canClaim: false,
      needsSeed,
    };
  }
  const nextLevel = claimed + 1;
  const tapsNeeded = tapsToReachLevel(nextLevel);
  const amount = g2uForLevel(claimed);
  const reached = Math.max(0, Number(lifetimeTaps) || 0) >= tapsNeeded;
  return {
    claimedLevel: claimed,
    nextLevel,
    amount,
    tapsNeeded,
    canClaim: reached && amount > 0,
    needsSeed,
  };
}

export const MILESTONE_ALLOC_SOURCE = "milestone";
export const MILESTONE_ALLOC_PERIOD = "open";

type SbClient = {
  from: (table: string) => any;
};

function getClaimedLifetimeMilestones(
  inv: Record<string, unknown>,
  lifetimeTaps: number,
): number[] {
  const raw = inv.personal_lifetime_milestones_claimed;
  if (raw == null) {
    return LIFETIME_G2U_MILESTONES.filter((m) => lifetimeTaps >= m.taps).map(
      (m) => m.taps,
    );
  }
  if (!Array.isArray(raw)) return [];
  return raw.map((n) => Math.floor(Number(n) || 0)).filter((n) => n > 0);
}

function seedLifetimeMilestones(
  inv: Record<string, unknown>,
  lifetimeTaps: number,
): void {
  if (inv.personal_lifetime_milestones_claimed != null) return;
  inv.personal_lifetime_milestones_claimed = getClaimedLifetimeMilestones(
    inv,
    lifetimeTaps,
  );
}

/**
 * Grant newly reached level + lifetime milestones into ONE open airdrop_allocations row
 * (amount stacks). Season vault. No backfill for thresholds already passed at seed.
 */
export async function accruePersonalMilestones(
  sb: SbClient,
  opts: {
    playerId: string;
    lifetimeTaps: number;
    inv: Record<string, unknown>;
    username?: string | null;
  },
): Promise<{
  granted: number;
  levels: number[];
  lifetime: number[];
  inv: Record<string, unknown>;
}> {
  const { playerId, lifetimeTaps } = opts;
  const inv = opts.inv || {};
  seedMilestoneClaimedLevel(inv, lifetimeTaps);
  seedLifetimeMilestones(inv, lifetimeTaps);

  const levels: number[] = [];
  const lifetimeGranted: number[] = [];
  let granted = 0;

  for (let i = 0; i < 100; i++) {
    const next = nextMilestoneClaim(lifetimeTaps, inv);
    if (!next.canClaim || next.amount <= 0) break;
    granted += next.amount;
    levels.push(next.nextLevel);
    inv.personal_milestone_claimed_level = next.nextLevel;
    const prevLog = Array.isArray(inv.personal_milestone_claims)
      ? [...(inv.personal_milestone_claims as unknown[])]
      : [];
    prevLog.push({
      at: new Date().toISOString(),
      kind: "level",
      level: next.nextLevel,
      amount: next.amount,
      lifetime_taps: lifetimeTaps,
      queued: true,
    });
    inv.personal_milestone_claims = prevLog.slice(-120);
  }

  const claimedLife = new Set(getClaimedLifetimeMilestones(inv, lifetimeTaps));
  for (const m of LIFETIME_G2U_MILESTONES) {
    if (lifetimeTaps < m.taps) continue;
    if (claimedLife.has(m.taps)) continue;
    granted += m.g2u;
    lifetimeGranted.push(m.taps);
    claimedLife.add(m.taps);
    const prevLog = Array.isArray(inv.personal_milestone_claims)
      ? [...(inv.personal_milestone_claims as unknown[])]
      : [];
    prevLog.push({
      at: new Date().toISOString(),
      kind: "lifetime",
      taps: m.taps,
      amount: m.g2u,
      lifetime_taps: lifetimeTaps,
      queued: true,
    });
    inv.personal_milestone_claims = prevLog.slice(-120);
  }
  inv.personal_lifetime_milestones_claimed = [...claimedLife].sort(
    (a, b) => a - b,
  );

  if (granted <= 0) {
    return { granted: 0, levels, lifetime: lifetimeGranted, inv };
  }

  const { data: openRow, error: selErr } = await sb
    .from("airdrop_allocations")
    .select("id, amount")
    .eq("telegram_id", playerId)
    .eq("source", MILESTONE_ALLOC_SOURCE)
    .eq("period_id", MILESTONE_ALLOC_PERIOD)
    .is("claimed_at", null)
    .maybeSingle();
  if (selErr) throw selErr;

  if (openRow?.id) {
    const nextAmt =
      Math.round(((Number(openRow.amount) || 0) + granted) * 1000) / 1000;
    const { error: upErr } = await sb
      .from("airdrop_allocations")
      .update({
        amount: nextAmt,
        meta: {
          stacked: true,
          last_levels: levels,
          last_lifetime: lifetimeGranted,
          updated_at: new Date().toISOString(),
        },
      })
      .eq("id", openRow.id)
      .is("claimed_at", null);
    if (upErr) throw upErr;
  } else {
    const { error: insErr } = await sb.from("airdrop_allocations").insert({
      telegram_id: playerId,
      username: opts.username || null,
      source: MILESTONE_ALLOC_SOURCE,
      period_id: MILESTONE_ALLOC_PERIOD,
      amount: granted,
      weight: null,
      meta: {
        levels,
        lifetime: lifetimeGranted,
        created_at: new Date().toISOString(),
      },
    });
    if (insErr) throw insErr;
  }

  return { granted, levels, lifetime: lifetimeGranted, inv };
}
