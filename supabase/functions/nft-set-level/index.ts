/**
 * nft-set-level — refresh on-chain metadata Level trait after a paid level-up.
 * Auth: player JWT. Update authority: NFT_UPDATE_AUTHORITY_SECRET (id.json byte array JSON).
 *
 * Body: { asset_id, level, kind?, rarity? }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requirePlayerFromRequest } from "../_shared/sessionJwt.ts";
import {
  adminClient,
  corsHeaders,
  jsonResponse,
  invObj,
} from "../_shared/economy.ts";
import { createUmi } from "npm:@metaplex-foundation/umi-bundle-defaults@1.4.1";
import {
  mplCore,
  fetchAsset,
  fetchCollection,
  updateV2,
} from "npm:@metaplex-foundation/mpl-core@1.7.0";
import { irysUploader } from "npm:@metaplex-foundation/umi-uploader-irys@1.5.0";
import {
  keypairIdentity,
  publicKey,
  some,
  none,
  transactionBuilder,
} from "npm:@metaplex-foundation/umi@1.4.1";
import {
  setComputeUnitLimit,
  setComputeUnitPrice,
} from "npm:@metaplex-foundation/mpl-toolbox@1.4.1";

const COLLECTION = "FQPYWSohCPnS57W2AWAqwmQM21KRxGi4YXcCaiXUghPD";

function loadAuthoritySecret(): Uint8Array {
  const raw = Deno.env.get("NFT_UPDATE_AUTHORITY_SECRET") ||
    Deno.env.get("SOLANA_AUTHORITY_KEYPAIR") ||
    "";
  if (!raw) {
    throw new Error(
      "NFT_UPDATE_AUTHORITY_SECRET not set (paste id.json byte array JSON)",
    );
  }
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[")) {
    throw new Error("Authority secret must be JSON byte array like ~/.config/solana/id.json");
  }
  return Uint8Array.from(JSON.parse(trimmed));
}

async function fetchJson(uri: string): Promise<Record<string, unknown>> {
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`Failed to fetch metadata ${res.status}`);
  return await res.json();
}

function patchLevel(
  meta: Record<string, unknown>,
  level: number,
): Record<string, unknown> {
  const attrs = Array.isArray(meta.attributes)
    ? [...(meta.attributes as unknown[])]
    : [];
  let found = false;
  const nextAttrs = attrs.map((a) => {
    if (!a || typeof a !== "object") return a;
    const row = { ...(a as Record<string, unknown>) };
    const t = String(row.trait_type || row.traitType || "").toLowerCase();
    if (t === "level" || t === "lvl" || t === "lv") {
      found = true;
      return { ...row, trait_type: "Level", value: String(level) };
    }
    return row;
  });
  if (!found) {
    nextAttrs.unshift({ trait_type: "Level", value: String(level) });
  }
  return { ...meta, attributes: nextAttrs };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const claims = await requirePlayerFromRequest(req);
    const playerId = String(claims.sub);
    const body = await req.json().catch(() => ({}));
    const assetId = String(body.asset_id || body.assetId || "").trim();
    const level = Math.floor(Number(body.level) || 0);
    if (!assetId || assetId.length < 32) throw new Error("asset_id required");
    if (level < 1 || level > 5) throw new Error("level must be 1..5");

    const sb = adminClient();
    const { data: row, error } = await sb
      .from("players")
      .select("inventory")
      .eq("telegram_id", playerId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Player not found");

    const inv = invObj(row.inventory);
    const map =
      inv.elf_levels && typeof inv.elf_levels === "object"
        ? (inv.elf_levels as Record<string, unknown>)
        : {};
    const starMap =
      inv.star_levels && typeof inv.star_levels === "object"
        ? (inv.star_levels as Record<string, unknown>)
        : {};
    const tracked = Math.max(
      Math.floor(Number(map[assetId]) || 0),
      Math.floor(Number(starMap[assetId]) || 0),
    );
    // Allow if inventory says this level (or higher from race)
    if (tracked < level) {
      throw new Error("Level not unlocked in game yet — level up in Backpack first");
    }

    const rpc =
      Deno.env.get("SOLANA_RPC_URL") ||
      Deno.env.get("VITE_SOLANA_RPC_URL") ||
      "https://api.mainnet-beta.solana.com";

    const secret = loadAuthoritySecret();
    const umi = createUmi(rpc)
      .use(mplCore())
      .use(irysUploader({ address: "https://node1.irys.xyz" }));
    umi.use(
      keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secret)),
    );

    const asset = await fetchAsset(umi, assetId);
    const currentUri = String(asset.uri || "");
    if (!currentUri) throw new Error("Asset has no metadata URI");

    const meta = await fetchJson(currentUri);
    const patched = patchLevel(meta, level);
    const newUri = await umi.uploader.uploadJson(patched);

    const collection = await fetchCollection(umi, COLLECTION);
    const tx = await transactionBuilder()
      .add(setComputeUnitLimit(umi, { units: 400_000 }))
      .add(setComputeUnitPrice(umi, { microLamports: 200_000 }))
      .add(
        updateV2(umi, {
          asset: publicKey(assetId),
          collection: collection.publicKey,
          newName: none(),
          newUri: some(newUri),
          authority: umi.identity,
          payer: umi.identity,
        }),
      )
      .sendAndConfirm(umi, {
        send: { skipPreflight: false },
        confirm: { commitment: "confirmed" },
      });

    const signature =
      typeof tx.signature === "string"
        ? tx.signature
        : // deno-lint-ignore no-explicit-any
          String((tx as any).signature || "");

    return jsonResponse({
      success: true,
      asset_id: assetId,
      level,
      metadata_uri: newUri,
      signature,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      /authenticated|expired|signature|Invalid session|Not authenticated/i.test(
          message,
        )
        ? 401
        : 400;
    return jsonResponse({ error: message }, status);
  }
});
