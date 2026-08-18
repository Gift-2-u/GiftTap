/**
 * In-game weekly badge marketplace (P2P).
 * Actions: browse | list | cancel | buy
 *
 * Currency:
 *   - sol  — live now (on-chain 95% seller wallet + 5% treasury, then settle)
 *   - g2u  — after launch (G2U token credit / gft_token_balance — not G2Ushards)
 *
 * - List: escrow badges from seller inventory
 * - Cancel: return escrowed badges
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  logEconomy,
  invObj,
  BADGE_ITEM,
} from "../_shared/economy.ts";

const FEE_BPS = 500; // 5%
const TIERS = new Set(["bronze", "silver", "gold", "diamond", "shard"]);
/** sol = live; g2u = G2U token after launch (never G2Ushards) */
const CURRENCIES = new Set(["sol", "g2u"]);
const MIN_SOL = 0.001;
const MIN_G2U = 0.01;
/** Flip true when G2U token marketplace is ready post-launch */
const G2U_MARKET_ENABLED = false;
/** Same fee treasury as premium shop */
const TREASURY_SOL = "8G7uEcPS6dwA5wW9bGoqi98EzBunF8trjbbFJkgkvBPm";

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

function round9(n: number) {
  return Math.round(n * 1e9) / 1e9;
}

function feeSplit(gross: number) {
  const g = Math.max(0, Number(gross) || 0);
  const fee = round9((g * FEE_BPS) / 10000);
  const net = round9(g - fee);
  return { fee, net, gross: g };
}

function itemIdForTier(tier: string): string {
  return BADGE_ITEM[tier] || (tier === "shard" ? "shard_badge" : `badge_${tier}`);
}

/** Shard badges equipped on Fate sockets (cannot list while equipped). */
function countEquippedShard(inv: Record<string, unknown>): number {
  const map = inv.fate_equip;
  if (!map || typeof map !== "object") return 0;
  let n = 0;
  for (const row of Object.values(map as Record<string, unknown>)) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const itemId = String(r.itemId || r.item_id || "").toLowerCase();
    const tier = String(r.tier || "").toLowerCase();
    if (itemId === "shard_badge" || tier === "shard" || tier === "shard_badge") n += 1;
  }
  return n;
}

