/**
 * airdrop-board — public list of L5-qualified players for Ranks → Airdrop.
 * Columns: username, level, bonus %. Sorted by % then level then taps.
 * No player JWT required (service_role read).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, corsHeaders, jsonResponse } from "../_shared/economy.ts";
import {
  L5_MAX_UNLOCKED,
  scoreAirdropPlayer,
} from "../_shared/airdropScore.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 300);
    const viewerId = body.viewer_id ? String(body.viewer_id) : "";
    const viewerHasNft = !!body.viewer_has_nft;

    const sb = adminClient();

    // Qualified = cleared Level 5 wall (max_unlocked_level >= 9)
    const { data: rows, error } = await sb
      .from("players")
      .select(
        "telegram_id, username, lifetime_taps, max_unlocked_level, current_streak, has_made_purchase, completed_tasks, inventory",
      )
      .gte("max_unlocked_level", L5_MAX_UNLOCKED)
      .order("lifetime_taps", { ascending: false })
      .limit(Math.min(limit * 3, 500)); // over-fetch then sort by bonus %
    if (error) throw error;

    const list = Array.isArray(rows) ? rows : [];
    const ids = list
      .map((r) => String(r.telegram_id || "").trim())
      .filter(Boolean);

    // Batch referral counts for friends bonuses
    const friends1k = new Map<string, number>();
    const friendsL5 = new Map<string, number>();
    if (ids.length > 0) {
      // Chunk .in() to stay under URL / payload limits
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
      // Public board: NFT detected via client for viewer only (DAS is per-wallet).
      // Inventory may later cache flags; for now only viewer_has_nft boosts "you".
      const hasNft = viewerId && id === viewerId ? viewerHasNft : false;

      const scored = scoreAirdropPlayer({
        lifetimeTaps: Number(r.lifetime_taps) || 0,
        maxUnlockedLevel: Number(r.max_unlocked_level) || 0,
        streak: Number(r.current_streak) || 0,
        hasIap,
        hasNft,
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
        "Qualified = Level 5 wall cleared. % = airdrop bonus weight. NFT bonus on your row when wallet has Locksmith.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 400);
  }
});
