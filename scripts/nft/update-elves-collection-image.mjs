/**
 * Upload Gift2u Elves.jpg + collection JSON to Irys, update Core collection metadata.
 *
 *   CONFIRM_MAINNET=yes node scripts/nft/update-elves-collection-image.mjs
 */
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createGenericFile,
  keypairIdentity,
  publicKey,
  some,
} from "@metaplex-foundation/umi";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import {
  updateCollectionV1,
  fetchCollectionV1,
  mplCore,
} from "@metaplex-foundation/mpl-core";
import { setComputeUnitPrice, setComputeUnitLimit } from "@metaplex-foundation/mpl-toolbox";
import bs58 from "bs58";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COLLECTION =
  process.env.GIFT2U_ELVES_COLLECTION ||
  "FQPYWSohCPnS57W2AWAqwmQM21KRxGi4YXcCaiXUghPD";
const CLUSTER = process.env.CLUSTER || "mainnet";
const CONFIRM = (process.env.CONFIRM_MAINNET || "").toLowerCase();
const RPC_URL =
  process.env.RPC_URL ||
  process.env.VITE_SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";
const KEYPAIR_PATH =
  process.env.KEYPAIR_PATH ||
  path.join(os.homedir(), ".config", "solana", "id.json");
const IMAGE_PATH =
  process.env.ELVES_IMAGE ||
  "/mnt/c/Users/clato/OneDrive/Gift2u elves nft/Gift2u Elves.jpg";

function loadSecret() {
  return new Uint8Array(JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf8")));
}
function sigOf(result) {
  return typeof result.signature === "string"
    ? result.signature
    : bs58.encode(result.signature);
}

async function main() {
  if (CLUSTER === "mainnet" && CONFIRM !== "yes") {
    console.error("Set CONFIRM_MAINNET=yes for mainnet.");
    process.exit(1);
  }
  if (!fs.existsSync(IMAGE_PATH)) {
    throw new Error(`Missing image: ${IMAGE_PATH}`);
  }

  console.log("Collection:", COLLECTION);
  console.log("Image:", IMAGE_PATH);
  console.log("RPC:", RPC_URL.replace(/api-key=[^&]+/i, "api-key=***"));

  const umi = createUmi(RPC_URL).use(mplCore());
  umi.use(
    irysUploader({
      address:
        CLUSTER === "mainnet"
          ? "https://node1.irys.xyz"
          : "https://devnet.irys.xyz",
    }),
  );
  umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(loadSecret())));
  console.log("Authority:", umi.identity.publicKey);

  const outDir = path.join(__dirname, "out");
  fs.mkdirSync(outDir, { recursive: true });
  const partialPath = path.join(outDir, "elves-collection-partial.json");
  const partial = fs.existsSync(partialPath)
    ? JSON.parse(fs.readFileSync(partialPath, "utf8"))
    : {};

  let imageUri = partial.imageUri;
  if (!imageUri) {
    console.log("\nUploading Gift2u Elves.jpg…");
    const buf = fs.readFileSync(IMAGE_PATH);
    const imageFile = createGenericFile(buf, "Gift2u-Elves.jpg", {
      contentType: "image/jpeg",
    });
    [imageUri] = await umi.uploader.upload([imageFile]);
    partial.imageUri = imageUri;
    fs.writeFileSync(partialPath, JSON.stringify(partial, null, 2));
  }
  console.log("Image URI:", imageUri);

  // Verify image fetchable
  try {
    const head = await fetch(imageUri, { method: "HEAD" });
    console.log("Image HTTP", head.status, head.headers.get("content-type"));
  } catch (e) {
    console.warn("Image HEAD check failed", e?.message || e);
  }

  let collectionUri = partial.collectionUri;
  if (!collectionUri) {
    console.log("Uploading collection metadata JSON…");
    collectionUri = await umi.uploader.uploadJson({
      name: "Gift2u Elves",
      symbol: "ELVES",
      description:
        "Gift2u Elves — Gen 1 utility NFTs for Gift Tap. Classes: GiftLocksmith, Fate (Luck), Echo (Power), Rush (Energy), Shadow (Night).",
      image: imageUri,
      external_url: "https://gift2u.fun",
      properties: {
        category: "image",
        files: [{ uri: imageUri, type: "image/jpeg" }],
      },
      attributes: [
        { trait_type: "Generation", value: "Gen 1" },
        { trait_type: "Classes", value: "Locksmith · Fate · Echo · Rush · Shadow" },
      ],
    });
    partial.collectionUri = collectionUri;
    fs.writeFileSync(partialPath, JSON.stringify(partial, null, 2));
  }
  console.log("Collection URI:", collectionUri);

  const collection = publicKey(COLLECTION);
  const before = await fetchCollectionV1(umi, collection);
  console.log("Before name:", before.name);
  console.log("Before uri:", before.uri);

  console.log("\nUpdating on-chain collection…");
  const result = await updateCollectionV1(umi, {
    collection,
    newName: some("Gift2u Elves"),
    newUri: some(collectionUri),
  })
    .prepend(setComputeUnitLimit(umi, { units: 100_000 }))
    .prepend(setComputeUnitPrice(umi, { microLamports: 300_000 }))
    .sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });

  const signature = sigOf(result);
  await new Promise((r) => setTimeout(r, 1500));
  const after = await fetchCollectionV1(umi, collection);

  const out = {
    collection: COLLECTION,
    name: after.name,
    imageUri,
    collectionUri,
    uriOnChain: after.uri,
    signature,
    updatedAt: new Date().toISOString(),
    links: {
      solscan: `https://solscan.io/token/${COLLECTION}`,
      coreExplorer: `https://core.metaplex.com/explorer/${COLLECTION}`,
      magicEden: `https://magiceden.io/collections/solana/${COLLECTION}`,
    },
  };
  fs.writeFileSync(
    path.join(outDir, "elves-collection-update.json"),
    JSON.stringify(out, null, 2),
  );
  console.log("\nUpdated");
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
