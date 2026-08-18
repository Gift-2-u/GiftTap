/**
 * Deploy one Shadow Wave 1 CM + Guard + Wrap with priority fees.
 * Reuses Gift2u Elves collection + uploads bordered art.
 *
 *   export CONFIRM_MAINNET=yes RPC_URL=...
 *   node deploy-one.mjs legendary
 */
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplCore } from "@metaplex-foundation/mpl-core";
import {
  createCandyMachine,
  createCandyGuard,
  findCandyGuardPda,
  wrap,
  mplCandyMachine,
} from "@metaplex-foundation/mpl-core-candy-machine";
import {
  setComputeUnitPrice,
  setComputeUnitLimit,
} from "@metaplex-foundation/mpl-toolbox";
import {
  createGenericFile,
  generateSigner,
  keypairIdentity,
  publicKey,
  some,
  sol,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import bs58 from "bs58";
import {
  SHADOW_RARITIES,
  waveItems,
  wavePrice,
  SHADOW_TREASURY,
  GIFT2U_ELVES_COLLECTION,
} from "./config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rarityKey = (process.argv[2] || "").toLowerCase();
const WAVE = 1;

if (!SHADOW_RARITIES[rarityKey]) {
  console.error("Usage: node deploy-one.mjs <common|rare|epic|legendary>");
  process.exit(1);
}

if ((process.env.CONFIRM_MAINNET || "").toLowerCase() !== "yes") {
  console.error("Set CONFIRM_MAINNET=yes");
  process.exit(1);
}

const RPC_URL =
  process.env.RPC_URL ||
  process.env.VITE_SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";
const KEYPAIR_PATH =
  process.env.KEYPAIR_PATH ||
  path.join(os.homedir(), ".config", "solana", "id.json");
const COLLECTION =
  process.env.COLLECTION_ADDRESS || GIFT2U_ELVES_COLLECTION;
const TREASURY = publicKey(process.env.TREASURY || SHADOW_TREASURY);

const r = SHADOW_RARITIES[rarityKey];
const ITEMS = waveItems(rarityKey, WAVE);
const PRICE_SOL = wavePrice(rarityKey, WAVE);
const outPath = path.join(__dirname, `wave1-${rarityKey}-result.json`);
const partialPath = path.join(__dirname, `wave1-${rarityKey}-partial.json`);

if (fs.existsSync(outPath)) {
  const existing = JSON.parse(fs.readFileSync(outPath, "utf8"));
  if (existing.candyMachine && existing.candyGuard) {
    console.log("Already deployed:", outPath);
    console.log(JSON.stringify(existing, null, 2));
    process.exit(0);
  }
}

function sigOf(tx) {
  return typeof tx.signature === "string"
    ? tx.signature
    : bs58.encode(tx.signature);
}

async function sendWithPriority(umi, builders, label) {
  let builder = transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 400_000 }))
    .add(setComputeUnitPrice(umi, { microLamports: 200_000 }));
  for (const b of builders) {
    builder = builder.add(b);
  }
  console.log(label, "…");
  const tx = await builder.sendAndConfirm(umi, {
    send: { skipPreflight: false },
    confirm: { commitment: "confirmed" },
  });
  console.log(label, "OK", sigOf(tx));
  return tx;
}

const umi = createUmi(RPC_URL).use(mplCore()).use(mplCandyMachine());
umi.use(
  irysUploader({
    address: "https://node1.irys.xyz",
  }),
);
const secret = new Uint8Array(
  JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf8")),
);
umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secret)));

console.log("=== Shadow", r.label, "Wave 1 ===");
console.log("Items", ITEMS, "Price", PRICE_SOL, "SOL");
console.log("Authority", umi.identity.publicKey.toString());
console.log("Collection", COLLECTION);

const partial = fs.existsSync(partialPath)
  ? JSON.parse(fs.readFileSync(partialPath, "utf8"))
  : {};

let imagePath = path.join(__dirname, `Shadow-${rarityKey}.jpg`);
if (!fs.existsSync(imagePath)) imagePath = path.join(__dirname, "Shadow.jpg");

