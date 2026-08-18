/**
 * Re-upload Shadow metadata (no AFK wording) and point CMs + minted assets at new URIs.
 * Keeps existing imageUri.
 *
 *   export CONFIRM_MAINNET=yes
 *   export RPC_URL=...
 *   node push-clean-metadata.mjs
 */
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  mplCore,
  fetchAsset,
  fetchCollection,
  updateV2,
} from "@metaplex-foundation/mpl-core";
import {
  mplCandyMachine,
  fetchCandyMachine,
  updateCandyMachine,
} from "@metaplex-foundation/mpl-core-candy-machine";
import {
  keypairIdentity,
  publicKey,
  some,
  none,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import {
  setComputeUnitPrice,
  setComputeUnitLimit,
} from "@metaplex-foundation/mpl-toolbox";
import bs58 from "bs58";
import { GIFT2U_ELVES_COLLECTION, SHADOW_RARITIES } from "./config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../../..");
const CONFIRM = (process.env.CONFIRM_MAINNET || "").toLowerCase();
const RPC_URL =
  process.env.RPC_URL ||
  process.env.VITE_SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";
const KEYPAIR_PATH =
  process.env.KEYPAIR_PATH ||
  path.join(os.homedir(), ".config", "solana", "id.json");

const RARITIES = ["common", "rare", "epic", "legendary"];

function sigOf(tx) {
  return typeof tx.signature === "string"
    ? tx.signature
    : bs58.encode(tx.signature);
}

async function retry(label, fn, tries = 4) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      console.warn(`  ${label} try ${i}:`, e?.message || e);
      if (i < tries) await new Promise((r) => setTimeout(r, 4000 * i));
    }
  }
  throw last;
}

async function dasShadowAssets(collection) {
  const out = [];
  let page = 1;
  for (;;) {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `shadow-${page}`,
        method: "getAssetsByGroup",
        params: {
          groupKey: "collection",
          groupValue: collection,
          page,
          limit: 1000,
        },
      }),
    });
    const json = await res.json();
    const items = json?.result?.items || [];
    for (const a of items) {
      const name = String(a?.content?.metadata?.name || "").toLowerCase();
      const attrs = a?.content?.metadata?.attributes || [];
      let isShadow = name === "shadow" || name.startsWith("shadow ");
      for (const at of attrs) {
        const t = String(at?.trait_type || "").toLowerCase();
        const v = String(at?.value || "").toLowerCase();
        if (t === "class" && v === "shadow") isShadow = true;
      }
      if (isShadow) out.push(a);
    }
    if (items.length < 1000) break;
    page += 1;
    if (page > 30) break;
  }
  return out;
}

function rarityFromAsset(asset) {
  const attrs = asset?.content?.metadata?.attributes || [];
  for (const a of attrs) {
    if (String(a?.trait_type || "").toLowerCase() === "rarity") {
      const v = String(a?.value || "").toLowerCase();
      if (RARITIES.includes(v)) return v;
    }
  }
  return "common";
}

