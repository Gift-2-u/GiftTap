/**
 * Seal Metaplex Core asset royalties so Solscan/DAS show 5% + creator.
 * Core Candy Machine mintV1 does not attach asset-level Royalties plugins;
 * collection 5% still enforces on marketplaces, but explorers need the asset plugin.
 *
 * Requires COLLECTION_AUTHORITY_SECRET (bs58 of collection update authority).
 */
import bs58 from "npm:bs58";
import { createUmi } from "npm:@metaplex-foundation/umi-bundle-defaults@1.5.1";
import {
  keypairIdentity,
  publicKey,
} from "npm:@metaplex-foundation/umi@1.5.1";
import {
  addPlugin,
  mplCore,
  ruleSet,
  updatePlugin,
} from "npm:@metaplex-foundation/mpl-core@1.10.0";

export const ELVES_COLLECTION =
  "FQPYWSohCPnS57W2AWAqwmQM21KRxGi4YXcCaiXUghPD";
export const ROYALTY_TREASURY =
  "AdvMvv6GzGvdLRtuxaso1Eubk7jmn6LCZEeEFHn22yeb";
export const ROYALTY_BPS = 500; // 5%

function env(name: string): string {
  return String(Deno.env.get(name) || "").trim();
}

function rpcUrl(): string {
  return (
    env("SOLANA_RPC_URL") ||
    env("VITE_SOLANA_RPC_URL") ||
    env("HELIUS_RPC_URL") ||
    ""
  );
}

function authoritySecretBytes(): Uint8Array {
  const s =
    env("COLLECTION_AUTHORITY_SECRET") ||
    env("NFT_UPDATE_AUTHORITY_SECRET") ||
    env("ELVES_UPDATE_AUTHORITY_SECRET");
  if (!s) {
    throw new Error(
      "COLLECTION_AUTHORITY_SECRET unset — cannot seal royalties on-chain",
    );
  }
  // JSON byte array or bs58
  if (s.startsWith("[")) {
    const arr = JSON.parse(s);
    if (!Array.isArray(arr)) throw new Error("Invalid keypair JSON");
    return Uint8Array.from(arr);
  }
  return bs58.decode(s);
}

async function dasGetAsset(assetId: string): Promise<Record<string, unknown>> {
  const rpc = rpcUrl();
  if (!rpc) throw new Error("SOLANA_RPC_URL unset");
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAsset",
      params: { id: assetId },
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result as Record<string, unknown>;
}

function assetRoyaltyBps(asset: Record<string, unknown>): number | null {
  const royalty = asset?.royalty as { basis_points?: number } | undefined;
  if (royalty?.basis_points != null) return Number(royalty.basis_points);
  const plugins = asset?.plugins as
    | { royalties?: { data?: { basis_points?: number } } }
    | undefined;
  if (plugins?.royalties?.data?.basis_points != null) {
    return Number(plugins.royalties.data.basis_points);
  }
  if (!plugins || Object.keys(plugins).length === 0) return null;
  if (!plugins.royalties) return null;
  return null;
}

function hasRoyaltiesPlugin(asset: Record<string, unknown>): boolean {
  const plugins = asset?.plugins as Record<string, unknown> | undefined;
  return !!(plugins && plugins.royalties);
}

function collectionIdOf(asset: Record<string, unknown>): string | null {
  const grouping = asset?.grouping as
    | Array<{ group_key?: string; group_value?: string }>
    | undefined;
  if (Array.isArray(grouping)) {
    const g = grouping.find((x) => x.group_key === "collection");
    if (g?.group_value) return String(g.group_value);
  }
  return null;
}

export type SealRoyaltiesResult = {
  ok: boolean;
  skipped?: boolean;
  already?: boolean;
  assetId: string;
  basisPoints: number;
  creator: string;
  collection: string | null;
  signature?: string;
  message?: string;
};

/**
 * Ensure asset has explicit 5% Royalties plugin (creator = treasury).
 * Idempotent if already at 500 bps with plugin.
 */
export async function sealAssetRoyalties(
  assetId: string,
): Promise<SealRoyaltiesResult> {
  const id = String(assetId || "").trim();
  if (id.length < 32) throw new Error("assetId required");

  const asset = await dasGetAsset(id);
  const collection = collectionIdOf(asset);
  const bps = assetRoyaltyBps(asset);
  const hasPlugin = hasRoyaltiesPlugin(asset);

  if (bps === ROYALTY_BPS && hasPlugin) {
    return {
      ok: true,
      skipped: true,
      already: true,
      assetId: id,
      basisPoints: ROYALTY_BPS,
      creator: ROYALTY_TREASURY,
      collection,
      message: "Already sealed at 5%",
    };
  }

  const rpc = rpcUrl();
  if (!rpc) throw new Error("SOLANA_RPC_URL unset");

  const umi = createUmi(rpc).use(mplCore());
  const secret = authoritySecretBytes();
  const kp = umi.eddsa.createKeypairFromSecretKey(secret);
  umi.use(keypairIdentity(kp));

  const treasuryPk = publicKey(ROYALTY_TREASURY);
  const plugin = {
    type: "Royalties" as const,
    basisPoints: ROYALTY_BPS,
    creators: [{ address: treasuryPk, percentage: 100 }],
    ruleSet: ruleSet("None"),
  };

  const collectionPk = publicKey(collection || ELVES_COLLECTION);
  let tx;
  if (hasPlugin) {
    tx = await updatePlugin(umi, {
      asset: publicKey(id),
      collection: collectionPk,
      plugin,
    }).sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
  } else {
    tx = await addPlugin(umi, {
      asset: publicKey(id),
      collection: collectionPk,
      plugin,
    }).sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
  }

  const signature =
    typeof tx.signature === "string"
      ? tx.signature
      : bs58.encode(tx.signature as Uint8Array);

  return {
    ok: true,
    assetId: id,
    basisPoints: ROYALTY_BPS,
    creator: ROYALTY_TREASURY,
    collection: collection || ELVES_COLLECTION,
    signature,
    message: "Sealed 5% royalties + creator on asset",
  };
}
