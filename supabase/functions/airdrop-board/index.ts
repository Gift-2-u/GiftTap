/**
 * airdrop-board — public list of L5-qualified players for Ranks → Airdrop.
 * Columns: username, level, bonus %. Sorted by % then level then taps.
 *
 * FAIR %: NFT bonus comes from each player's stored inventory.airdrop_nft snapshot —
 * NOT from "viewer only" live wallet (that made TwrLtr/lats % swap per device).
 * Authed viewers may refresh THEIR snapshot via viewer_nfts, then board uses snapshots for all.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  invObj,
} from "../_shared/economy.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  L5_MAX_UNLOCKED,
  scoreAirdropPlayer,
  scoreNftAirdropBonus,
  type NftPiece,
} from "../_shared/airdropScore.ts";

function normalizeViewerNfts(raw: unknown): NftPiece[] {
  if (!Array.isArray(raw)) return [];
  const out: NftPiece[] = [];
  for (const n of raw.slice(0, 40)) {
    if (!n || typeof n !== "object") continue;
    const o = n as Record<string, unknown>;
    out.push({
      kind: o.kind != null ? String(o.kind) : undefined,
      rarity: o.rarity != null ? String(o.rarity) : undefined,
      name: o.name != null ? String(o.name) : undefined,
    });
  }
  return out;
}

function snapshotFromNfts(nfts: NftPiece[]) {
  const scored = scoreNftAirdropBonus(nfts);
  return {
    nfts,
    bonus: scored.totalNftBonus,
    hasLocksmith: scored.hasLocksmith,
    hasNft: scored.hasNft,
    updated_at: new Date().toISOString(),
  };
}

function nftsFromInventory(inv: Record<string, unknown>): NftPiece[] {
  const snap = inv.airdrop_nft;
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) return [];
  const s = snap as Record<string, unknown>;
  if (Array.isArray(s.nfts)) return normalizeViewerNfts(s.nfts);
  return [];
}

function nftBonusFromInventory(inv: Record<string, unknown>): number | undefined {
  const snap = inv.airdrop_nft;
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) return undefined;
  const b = Number((snap as Record<string, unknown>).bonus);
  return Number.isFinite(b) ? Math.max(0, Math.floor(b)) : undefined;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 300);
    const viewerIdHint = body.viewer_id ? String(body.viewer_id) : "";
    const viewerNfts = normalizeViewerNfts(body.viewer_nfts);

    const sb = adminClient();

    // Optional auth — only the logged-in player may refresh their NFT snapshot
    let authedId = "";
    try {
      const claims = await requirePlayerFromRequest(req);
      authedId = String(claims.sub || "").trim();
    } catch {
      /* public board read */
    }

    const viewerId = authedId || viewerIdHint;

    // Only refresh snapshot when client sends an NFT list (or explicit sync_nfts).
    // Do NOT key off viewer_has_nft alone — empty nfts would wipe a good snapshot.
    if (authedId && (Array.isArray(body.viewer_nfts) || body.sync_nfts === true)) {
      const { data: me, error: meErr } = await sb
        .from("players")
        .select("inventory")
        .eq("telegram_id", authedId)
        .maybeSingle();
      if (!meErr && me) {
        const inv = invObj(me.inventory);
        // Empty list clears stale NFT % (sold / moved wallets)
        inv.airdrop_nft = snapshotFromNfts(viewerNfts);
        await sb
          .from("players")
          .update({
            inventory: inv,
            last_updated: new Date().toISOString(),
          })
          .eq("telegram_id", authedId);
      }
    }

    // Qualified = cleared Level 5 wall (max_unlocked_level >= 9)
    const { data: rows, error } = await sb
      .from("players")
      .select(
        "telegram_id, username, lifetime_taps, max_unlocked_level, current_streak, has_made_purchase, completed_tasks, inventory",
      )
      .gte("max_unlocked_level", L5_MAX_UNLOCKED)
      .order("lifetime_taps", { ascending: false })
      .limit(Math.min(limit * 3, 500));
    if (error) throw error;

    const list = Array.isArray(rows) ? rows : [];
    const ids = list
      .map((r) => String(r.telegram_id || "").trim())
      .filter(Boolean);

    const friends1k = new Map<string, number>();
    const friendsL5 = new Map<string, number>();
    if (ids.length > 0) {
      const chunkSize = 80;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const { data: refs, error: rErr } = await sb
          .from("players")
          .select("referred_by, lifetime_taps, max_unlocked_level")
          .in("referred_by", chunk);
        if (rErr) {
          console.warn("airdrop-board refs", rErr.message);
          continue;
        }
        for (const f of refs || []) {
          const by = String(f.referred_by || "").trim();
          if (!by) continue;
          if (Number(f.lifetime_taps) >= 1000) {
            friends1k.set(by, (friends1k.get(by) || 0) + 1);
          }
          if (Number(f.max_unlocked_level) >= L5_MAX_UNLOCKED) {
            friendsL5.set(by, (friendsL5.get(by) || 0) + 1);
          }
        }
      }
    }

    const board = list.map((r) => {
      const id = String(r.telegram_id || "").trim();
      const completedTasks = Array.isArray(r.completed_tasks)
        ? r.completed_tasks
        : [];
      const hasIap =
        !!r.has_made_purchase || completedTasks.includes("first_purchase");
      const inv = invObj(r.inventory);
      const snapNfts = nftsFromInventory(inv);
      const snapBonus = nftBonusFromInventory(inv);
      const scored = scoreAirdropPlayer({
        lifetimeTaps: Number(r.lifetime_taps) || 0,
        maxUnlockedLevel: Number(r.max_unlocked_level) || 0,
        streak: Number(r.current_streak) || 0,
        hasIap,
        // Absolute: same NFT source for every row (stored snapshot)
        nfts: snapNfts,
        nftBonus: snapNfts.length ? undefined : snapBonus,
        hasNft: snapNfts.length > 0 || (snapBonus != null && snapBonus > 0),
        friendsTaps1000: friends1k.get(id) || 0,
        friendsL5: friendsL5.get(id) || 0,
      });

      return {
        telegram_id: id,
        username: r.username || "Player",
        level: scored.level,
        bonus_pct: scored.totalBonus,
        lifetime_taps: scored.lifetimeTaps,
        max_unlocked_level: Number(r.max_unlocked_level) || 0,
        qualified: scored.qualified,
      };
    });

    board.sort((a, b) => {
      if (b.bonus_pct !== a.bonus_pct) return b.bonus_pct - a.bonus_pct;
      if (b.level !== a.level) return b.level - a.level;
      return b.lifetime_taps - a.lifetime_taps;
    });

    const trimmed = board.slice(0, limit);

    let you: null | {
      rank: number | null;
      level: number;
      bonus_pct: number;
      username: string;
      inList: boolean;
    } = null;

    if (viewerId) {
      const ix = board.findIndex((r) => r.telegram_id === viewerId);
      if (ix >= 0) {
        const row = board[ix];
        you = {
          rank: ix + 1,
          level: row.level,
          bonus_pct: row.bonus_pct,
          username: row.username,
          inList: ix < limit,
        };
      }
    }

    return jsonResponse({
      success: true,
      qualified_count: board.length,
      rows: trimmed,
      you,
      note:
        "Qualified = Level 5 wall cleared. % is absolute (level/taps/streak/IAP/friends + each player's NFT snapshot). Open Airdrop once while logged in to refresh your NFT %.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 400);
  }
});