async function main() {
  if (CONFIRM !== "yes") {
    console.error("Set CONFIRM_MAINNET=yes");
    process.exit(1);
  }

  const umi = createUmi(RPC_URL)
    .use(mplCore())
    .use(mplCandyMachine())
    .use(irysUploader({ address: "https://node1.irys.xyz" }));
  const secret = new Uint8Array(
    JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf8")),
  );
  umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secret)));
  console.log("Wallet:", umi.identity.publicKey.toString());

  const cmCfg = JSON.parse(
    fs.readFileSync(path.join(ROOT, "public/shadow-cm.json"), "utf8"),
  );
  const uploaded = {};

  for (const rarity of RARITIES) {
    const imageUri = cmCfg[rarity].imageUri;
    const meta = JSON.parse(
      fs.readFileSync(path.join(__dirname, `metadata-${rarity}.json`), "utf8"),
    );
    // strip any leftover AFK
    meta.description = String(meta.description || "")
      .replace(/AFK/gi, "daily claim")
      .replace(/daily claim daily claim/gi, "daily claim");
    for (const a of meta.attributes || []) {
      if (typeof a.value === "string" && /AFK/i.test(a.value)) {
        a.value = a.value.replace(/AFK/gi, "Daily claim").replace(/Daily claim daily claim/gi, "Daily claim");
      }
      if (a.trait_type === "Utility") a.value = "Daily claim share";
    }

    console.log(`\nUploading metadata ${rarity}…`);
    const itemUri = await retry(`meta:${rarity}`, () =>
      umi.uploader.uploadJson({
        ...meta,
        image: imageUri,
        attributes: [
          ...(meta.attributes || []),
          { trait_type: "Wave", value: "1" },
        ],
        properties: {
          category: "image",
          files: [{ uri: imageUri, type: "image/jpeg" }],
        },
      }),
    );
    console.log("  itemUri:", itemUri);
    uploaded[rarity] = { ...cmCfg[rarity], itemUri, imageUri };
  }

  for (const rarity of RARITIES) {
    const u = uploaded[rarity];
    const cmPk = publicKey(u.candyMachine);
    console.log(`\nUpdating CM ${rarity}: ${u.candyMachine}`);
    const cm = await fetchCandyMachine(umi, cmPk);
    const hash = crypto.createHash("sha256").update(u.itemUri).digest();
    const r = SHADOW_RARITIES[rarity];
    const builder = transactionBuilder()
      .add(setComputeUnitLimit(umi, { units: 400_000 }))
      .add(setComputeUnitPrice(umi, { microLamports: 200_000 }))
      .add(
        updateCandyMachine(umi, {
          candyMachine: cmPk,
          data: {
            itemsAvailable: Number(cm.data.itemsAvailable),
            maxEditionSupply: Number(cm.data.maxEditionSupply || 0),
            isMutable: true,
            configLineSettings: none(),
            hiddenSettings: some({
              name: `Shadow ${r.label} #$ID+1$`,
              uri: u.itemUri,
              hash,
            }),
          },
        }),
      );
    const tx = await builder.sendAndConfirm(umi, {
      send: { skipPreflight: false },
      confirm: { commitment: "confirmed" },
    });
    u.cmUpdateTx = sigOf(tx);
    console.log("  tx:", u.cmUpdateTx);
  }

  console.log("\nUpdating minted Shadow assets…");
  const assets = await dasShadowAssets(GIFT2U_ELVES_COLLECTION);
  console.log("Found", assets.length);
  const collection = await fetchCollection(umi, GIFT2U_ELVES_COLLECTION);
  const assetResults = [];
  for (const item of assets) {
    const id = item.id;
    const rarity = rarityFromAsset(item);
    const newUri = uploaded[rarity].itemUri;
    try {
      const before = await fetchAsset(umi, id);
      if (String(before.uri) === String(newUri)) {
        assetResults.push({ asset: id, rarity, skipped: true });
        continue;
      }
      const builder = transactionBuilder()
        .add(setComputeUnitLimit(umi, { units: 400_000 }))
        .add(setComputeUnitPrice(umi, { microLamports: 200_000 }))
        .add(
          updateV2(umi, {
            asset: publicKey(id),
            collection: collection.publicKey,
            newName: none(),
            newUri: some(newUri),
            authority: umi.identity,
            payer: umi.identity,
          }),
        );
      const tx = await builder.sendAndConfirm(umi, {
        send: { skipPreflight: false },
        confirm: { commitment: "confirmed" },
      });
      assetResults.push({ asset: id, rarity, signature: sigOf(tx), newUri });
      console.log("  updated", id, rarity);
    } catch (e) {
      console.error("  fail", id, e?.message || e);
      assetResults.push({ asset: id, rarity, error: String(e?.message || e) });
    }
  }

  const nextCm = {};
  for (const rarity of RARITIES) {
    nextCm[rarity] = {
      ...uploaded[rarity],
      metadataCleanedAt: new Date().toISOString(),
      copyVersion: "no-afk-v1",
    };
  }
  fs.writeFileSync(
    path.join(ROOT, "public/shadow-cm.json"),
    JSON.stringify(nextCm, null, 2) + "\n",
  );

  // patch wave1 result itemUris
  for (const rarity of RARITIES) {
    const rp = path.join(__dirname, `wave1-${rarity}-result.json`);
    if (!fs.existsSync(rp)) continue;
    const r = JSON.parse(fs.readFileSync(rp, "utf8"));
    r.itemUri = uploaded[rarity].itemUri;
    fs.writeFileSync(rp, JSON.stringify(r, null, 2));
  }

  fs.writeFileSync(
    path.join(__dirname, "push-clean-metadata-result.json"),
    JSON.stringify({ uploaded, assets: assetResults }, null, 2),
  );
  console.log("\nWrote public/shadow-cm.json");
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
