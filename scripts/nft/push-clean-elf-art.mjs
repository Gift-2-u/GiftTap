/**
 * Upload CLEAN elf art (no on-image socket hole) → Irys, update CMs + minted assets.
 *
 *   export CONFIRM_MAINNET=yes
 *   export RPC_URL=...
 *   node push-clean-elf-art.mjs              # all classes
 *   node push-clean-elf-art.mjs fate echo    # subset
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
  transactionBuilder,
} from "@metaplex-foundation/umi";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import {
  setComputeUnitPrice,
  setComputeUnitLimit,
} from "@metaplex-foundation/mpl-toolbox";
import bs58 from "bs58";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");
const CONFIRM = (process.env.CONFIRM_MAINNET || "").toLowerCase();
const CLUSTER = process.env.CLUSTER || "mainnet";
const RPC_URL =
  process.env.RPC_URL ||
  process.env.VITE_SOLANA_RPC_URL ||
  "https://mainnet.helius-rpc.com/?api-key=538f6c8f-c773-46a2-939c-6d48c75b2226";
const KEYPAIR_PATH =
  process.env.KEYPAIR_PATH ||
  path.join(os.homedir(), ".config", "solana", "id.json");

const COLLECTION = "FQPYWSohCPnS57W2AWAqwmQM21KRxGi4YXcCaiXUghPD";
const RARITIES = ["common", "rare", "epic", "legendary"];
const LABELS = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

const CLASSES = {
  fate: {
    key: "fate",
    title: "Fate",
    folder: "fate",
    scriptDir: "gift-fate",
    cmJson: "fate-cm.json",
    srcJs: "src/fate.js",
    filePrefix: "Fate",
    namePrefix: "Fate",
    ogAssets: ["7aR6vPhkU4EKWwPFWf3UrdmZP9AGP4iFbn87vTYs8r19"],
  },
  echo: {
    key: "echo",
    title: "Echo",
    folder: "echo",
    scriptDir: "gift-echo",
    cmJson: "echo-cm.json",
    srcJs: "src/echo.js",
    filePrefix: "Echo",
    namePrefix: "Echo",
    ogAssets: [],
  },
  rush: {
    key: "rush",
    title: "Rush",
    folder: "rush",
    scriptDir: "gift-rush",
    cmJson: "rush-cm.json",
    srcJs: "src/rush.js",
    filePrefix: "Rush",
    namePrefix: "Rush",
    ogAssets: [],
  },
  shadow: {
    key: "shadow",
    title: "Shadow",
    folder: "shadow",
    scriptDir: "gift-shadow",
    cmJson: "shadow-cm.json",
    srcJs: "src/shadow.js",
    filePrefix: "Shadow",
    namePrefix: "Shadow",
    ogAssets: [],
  },
};

function sigOf(tx) {
  return typeof tx.signature === "string"
    ? tx.signature
    : bs58.encode(tx.signature);
}

function isClassAsset(asset, cls) {
  const name = String(asset?.content?.metadata?.name || "")
    .trim()
    .toLowerCase();
  const p = cls.namePrefix.toLowerCase();
  if (name === p || name.startsWith(p + " ") || name.startsWith(p + " ·"))
    return true;
  const attrs = asset?.content?.metadata?.attributes || [];
  for (const a of attrs) {
    const t = String(a?.trait_type || "").toLowerCase();
    const v = String(a?.value || "").toLowerCase();
    if (t === "class" && (v === p || v.includes(p))) return true;
  }
  return false;
}

function rarityFromAsset(asset) {
  const attrs = asset?.content?.metadata?.attributes || [];
  for (const a of attrs) {
    const t = String(a?.trait_type || "").toLowerCase();
    if (t === "rarity") {
      const v = String(a?.value || "")
        .toLowerCase()
        .replace(/\s+/g, "");
      if (RARITIES.includes(v)) return v;
    }
  }
  const name = String(asset?.content?.metadata?.name || "").toLowerCase();
  for (const r of RARITIES) {
    if (name.includes(r)) return r;
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
        id: `clean-art-${page}`,
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

async function pushClass(umi, cls) {
  console.log(`\n========== ${cls.title} clean art ==========`);
  const cmPath = path.join(ROOT, "public", cls.cmJson);
  const cmCfg = JSON.parse(fs.readFileSync(cmPath, "utf8"));
  const partialPath = path.join(
    __dirname,
    cls.scriptDir,
    "push-clean-art-partial.json",
  );
  const partial = fs.existsSync(partialPath)
    ? JSON.parse(fs.readFileSync(partialPath, "utf8"))
    : {};
  // Force fresh uploads for this run (old partial may be socketed art)
  const forceFresh = process.env.FORCE_FRESH !== "0";

  const savePartial = (data) => {
    fs.writeFileSync(partialPath, JSON.stringify(data, null, 2));
  };

  const uploaded = {};

  for (const rarityKey of RARITIES) {
    let imageUri = !forceFresh ? partial[rarityKey]?.imageUri : null;
    let itemUri = !forceFresh ? partial[rarityKey]?.itemUri : null;

    if (!imageUri) {
      const imgPath = path.join(
        ROOT,
        `public/nft/${cls.folder}/${cls.filePrefix}-${rarityKey}.jpg`,
      );
      if (!fs.existsSync(imgPath)) throw new Error(`Missing ${imgPath}`);
      const buf = fs.readFileSync(imgPath);
      const imageFile = createGenericFile(
        buf,
        `${cls.filePrefix}-${rarityKey}.jpg`,
        { contentType: "image/jpeg" },
      );
      console.log(`\nUploading ${cls.key}/${rarityKey} (${buf.length} bytes)…`);
      [imageUri] = await retry(`image:${cls.key}:${rarityKey}`, () =>
        umi.uploader.upload([imageFile]),
      );
      console.log("  imageUri:", imageUri);
      partial[rarityKey] = { ...(partial[rarityKey] || {}), imageUri };
      savePartial(partial);
    } else {
      console.log(`Reuse image ${rarityKey}:`, imageUri);
    }

    if (!itemUri) {
      const metaPath = path.join(
        __dirname,
        cls.scriptDir,
        `metadata-${rarityKey}.json`,
      );
      const metaTemplate = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      const attrs = (metaTemplate.attributes || []).filter((a) => {
        const t = String(a?.trait_type || "").toLowerCase();
        return t !== "socket" && t !== "badge socket";
      });
      attrs.push({ trait_type: "Wave", value: "1" });
      attrs.push({ trait_type: "Level", value: "1" });
      console.log(`  Uploading metadata ${rarityKey}…`);
      itemUri = await retry(`meta:${cls.key}:${rarityKey}`, () =>
        umi.uploader.uploadJson({
          ...metaTemplate,
          image: imageUri,
          attributes: attrs,
          properties: {
            category: "image",
            files: [{ uri: imageUri, type: "image/jpeg" }],
          },
        }),
      );
      console.log("  itemUri:", itemUri);
      partial[rarityKey] = { imageUri, itemUri };
      savePartial(partial);
    } else {
      console.log("  Reuse itemUri:", itemUri);
    }

    uploaded[rarityKey] = {
      imageUri,
      itemUri,
      candyMachine: cmCfg[rarityKey]?.candyMachine,
      candyGuard: cmCfg[rarityKey]?.candyGuard,
    };
  }

  // Update CMs
  for (const rarityKey of RARITIES) {
    const u = uploaded[rarityKey];
    if (!u.candyMachine) {
      console.warn("No CM for", cls.key, rarityKey, "— skip CM update");
      continue;
    }
    const cmPk = publicKey(u.candyMachine);
    console.log(`\nUpdating CM ${cls.key}/${rarityKey}: ${u.candyMachine}`);
    const cm = await fetchCandyMachine(umi, cmPk);
    const hash = crypto.createHash("sha256").update(u.itemUri).digest();
    const itemsAvailable = Number(cm.data.itemsAvailable);
    const builder = transactionBuilder()
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
              name: `${cls.title} ${LABELS[rarityKey]} #$ID+1$`,
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

  // Update minted assets
  console.log(`\nScanning collection for ${cls.title} assets…`);
  const all = await dasGetAssetsByCollection(COLLECTION);
  const items = all.filter((a) => isClassAsset(a, cls));
  for (const og of cls.ogAssets || []) {
    if (!items.some((a) => a.id === og)) {
      items.push({
        id: og,
        content: {
          metadata: {
            name: cls.title,
            attributes: [{ trait_type: "Rarity", value: "Common" }],
          },
        },
      });
    }
  }
  console.log(`Found ${items.length} ${cls.title} of ${all.length} total`);

  const collection = await fetchCollection(umi, COLLECTION);
  const assetResults = [];

  for (const item of items) {
    const assetId = item.id || item.mint;
    const rarityKey = rarityFromAsset(item);
    const newUri = uploaded[rarityKey].itemUri;
    console.log(`\nUpdating ${assetId} → ${rarityKey}`);
    try {
      const before = await fetchAsset(umi, assetId);
      if (String(before.uri) === String(newUri)) {
        console.log("  already new URI, skip");
        assetResults.push({ asset: assetId, rarityKey, skipped: true });
        continue;
      }
      const builder = transactionBuilder()
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

  // Write public cm json + patch src imageUri
  const nextCm = {};
  for (const rarityKey of RARITIES) {
    const prev = cmCfg[rarityKey] || {};
    const u = uploaded[rarityKey];
    nextCm[rarityKey] = {
      ...prev,
      imageUri: u.imageUri,
      itemUri: u.itemUri,
      artVersion: "clean-v1",
      artUpdatedAt: new Date().toISOString(),
      cmUpdateTx: u.cmUpdateTx || null,
    };
  }
  fs.writeFileSync(cmPath, JSON.stringify(nextCm, null, 2) + "\n");
  console.log("Wrote", cmPath);

  const srcPath = path.join(ROOT, cls.srcJs);
  if (fs.existsSync(srcPath)) {
    let js = fs.readFileSync(srcPath, "utf8");
    for (const rarityKey of RARITIES) {
      const u = uploaded[rarityKey];
      const re = new RegExp(
        `(imageUrl: '/nft/${cls.folder}/${cls.filePrefix}-${rarityKey}\\.jpg[^']*',\\s*imageUri:\\s*)'[^']+'`,
      );
      if (re.test(js)) {
        js = js.replace(re, `$1'${u.imageUri}'`);
      } else {
        console.warn("Could not patch imageUri in", cls.srcJs, rarityKey);
      }
    }
    fs.writeFileSync(srcPath, js);
    console.log("Patched", cls.srcJs);
  }

  const outPath = path.join(
    __dirname,
    cls.scriptDir,
    "push-clean-art-result.json",
  );
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      { at: new Date().toISOString(), artVersion: "clean-v1", uploaded, assets: assetResults },
      null,
      2,
    ),
  );
  console.log("Result:", outPath);
}

async function main() {
  if (CLUSTER === "mainnet" && CONFIRM !== "yes") {
    console.error("Set CONFIRM_MAINNET=yes for mainnet.");
    process.exit(1);
  }

  const args = process.argv.slice(2).map((s) => s.toLowerCase());
  const keys = args.length
    ? args.filter((k) => CLASSES[k])
    : Object.keys(CLASSES);
  if (!keys.length) {
    console.error("Usage: node push-clean-elf-art.mjs [fate echo rush shadow]");
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
  console.log("Classes:", keys.join(", "));

  for (const k of keys) {
    await pushClass(umi, CLASSES[k]);
  }
  console.log("\nAll done — clean art (no socket hole) on-chain.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