let imageUri = partial.imageUri;
if (!imageUri) {
  console.log("Uploading image…", path.basename(imagePath));
  const imageFile = createGenericFile(
    fs.readFileSync(imagePath),
    path.basename(imagePath),
    { contentType: "image/jpeg" },
  );
  [imageUri] = await umi.uploader.upload([imageFile]);
}
console.log("imageUri", imageUri);

const metaTemplate = JSON.parse(
  fs.readFileSync(path.join(__dirname, `metadata-${rarityKey}.json`), "utf8"),
);

let itemUri = partial.itemUri;
if (!itemUri) {
  console.log("Uploading item metadata…");
  itemUri = await umi.uploader.uploadJson({
    ...metaTemplate,
    image: imageUri,
    attributes: [
      ...(metaTemplate.attributes || []),
      { trait_type: "Wave", value: String(WAVE) },
    ],
    properties: {
      category: "image",
      files: [{ uri: imageUri, type: "image/jpeg" }],
    },
  });
}
console.log("itemUri", itemUri);

fs.writeFileSync(
  partialPath,
  JSON.stringify(
    {
      rarity: rarityKey,
      wave: WAVE,
      collection: COLLECTION,
      itemUri,
      imageUri,
    },
    null,
    2,
  ),
);

const candyMachine = generateSigner(umi);
const hash = crypto.createHash("sha256").update(itemUri).digest();

const cmBuilder = await createCandyMachine(umi, {
  candyMachine,
  collection: publicKey(COLLECTION),
  collectionUpdateAuthority: umi.identity,
  itemsAvailable: ITEMS,
  isMutable: true,
  hiddenSettings: some({
    name: `Shadow ${r.label} #$ID+1$`,
    uri: itemUri,
    hash,
  }),
});
await sendWithPriority(umi, [cmBuilder], "1/3 Candy Machine");
console.log("CM", candyMachine.publicKey.toString());

const guardBuilder = createCandyGuard(umi, {
  base: candyMachine,
  guards: {
    solPayment: some({
      lamports: sol(PRICE_SOL),
      destination: TREASURY,
    }),
    botTax: some({
      lamports: sol(0.001),
      lastInstruction: true,
    }),
    mintLimit: some({
      id: WAVE,
      limit: 5,
    }),
  },
});
await sendWithPriority(umi, [guardBuilder], "2/3 Candy Guard");

const candyGuard = publicKey(
  findCandyGuardPda(umi, { base: candyMachine.publicKey }),
);
console.log("Guard", candyGuard.toString());

// Helius/DAS lag: poll until guard account is visible
for (let i = 0; i < 12; i++) {
  const guardAcc = await umi.rpc.getAccount(candyGuard);
  if (guardAcc.exists) {
    console.log("Guard visible after", i, "polls");
    break;
  }
  if (i === 11) throw new Error("Guard account still missing after create");
  await new Promise((r) => setTimeout(r, 1500));
}

const wrapBuilder = wrap(umi, {
  candyGuard,
  candyMachine: candyMachine.publicKey,
  authority: umi.identity,
  candyMachineAuthority: umi.identity,
});
// Retry wrap a few times (blockheight issues)
let wrapped = false;
for (let attempt = 1; attempt <= 4; attempt++) {
  try {
    await sendWithPriority(umi, [wrapBuilder], `3/3 Wrap (try ${attempt})`);
    wrapped = true;
    break;
  } catch (e) {
    console.warn("wrap attempt failed", attempt, e?.message || e);
    await new Promise((r) => setTimeout(r, 2000));
  }
}
if (!wrapped) throw new Error("Wrap failed after retries");

const out = {
  standard: "metaplex-core",
  class: "Shadow",
  rarity: r.label,
  rarityKey,
  wave: WAVE,
  itemsAvailable: ITEMS,
  priceSol: PRICE_SOL,
  treasury: TREASURY.toString(),
  collection: COLLECTION,
  candyMachine: candyMachine.publicKey.toString(),
  candyGuard: candyGuard.toString(),
  itemUri,
  imageUri,
  maxPerWallet: 5,
  cluster: "mainnet",
};
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log("WROTE", outPath);
console.log(JSON.stringify(out, null, 2));
