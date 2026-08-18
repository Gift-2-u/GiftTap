/**
 * Push locked socket art on-chain for Fate (old mints + future CM mints).
 *
 * 1) Upload Fate-{rarity}.jpg + metadata JSON → Irys
 * 2) Update each Wave-1 Candy Machine hiddenSettings.uri
 * 3) updateV2 every minted Fate Core asset URI to the new metadata
 * 4) Write public/fate-cm.json + patch src/fate.js imageUri
 *
 *   export CONFIRM_MAINNET=yes
 *   export RPC_URL="..."   # optional; defaults to VITE / mainnet
 *   node push-new-socket-art.mjs
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
  createGenericFile,
  keypairIdentity,
  publicKey,
  some,
  none,
} from "@metaplex-foundation/umi";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import {
  setComputeUnitPrice,
  setComputeUnitLimit,
} from "@metaplex-foundation/mpl-toolbox";
import { transactionBuilder } from "@metaplex-foundation/umi";
import bs58 from "bs58";
import { FATE_RARITIES, GIFT2U_ELVES_COLLECTION } from "./config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../../..");
const CONFIRM = (process.env.CONFIRM_MAINNET || "").toLowerCase();
const CLUSTER = process.env.CLUSTER || "mainnet";
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

function loadFateCm() {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, "public/fate-cm.json"), "utf8"),
  );
}

function loadMeta(rarityKey) {
  const p = path.join(__dirname, `metadata-${rarityKey}.json`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function isFateAsset(asset) {
  const name = String(asset?.content?.metadata?.name || asset?.name || "")
    .trim()
    .toLowerCase();
  if (name === "fate" || name.startsWith("fate ")) return true;
  const attrs = asset?.content?.metadata?.attributes || asset?.attributes || [];
  for (const a of attrs) {
    const t = String(a?.trait_type || a?.traitType || "").toLowerCase();
    const v = String(a?.value ?? "").toLowerCase();
    if (t === "class" && v === "fate") return true;
  }
  return false;
}

function rarityFromAsset(asset) {
  const attrs = asset?.content?.metadata?.attributes || [];
  for (const a of attrs) {
    const t = String(a?.trait_type || a?.traitType || "").toLowerCase();
    if (t === "rarity") {
      const v = String(a?.value || "").toLowerCase();
      if (RARITIES.includes(v)) return v;
    }
  }
  // name pattern Fate Common #1
  const name = String(asset?.content?.metadata?.name || "");
  for (const r of RARITIES) {
    if (name.toLowerCase().includes(r)) return r;
  }
  return "common";
}

async function dasGetAssetsByCollection(collection) {
  const out = [];
  let page = 1;
  for (;;) {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `fate-by-col-${page}`,
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
    out.push(...items);
    if (items.length < 1000) break;
    page += 1;
    if (page > 50) break;
  }
  return out;
}

async function main() {
  if (CLUSTER === "mainnet" && CONFIRM !== "yes") {
    console.error("Set CONFIRM_MAINNET=yes for mainnet.");
    process.exit(1);
  }

  const umi = createUmi(RPC_URL)
    .use(mplCore())
    .use(mplCandyMachine())
    .use(
      irysUploader({
        address:
          CLUSTER === "mainnet"
            ? "https://node1.irys.xyz"
            : "https://devnet.irys.xyz",
      }),
    );
  const secret = new Uint8Array(
    JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf8")),
  );
  umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secret)));
  console.log("Wallet:", umi.identity.publicKey.toString());
  console.log("RPC:", RPC_URL.slice(0, 48) + "…");

  const cmCfg = loadFateCm();
  const partialPath = path.join(__dirname, "push-socket-partial.json");
  const partial = fs.existsSync(partialPath)
    ? JSON.parse(fs.readFileSync(partialPath, "utf8"))
    : {};
  const uploaded = {};

  const savePartial = () => {
    const dump = { ...partial };
    for (const k of Object.keys(uploaded)) {
      dump[k] = {
        imageUri: uploaded[k].imageUri,
        itemUri: uploaded[k].itemUri,
      };
    }
    fs.writeFileSync(partialPath, JSON.stringify(dump, null, 2));
  };

  async function retry(label, fn, tries = 4) {
    let last;
    for (let attempt = 1; attempt <= tries; attempt++) {
      try {
        return await fn();
      } catch (e) {
        last = e;
        console.warn(`  ${label} attempt ${attempt} failed:`, e?.message || e);
        if (attempt < tries) {
          await new Promise((r) => setTimeout(r, 5000 * attempt));
        }
      }
    }
    throw last;
  }

  // ---------- 1) Upload art + metadata (resume from push-socket-partial.json) ----------
  for (const rarityKey of RARITIES) {
    const r = FATE_RARITIES[rarityKey];
    let imageUri = partial[rarityKey]?.imageUri;
    let itemUri = partial[rarityKey]?.itemUri;

    if (!imageUri) {
      const imgPath = path.join(ROOT, `public/nft/fate/Fate-${rarityKey}.jpg`);
      if (!fs.existsSync(imgPath)) throw new Error(`Missing ${imgPath}`);
      const buf = fs.readFileSync(imgPath);
      const imageFile = createGenericFile(buf, `Fate-${rarityKey}.jpg`, {
        contentType: "image/jpeg",
      });
      console.log(`\nUploading image ${rarityKey} (${buf.length} bytes)…`);
      [imageUri] = await retry(`image:${rarityKey}`, () =>
        umi.uploader.upload([imageFile]),
      );
      console.log("  imageUri:", imageUri);
      partial[rarityKey] = { ...(partial[rarityKey] || {}), imageUri };
      savePartial();
    } else {
      console.log(`\nReuse imageUri ${rarityKey}:`, imageUri);
    }

    if (!itemUri) {
      const metaTemplate = loadMeta(rarityKey);
      console.log(`  Uploading metadata ${rarityKey}…`);
      itemUri = await retry(`meta:${rarityKey}`, () =>
        umi.uploader.uploadJson({
          ...metaTemplate,
          image: imageUri,
          attributes: [
            ...(metaTemplate.attributes || []),
            { trait_type: "Wave", value: "1" },
            { trait_type: "Socket", value: "opaque-v145" },
          ],
          properties: {
            category: "image",
            files: [{ uri: imageUri, type: "image/jpeg" }],
          },
        }),
      );
      console.log("  itemUri:", itemUri);
      partial[rarityKey] = { imageUri, itemUri };
      savePartial();
    } else {
      console.log("  Reuse itemUri:", itemUri);
    }

    uploaded[rarityKey] = {
      label: r.label,
      imageUri,
      itemUri,
      candyMachine: cmCfg[rarityKey]?.candyMachine,
      candyGuard: cmCfg[rarityKey]?.candyGuard,
      itemsAvailable: cmCfg[rarityKey]?.itemsAvailable,
      priceSol: cmCfg[rarityKey]?.priceSol,
    };
  }

  // ---------- 2) Update CM hiddenSettings ----------
  for (const rarityKey of RARITIES) {
    const u = uploaded[rarityKey];
    const cmPk = publicKey(u.candyMachine);
    console.log(`\nUpdating CM hiddenSettings ${rarityKey}: ${u.candyMachine}`);
    const cm = await fetchCandyMachine(umi, cmPk);
    const hash = crypto.createHash("sha256").update(u.itemUri).digest();
    const itemsAvailable = Number(cm.data.itemsAvailable);
    const r = FATE_RARITIES[rarityKey];

    let builder = transactionBuilder()
      .add(setComputeUnitLimit(umi, { units: 400_000 }))
      .add(setComputeUnitPrice(umi, { microLamports: 200_000 }))
      .add(
        updateCandyMachine(umi, {
          candyMachine: cmPk,
          data: {
            itemsAvailable,
            maxEditionSupply: Number(cm.data.maxEditionSupply || 0),
            isMutable: true,
            configLineSettings: none(),
            hiddenSettings: some({
              name: `Fate ${r.label} #$ID+1$`,
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
    console.log("  CM update tx:", u.cmUpdateTx);
  }

  // ---------- 3) Update minted Fate assets ----------
  console.log("\nScanning collection for Fate assets…");
  const all = await dasGetAssetsByCollection(GIFT2U_ELVES_COLLECTION);
  const fateItems = all.filter(isFateAsset);
  console.log(`Found ${fateItems.length} Fate asset(s) of ${all.length} in collection`);

  // Always include OG common
  const known = new Set(fateItems.map((a) => a.id));
  const OG = "7aR6vPhkU4EKWwPFWf3UrdmZP9AGP4iFbn87vTYs8r19";
  if (!known.has(OG)) {
    fateItems.push({ id: OG, content: { metadata: { name: "Fate", attributes: [{ trait_type: "Rarity", value: "Common" }] } } });
  }

  const collection = await fetchCollection(umi, GIFT2U_ELVES_COLLECTION);
  const assetResults = [];

  for (const item of fateItems) {
    const assetId = item.id || item.mint;
    const rarityKey = rarityFromAsset(item);
    const newUri = uploaded[rarityKey].itemUri;
    console.log(`\nUpdating asset ${assetId} → ${rarityKey}`);
    try {
      const before = await fetchAsset(umi, assetId);
      if (String(before.uri) === String(newUri)) {
        console.log("  already on new URI, skip");
        assetResults.push({ asset: assetId, rarityKey, skipped: true });
        continue;
      }

      let builder = transactionBuilder()
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
        );

      const tx = await builder.sendAndConfirm(umi, {
        send: { skipPreflight: false },
        confirm: { commitment: "confirmed" },
      });
      const signature = sigOf(tx);
      console.log("  tx:", signature);
      assetResults.push({ asset: assetId, rarityKey, signature, newUri });
    } catch (e) {
      console.error("  FAILED:", e?.message || e);
      assetResults.push({
        asset: assetId,
        rarityKey,
        error: String(e?.message || e),
      });
    }
  }

  // ---------- 4) Write configs ----------
  const nextCm = {};
  for (const rarityKey of RARITIES) {
    const prev = cmCfg[rarityKey] || {};
    const u = uploaded[rarityKey];
    nextCm[rarityKey] = {
      ...prev,
      imageUri: u.imageUri,
      itemUri: u.itemUri,
      socketVersion: "opaque-v145",
      artUpdatedAt: new Date().toISOString(),
      cmUpdateTx: u.cmUpdateTx || null,
    };
  }
  fs.writeFileSync(
    path.join(ROOT, "public/fate-cm.json"),
    JSON.stringify(nextCm, null, 2) + "\n",
  );
  console.log("\nWrote public/fate-cm.json");

  // Patch fate.js imageUri strings
  let fateJs = fs.readFileSync(path.join(ROOT, "src/fate.js"), "utf8");
  for (const rarityKey of RARITIES) {
    const u = uploaded[rarityKey];
    // replace imageUri line inside each rarity block — match old irys or any https
    const re = new RegExp(
      `(imageUrl: '/nft/fate/Fate-${rarityKey}\\.jpg\\?v=socket145',[\\s\\S]*?imageUri:\\s*)'[^']+'`,
      "m",
    );
    if (re.test(fateJs)) {
      fateJs = fateJs.replace(re, `$1'${u.imageUri}'`);
    } else {
      // fallback: simpler replace of known gateway line after imageUrl for rarity
      const re2 = new RegExp(
        `(imageUrl: '/nft/fate/Fate-${rarityKey}\\.jpg[^']*',\\s*(?:/\\*[^*]*\\*/\\s*)?imageUri:\\s*)'[^']+'`,
      );
      if (re2.test(fateJs)) fateJs = fateJs.replace(re2, `$1'${u.imageUri}'`);
      else console.warn("Could not patch fate.js for", rarityKey);
    }
  }
  fs.writeFileSync(path.join(ROOT, "src/fate.js"), fateJs);
  console.log("Patched src/fate.js imageUri");

  const out = {
    at: new Date().toISOString(),
    socketVersion: "opaque-v145",
    uploaded,
    assets: assetResults,
  };
  const outPath = path.join(__dirname, "push-socket-art-result.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("\nResult:", outPath);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
