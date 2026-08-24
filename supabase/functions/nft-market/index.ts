/**
 * In-game NFT marketplace (GiftLocksmith / owned Core NFTs).
 * Actions: browse | list | cancel | buy | complete | my_listings
 *
 * Currency: sol (live) · g2u after launch (not G2Ushards)
 * Fee: 5% treasury
 *
 * Flow:
 *  1) list — seller creates listing (must still own asset on-chain)
 *  2) buy  — buyer pays SOL 95% seller + 5% treasury → status paid
 *  3) complete — seller transfers NFT on-chain to buyer_wallet, reports sig → sold
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  logEconomy,
} from "../_shared/economy.ts";

const FEE_BPS = 500;
const MIN_SOL = 0.01;
const MIN_G2U = 0.01;
const G2U_MARKET_ENABLED = false;
const TREASURY_SOL = "8G7uEcPS6dwA5wW9bGoqi98EzBunF8trjbbFJkgkvBPm";
const LOCKSMITH_COLLECTION = "FQPYWSohCPnS57W2AWAqwmQM21KRxGi4YXcCaiXUghPD";
const LOCKSMITH_TEST = "Fsx9L4oS9pG4P4t338DwUtQpLX7oQTsxgGvK1JmTe3Tt";

function round9(n: number) {
  return Math.round(n * 1e9) / 1e9;
}

function feeSplit(gross: number) {
  const g = Math.max(0, Number(gross) || 0);
  const fee = round9((g * FEE_BPS) / 10000);
  const net = round9(g - fee);
  return { fee, net, gross: g };
}

async function fetchAssetOwner(assetId: string): Promise<string | null> {
  const rpc =
    Deno.env.get("SOLANA_RPC_URL") ||
    Deno.env.get("VITE_SOLANA_RPC_URL") ||
    "";
  if (!rpc) return null;
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "nft-owner",
        method: "getAsset",
        params: { id: assetId },
      }),
    });
    const j = await res.json();
    const owner = j?.result?.ownership?.owner || j?.result?.owner;
    return owner ? String(owner) : null;
  } catch {
    return null;
  }
}

function isAllowedAsset(assetId: string, collection?: string | null) {
  const id = String(assetId || "");
  if (id === LOCKSMITH_TEST) return true;
  if (collection && String(collection) === LOCKSMITH_COLLECTION) return true;
  // Allow if collection unknown but looks like pubkey (DAS may omit) — still require ownership match
  return id.length >= 32;
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
    const action = String(body.action || "browse").toLowerCase();
    const sb = adminClient();

    // ---------- BROWSE ----------
    if (action === "browse") {
      const { data, error } = await sb
        .from("nft_market_listings")
        .select(
          "id, seller_id, seller_username, seller_wallet, asset_id, collection, name, image_url, currency, price, status, created_at",
        )
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return jsonResponse({
        success: true,
        listings: data || [],
        fee_bps: FEE_BPS,
        treasury_sol: TREASURY_SOL,
      });
    }

    // ---------- MY LISTINGS ----------
    if (action === "my_listings") {
      const { data, error } = await sb
        .from("nft_market_listings")
        .select("*")
        .eq("seller_id", playerId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      // Also listings where I need to receive / or I paid and wait
      const { data: asBuyer } = await sb
        .from("nft_market_listings")
        .select("*")
        .eq("buyer_id", playerId)
        .in("status", ["paid", "sold"])
        .order("updated_at", { ascending: false })
        .limit(20);
      return jsonResponse({
        success: true,
        listings: data || [],
        as_buyer: asBuyer || [],
        fee_bps: FEE_BPS,
      });
    }

    // ---------- LIST ----------
    if (action === "list") {
      const assetId = String(body.asset_id || body.assetId || "").trim();
      const sellerWallet = String(body.seller_wallet || body.wallet || "").trim();
      const currency = String(body.currency || "sol").toLowerCase();
      const price = Number(body.price || body.unit_price) || 0;
      const name = body.name ? String(body.name).slice(0, 120) : "GiftLocksmith";
      const image_url = body.image_url || body.image || null;
      const collection = body.collection
        ? String(body.collection)
        : LOCKSMITH_COLLECTION;

      if (assetId.length < 32) throw new Error("asset_id required");
      if (sellerWallet.length < 32) throw new Error("seller_wallet required");
      if (currency === "shards" || currency === "g2ushards") {
        throw new Error("G2Ushards not used. Use SOL (G2U after launch).");
      }
      if (currency === "g2u" && !G2U_MARKET_ENABLED) {
        throw new Error("G2U NFT market opens after launch. List in SOL.");
      }
      if (currency !== "sol" && currency !== "g2u") {
        throw new Error("Currency must be sol or g2u");
      }
      if (currency === "sol" && price < MIN_SOL) {
        throw new Error(`Min price ${MIN_SOL} SOL`);
      }
      if (currency === "g2u" && price < MIN_G2U) {
        throw new Error(`Min price ${MIN_G2U} G2U`);
      }
      if (!isAllowedAsset(assetId, collection)) {
        throw new Error("Only Gift2u / Locksmith NFTs can be listed");
      }

      // Ownership check via DAS when RPC available
      const owner = await fetchAssetOwner(assetId);
      if (owner && owner !== sellerWallet) {
        throw new Error("You do not own this NFT on-chain");
      }

      // Seller wallet must match account
      const { data: row, error: selErr } = await sb
        .from("players")
        .select("username, wallet_address, inventory")
        .eq("telegram_id", playerId)
        .maybeSingle();
      if (selErr) throw selErr;
      if (!row) throw new Error("Player not found");
      const acctWallet = String(row.wallet_address || "").trim();
      if (acctWallet && acctWallet !== sellerWallet) {
        throw new Error("seller_wallet must match your game wallet");
      }

      // Mining elves: durability must be 100% before list/sell
      {
        const inv =
          row.inventory && typeof row.inventory === "object"
            ? (row.inventory as Record<string, unknown>)
            : {};
        const actives = [
          inv.echo_active,
          inv.fate_power,
          inv.rush_active,
          inv.shadow_active,
        ];
        for (const raw of actives) {
          if (!raw || typeof raw !== "object") continue;
          const a = raw as Record<string, unknown>;
          const aid = String(a.asset_id || a.assetId || "");
          if (aid && aid === assetId) {
            const dur =
              a.durability === undefined || a.durability === null
                ? 100
                : Number(a.durability);
            if (Number.isFinite(dur) && dur + 1e-9 < 100) {
              throw new Error(
                "Reload durability to 100% before selling this NFT",
              );
            }
          }
        }
      }

      // Cancel if already active on this asset
      const { data: existing } = await sb
        .from("nft_market_listings")
        .select("id, status")
        .eq("asset_id", assetId)
        .in("status", ["active", "paid"])
        .maybeSingle();
      if (existing) {
        throw new Error("This NFT is already listed or awaiting transfer");
      }

      const { data: listing, error: insErr } = await sb
        .from("nft_market_listings")
        .insert({
          seller_id: playerId,
          seller_username: row.username || username || null,
          seller_wallet: sellerWallet,
          asset_id: assetId,
          collection,
          name,
          image_url,
          currency,
          price: round9(price),
          status: "active",
        })
        .select("*")
        .maybeSingle();
      if (insErr) throw insErr;

      await logEconomy(sb, {
        player_id: playerId,
        kind: "nft_market_list",
        ref: listing?.id,
        meta: { asset_id: assetId, price, currency },
      });

      return jsonResponse({
        success: true,
        listing,
        fee_bps: FEE_BPS,
        treasury_sol: TREASURY_SOL,
      });
    }

    // ---------- CANCEL ----------
    if (action === "cancel") {
      const listingId = String(body.listing_id || body.id || "").trim();
      if (!listingId) throw new Error("listing_id required");
      const { data: listing, error } = await sb
        .from("nft_market_listings")
        .select("*")
        .eq("id", listingId)
        .maybeSingle();
      if (error) throw error;
      if (!listing) throw new Error("Listing not found");
      if (listing.seller_id !== playerId) throw new Error("Not your listing");
      if (listing.status !== "active") {
        throw new Error("Only active listings can be cancelled (paid sales must complete transfer)");
      }
      const { error: up } = await sb
        .from("nft_market_listings")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", listingId)
        .eq("status", "active");
      if (up) throw up;
      await logEconomy(sb, {
        player_id: playerId,
        kind: "nft_market_cancel",
        ref: listingId,
      });
      return jsonResponse({ success: true, listing_id: listingId });
    }

    // ---------- BUY (pay) ----------
    if (action === "buy") {
      const listingId = String(body.listing_id || body.id || "").trim();
      const buyerWallet = String(body.buyer_wallet || body.wallet || "").trim();
      const txSignature = String(body.tx_signature || body.signature || "").trim();
      if (!listingId) throw new Error("listing_id required");
      if (buyerWallet.length < 32) throw new Error("buyer_wallet required");

      const { data: listing, error } = await sb
        .from("nft_market_listings")
        .select("*")
        .eq("id", listingId)
        .maybeSingle();
      if (error) throw error;
      if (!listing) throw new Error("Listing not found");
      if (listing.status !== "active") throw new Error("Listing is not active");
      if (listing.seller_id === playerId) throw new Error("Cannot buy your own NFT");

      const currency = String(listing.currency);
      if (currency === "g2u" && !G2U_MARKET_ENABLED) {
        throw new Error("G2U NFT market opens after launch");
      }
      if (currency !== "sol") throw new Error("Only SOL purchases are live");

      if (!txSignature || txSignature.length < 32) {
        throw new Error("tx_signature required for SOL purchase");
      }

      // Idempotent by pay tx
      const { data: prior } = await sb
        .from("nft_market_listings")
        .select("id, status, buyer_id")
        .eq("pay_tx_signature", txSignature)
        .maybeSingle();
      if (prior) {
        return jsonResponse({
          success: true,
          already: true,
          listing_id: prior.id,
          status: prior.status,
        });
      }

      // Seller still owns NFT?
      const owner = await fetchAssetOwner(String(listing.asset_id));
      if (owner && owner !== String(listing.seller_wallet)) {
        await sb
          .from("nft_market_listings")
          .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", listingId)
          .eq("status", "active");
        throw new Error("Seller no longer owns this NFT — listing cancelled");
      }

      const gross = round9(Number(listing.price) || 0);
      const { fee, net } = feeSplit(gross);

      // Soft RPC check
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
          if (j?.result?.meta?.err) throw new Error("On-chain payment failed");
        } catch (e) {
          if (e instanceof Error && e.message.includes("failed")) throw e;
        }
      }

      const { data: buyerRow } = await sb
        .from("players")
        .select("username, wallet_address")
        .eq("telegram_id", playerId)
        .maybeSingle();

      const { data: sold, error: soldErr } = await sb
        .from("nft_market_listings")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          buyer_id: playerId,
          buyer_username: buyerRow?.username || username || null,
          buyer_wallet: buyerWallet,
          pay_tx_signature: txSignature,
          gross_amount: gross,
          fee_amount: fee,
          seller_net: net,
        })
        .eq("id", listingId)
        .eq("status", "active")
        .select("*")
        .maybeSingle();
      if (soldErr) throw soldErr;
      if (!sold) throw new Error("Listing already sold or cancelled");

      await logEconomy(sb, {
        player_id: playerId,
        kind: "nft_market_buy_pay",
        ref: txSignature,
        meta: {
          listing_id: listingId,
          asset_id: listing.asset_id,
          gross,
          fee,
          net,
          seller_id: listing.seller_id,
        },
      });

      return jsonResponse({
        success: true,
        status: "paid",
        listing: sold,
        fee,
        seller_net: net,
        message:
          "Payment received. Seller must complete the NFT transfer to your game wallet.",
        treasury_sol: TREASURY_SOL,
      });
    }

    // ---------- COMPLETE (seller transfers NFT, then confirms) ----------
    if (action === "complete") {
      const listingId = String(body.listing_id || body.id || "").trim();
      const transferTx = String(
        body.transfer_tx_signature || body.tx_signature || "",
      ).trim();
      if (!listingId) throw new Error("listing_id required");

      const { data: listing, error } = await sb
        .from("nft_market_listings")
        .select("*")
        .eq("id", listingId)
        .maybeSingle();
      if (error) throw error;
      if (!listing) throw new Error("Listing not found");
      if (listing.seller_id !== playerId) {
        throw new Error("Only the seller can complete the NFT transfer");
      }
      if (listing.status !== "paid") {
        throw new Error("Listing is not awaiting transfer (status must be paid)");
      }
      const buyerWallet = String(listing.buyer_wallet || "").trim();
      if (buyerWallet.length < 32) throw new Error("Missing buyer wallet on listing");

      // Prefer on-chain ownership proof
      const owner = await fetchAssetOwner(String(listing.asset_id));
      if (owner && owner !== buyerWallet) {
        throw new Error(
          `NFT not yet in buyer wallet (owner=${owner.slice(0, 6)}…). Transfer first, then complete.`,
        );
      }
      if (!owner && (!transferTx || transferTx.length < 32)) {
        throw new Error("transfer_tx_signature required when ownership cannot be verified");
      }

      const { data: done, error: doneErr } = await sb
        .from("nft_market_listings")
        .update({
          status: "sold",
          sold_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          transfer_tx_signature: transferTx || listing.transfer_tx_signature,
        })
        .eq("id", listingId)
        .eq("status", "paid")
        .select("*")
        .maybeSingle();
      if (doneErr) throw doneErr;
      if (!done) throw new Error("Could not complete sale");

      await logEconomy(sb, {
        player_id: playerId,
        kind: "nft_market_complete",
        ref: listingId,
        meta: {
          asset_id: listing.asset_id,
          buyer_id: listing.buyer_id,
          transfer_tx: transferTx || null,
        },
      });

      return jsonResponse({ success: true, listing: done, status: "sold" });
    }

    throw new Error("Unknown action (browse|list|cancel|buy|complete|my_listings)");
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