function freeQtyForTier(inv: Record<string, unknown>, tier: string, itemId: string): number {
  const owned = Math.max(0, Math.floor(Number(inv[itemId]) || 0));
  if (tier === "shard") {
    return Math.max(0, owned - countEquippedShard(inv));
  }
  return owned;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const username = String(claims.username || "");
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || body.op || "browse").toLowerCase();
    const sb = adminClient();

    // ---------- BROWSE ----------
    if (action === "browse" || action === "list_active") {
      const tier = body.tier ? String(body.tier).toLowerCase() : null;
      const currency = body.currency ? String(body.currency).toLowerCase() : null;
      let q = sb
        .from("badge_market_listings")
        .select(
          "id, seller_id, seller_username, tier, qty, currency, unit_price, status, created_at",
        )
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(100);
      if (tier && TIERS.has(tier)) q = q.eq("tier", tier);
      if (currency && CURRENCIES.has(currency)) q = q.eq("currency", currency);
      const { data, error } = await q;
      if (error) throw error;
      // Attach seller game wallets for SOL listings (buyer pays 95% there)
      const rows = data || [];
      const sellerIds = [
        ...new Set(
          rows
            .filter((r) => r.currency === "sol")
            .map((r) => String(r.seller_id)),
        ),
      ];
      let walletById: Record<string, string> = {};
      if (sellerIds.length) {
        const { data: sellers } = await sb
          .from("players")
          .select("telegram_id, wallet_address")
          .in("telegram_id", sellerIds);
        for (const s of sellers || []) {
          if (s.wallet_address) {
            walletById[String(s.telegram_id)] = String(s.wallet_address);
          }
        }
      }
      const listings = rows.map((r) => ({
        ...r,
        seller_wallet:
          r.currency === "sol" ? walletById[String(r.seller_id)] || null : null,
      }));
      return jsonResponse({
        success: true,
        listings,
        fee_bps: FEE_BPS,
        treasury_sol: TREASURY_SOL,
      });
    }

    // ---------- MY LISTINGS ----------
    if (action === "my_listings") {
      const { data, error } = await sb
        .from("badge_market_listings")
        .select("*")
        .eq("seller_id", playerId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return jsonResponse({ success: true, listings: data || [], fee_bps: FEE_BPS });
    }

    // ---------- LIST (SELL) ----------
    if (action === "list" || action === "sell") {
      const tier = String(body.tier || "").toLowerCase();
      const qty = Math.floor(Number(body.qty) || 0);
      const currency = String(body.currency || "sol").toLowerCase();
      const unit_price = Number(body.unit_price ?? body.price) || 0;

      if (!TIERS.has(tier)) throw new Error("Invalid tier (bronze|silver|gold|diamond|shard)");
      if (qty < 1) throw new Error("Quantity must be at least 1");
      if (currency === "shards" || currency === "g2ushards") {
        throw new Error("G2Ushards are not used on the badge market. Use SOL (G2U token after launch).");
      }
      if (!CURRENCIES.has(currency)) throw new Error("Currency must be sol or g2u");
      if (currency === "g2u" && !G2U_MARKET_ENABLED) {
        throw new Error("G2U badge market opens after launch. List in SOL for now.");
      }
      if (currency === "sol" && unit_price < MIN_SOL) {
        throw new Error(`Min price ${MIN_SOL} SOL`);
      }
      if (currency === "g2u" && unit_price < MIN_G2U) {
        throw new Error(`Min price ${MIN_G2U} G2U`);
      }

      const { data: row, error: selErr } = await sb
        .from("players")
        .select("inventory, username, wallet_address, shard_balance")
        .eq("telegram_id", playerId)
        .maybeSingle();
      if (selErr) throw selErr;
      if (!row) throw new Error("Player not found");

      if (currency === "sol") {
        const w = String(row.wallet_address || "").trim();
        if (w.length < 32) {
          throw new Error("Link a game wallet before listing for SOL");
        }
      }

      const inv = invObj(row.inventory);
      const itemId = itemIdForTier(tier);
      const have = freeQtyForTier(inv, tier, itemId);
      if (have < qty) {
        throw new Error(
          tier === "shard"
            ? `Not enough free Shard Badges (free ${have}, need ${qty} — unequip from Fate first)`
            : `Not enough ${tier} badges (have ${have}, need ${qty})`,
        );
      }

      // Escrow: remove from backpack
      const left = have - qty;
      if (left <= 0) delete inv[itemId];
      else inv[itemId] = left;

      const { data: listing, error: insErr } = await sb
        .from("badge_market_listings")
        .insert({
          seller_id: playerId,
          seller_username: row.username || username || null,
          tier,
          qty,
          currency,
          unit_price: round9(unit_price),
          status: "active",
        })
        .select("*")
        .maybeSingle();
      if (insErr) throw insErr;

      const { error: upErr } = await sb
        .from("players")
        .update({ inventory: inv, last_updated: new Date().toISOString() })
        .eq("telegram_id", playerId);
      if (upErr) {
        // rollback listing
        if (listing?.id) {
          await sb.from("badge_market_listings").delete().eq("id", listing.id);
        }
        throw upErr;
      }

      await logEconomy(sb, {
        player_id: playerId,
        kind: "badge_market_list",
        delta: 0,
        ref: listing?.id || null,
        meta: { tier, qty, currency, unit_price },
      });

      return jsonResponse({
        success: true,
        listing,
        inventory: inv,
        fee_bps: FEE_BPS,
      });
    }

    // ---------- CANCEL ----------
    if (action === "cancel") {
      const listingId = String(body.listing_id || body.id || "").trim();
      if (!listingId) throw new Error("listing_id required");

      const { data: listing, error: lErr } = await sb
        .from("badge_market_listings")
        .select("*")
        .eq("id", listingId)
        .maybeSingle();
      if (lErr) throw lErr;
      if (!listing) throw new Error("Listing not found");
      if (listing.seller_id !== playerId) throw new Error("Not your listing");
      if (listing.status !== "active") throw new Error("Listing is not active");

      const { data: row, error: selErr } = await sb
        .from("players")
        .select("inventory")
        .eq("telegram_id", playerId)
        .maybeSingle();
      if (selErr) throw selErr;
      if (!row) throw new Error("Player not found");

      const inv = invObj(row.inventory);
      const itemId = itemIdForTier(String(listing.tier));
      const qty = Math.floor(Number(listing.qty) || 0);
      inv[itemId] = (Math.floor(Number(inv[itemId]) || 0) || 0) + qty;

      const { error: markErr } = await sb
        .from("badge_market_listings")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", listingId)
        .eq("status", "active");
      if (markErr) throw markErr;

      const { error: upErr } = await sb
        .from("players")
        .update({ inventory: inv, last_updated: new Date().toISOString() })
        .eq("telegram_id", playerId);
      if (upErr) throw upErr;

      await logEconomy(sb, {
        player_id: playerId,
        kind: "badge_market_cancel",
        ref: listingId,
        meta: { tier: listing.tier, qty },
      });

      return jsonResponse({ success: true, inventory: inv, listing_id: listingId });
    }

    // ---------- BUY ----------
    if (action === "buy") {
      const listingId = String(body.listing_id || body.id || "").trim();
      const txSignature = String(body.tx_signature || body.signature || "").trim();
      if (!listingId) throw new Error("listing_id required");

      const { data: listing, error: lErr } = await sb
        .from("badge_market_listings")
        .select("*")
        .eq("id", listingId)
        .maybeSingle();
      if (lErr) throw lErr;
      if (!listing) throw new Error("Listing not found");
      if (listing.status !== "active") throw new Error("Listing is not active");
      if (listing.seller_id === playerId) throw new Error("Cannot buy your own listing");

      const tier = String(listing.tier);
      const qty = Math.floor(Number(listing.qty) || 0);
      const currency = String(listing.currency);
      const unit = Number(listing.unit_price) || 0;
      const gross = round9(unit * qty);
      const { fee, net } = feeSplit(gross);
      const itemId = itemIdForTier(tier);

      if (currency === "shards" || currency === "g2ushards") {
        throw new Error("G2Ushards are not used on the badge market");
      }
      if (currency === "g2u" && !G2U_MARKET_ENABLED) {
        throw new Error("G2U badge market opens after launch. Buy with SOL for now.");
      }

      // Idempotent SOL settle by signature
      if (currency === "sol" && txSignature) {
        const { data: prior } = await sb
          .from("badge_market_listings")
          .select("id, status, buyer_id")
          .eq("tx_signature", txSignature)
          .maybeSingle();
        if (prior && prior.status === "sold") {
          const { data: p } = await sb
            .from("players")
            .select("inventory, shard_balance")
            .eq("telegram_id", playerId)
            .maybeSingle();
          return jsonResponse({
            success: true,
            already: true,
            inventory: p?.inventory || {},
            listing_id: prior.id,
          });
        }
      }

      const { data: buyer, error: bErr } = await sb
        .from("players")
        .select("inventory, shard_balance, gft_token_balance, username, wallet_address")
        .eq("telegram_id", playerId)
        .maybeSingle();
      if (bErr) throw bErr;
      if (!buyer) throw new Error("Buyer not found");

      const { data: seller, error: sErr } = await sb
        .from("players")
        .select("inventory, shard_balance, gft_token_balance, username, wallet_address")
        .eq("telegram_id", listing.seller_id)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!seller) throw new Error("Seller not found");

      // G2U token credit path (post-launch) — uses gft_token_balance, NOT G2Ushards
      if (currency === "g2u") {
        const bal = Number(buyer.gft_token_balance) || 0;
        if (bal + 1e-9 < gross) {
          throw new Error(`Not enough G2U (need ${gross}, have ${bal})`);
        }
        const buyerNext = round9(bal - gross);
        const sellerNext = round9((Number(seller.gft_token_balance) || 0) + net);

        const { data: soldRow, error: soldErr } = await sb
          .from("badge_market_listings")
          .update({
            status: "sold",
            sold_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            buyer_id: playerId,
            buyer_username: buyer.username || username || null,
            gross_amount: gross,
            fee_amount: fee,
            seller_net: net,
          })
          .eq("id", listingId)
          .eq("status", "active")
          .select("id")
          .maybeSingle();
        if (soldErr) throw soldErr;
        if (!soldRow) throw new Error("Listing already sold or cancelled");

        const buyerInv = invObj(buyer.inventory);
        buyerInv[itemId] = (Math.floor(Number(buyerInv[itemId]) || 0) || 0) + qty;

        const { error: ub } = await sb
          .from("players")
          .update({
            gft_token_balance: buyerNext,
            inventory: buyerInv,
            last_updated: new Date().toISOString(),
          })
          .eq("telegram_id", playerId);
        if (ub) throw ub;

        const { error: us } = await sb
          .from("players")
          .update({
            gft_token_balance: sellerNext,
            last_updated: new Date().toISOString(),
          })
          .eq("telegram_id", listing.seller_id);
        if (us) throw us;

        const { data: treas } = await sb
          .from("badge_market_treasury")
          .select("g2u_balance")
          .eq("id", 1)
          .maybeSingle();
        const tNext = round9((Number(treas?.g2u_balance) || 0) + fee);
        await sb.from("badge_market_treasury").upsert({
          id: 1,
          g2u_balance: tNext,
          updated_at: new Date().toISOString(),
        });

        await logEconomy(sb, {
          player_id: playerId,
          kind: "badge_market_buy_g2u",
          delta: -gross,
          balance_after: buyerNext,
          ref: listingId,
          meta: { tier, qty, currency: "g2u", fee, net, seller_id: listing.seller_id },
        });
        await logEconomy(sb, {
          player_id: listing.seller_id,
          kind: "badge_market_sell_g2u",
          delta: net,
          balance_after: sellerNext,
          ref: listingId,
          meta: { tier, qty, currency: "g2u", fee, buyer_id: playerId },
        });

        return jsonResponse({
          success: true,
          currency: "g2u",
          gross,
          fee,
          seller_net: net,
          inventory: buyerInv,
          gft_token_balance: buyerNext,
          listing_id: listingId,
        });
      }

      // SOL path — on-chain payment required
      if (currency === "sol") {
        if (!txSignature || txSignature.length < 32) {
          throw new Error("tx_signature required for SOL purchases");
        }
        const sellerWallet = String(seller.wallet_address || "").trim();
        if (sellerWallet.length < 32) {
          throw new Error("Seller has no game wallet for SOL payout");
        }

        // Optional RPC verify (same soft approach as premium-grant)
        const rpc =
          Deno.env.get("SOLANA_RPC_URL") ||
          Deno.env.get("VITE_SOLANA_RPC_URL") ||
          "";
        if (rpc) {
          try {
            const res = await fetch(rpc, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "getTransaction",
                params: [
                  txSignature,
                  { encoding: "json", maxSupportedTransactionVersion: 0 },
                ],
              }),
            });
            const j = await res.json();
            const tx = j?.result;
            if (tx?.meta?.err) throw new Error("On-chain transaction failed");
          } catch (e) {
            if (e instanceof Error && e.message.includes("failed")) throw e;
            console.warn("badge-market sol verify skip", e);
          }
        }

        const { data: soldRow, error: soldErr } = await sb
          .from("badge_market_listings")
          .update({
            status: "sold",
            sold_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            buyer_id: playerId,
            buyer_username: buyer.username || username || null,
            tx_signature: txSignature,
            gross_amount: gross,
            fee_amount: fee,
            seller_net: net,
          })
          .eq("id", listingId)
          .eq("status", "active")
          .select("id")
          .maybeSingle();
        if (soldErr) throw soldErr;
        if (!soldRow) throw new Error("Listing already sold or cancelled");

        const buyerInv = invObj(buyer.inventory);
        buyerInv[itemId] = (Math.floor(Number(buyerInv[itemId]) || 0) || 0) + qty;

        const { error: ub } = await sb
          .from("players")
          .update({
            inventory: buyerInv,
            last_updated: new Date().toISOString(),
          })
          .eq("telegram_id", playerId);
        if (ub) throw ub;

        const { data: treas } = await sb
          .from("badge_market_treasury")
          .select("sol_fees_accounted")
          .eq("id", 1)
          .maybeSingle();
        const solFees = round9((Number(treas?.sol_fees_accounted) || 0) + fee);
        await sb.from("badge_market_treasury").upsert({
          id: 1,
          sol_fees_accounted: solFees,
          updated_at: new Date().toISOString(),
        });

        await logEconomy(sb, {
          player_id: playerId,
          kind: "badge_market_buy_sol",
          delta: 0,
          ref: txSignature,
          meta: {
            listing_id: listingId,
            tier,
            qty,
            gross,
            fee,
            net,
            seller_id: listing.seller_id,
            seller_wallet: sellerWallet,
            treasury: TREASURY_SOL,
          },
        });

        return jsonResponse({
          success: true,
          currency: "sol",
          gross,
          fee,
          seller_net: net,
          seller_wallet: sellerWallet,
          treasury_sol: TREASURY_SOL,
          inventory: buyerInv,
          listing_id: listingId,
          tx_signature: txSignature,
        });
      }

      throw new Error("Unsupported currency");
    }

    throw new Error("Unknown action (browse|my_listings|list|cancel|buy)");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /authenticated|expired|signature|Invalid session|Not authenticated/i.test(
      message,
    )
      ? 401
      : 400;
    return jsonResponse({ error: message }, status);
  }
});
