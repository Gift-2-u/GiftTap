/**
 * Upload Gift2U logo + JSON to Irys, create or update Metaplex Token Metadata.
 *
 * Create (first time):
 *   CONFIRM_MAINNET=yes node scripts/token/create-g2u-metadata.mjs
 *
 * Update URI/description (BirdEye etc. read on-chain uri):
 *   UPDATE_METADATA=yes CONFIRM_MAINNET=yes node scripts/token/create-g2u-metadata.mjs
 *
 * Uses update authority keypair (KEYPAIR_PATH). Description has no vault/staking.
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
  percentAmount,
} from "@metaplex-foundation/umi";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import {
  createV1,
  updateV1,
  findMetadataPda,
  mplTokenMetadata,
  TokenStandard,
} from "@metaplex-foundation/mpl-token-metadata";
import bs58 from "bs58";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const MINT = process.env.G2U_MINT || "EvFu9qKTNi3wWDbgnm5qmZjLFUHDN3o4A8HjUrqaGMBR";
const NAME = process.env.G2U_NAME || "Gift2U";
const SYMBOL = process.env.G2U_SYMBOL || "G2U";
const DESCRIPTION =
  process.env.G2U_DESCRIPTION || "Gift2U ($G2U) — utility token for Gift Tap.";
const CLUSTER = process.env.CLUSTER || "mainnet";
const CONFIRM = (process.env.CONFIRM_MAINNET || "").toLowerCase();
const DO_UPDATE = ["1", "true", "yes", "on"].includes(
  (process.env.UPDATE_METADATA || "").toLowerCase(),
);
const RPC_URL =
  process.env.RPC_URL ||
  process.env.VITE_SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";
const KEYPAIR_PATH =
  process.env.KEYPAIR_PATH ||
  path.join(os.homedir(), ".config", "solana", "id.json");
const LOGO =
  process.env.G2U_LOGO ||
  path.join(ROOT, "public", "Gift2u_logo.png");

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
  if (!fs.existsSync(LOGO)) throw new Error(`Missing logo: ${LOGO}`);

  console.log("Mode:", DO_UPDATE ? "UPDATE metadata URI" : "CREATE metadata");
  console.log("Mint:", MINT);
  console.log("Name/Symbol:", NAME, "/", SYMBOL);
  console.log("Description:", DESCRIPTION);
  console.log("Logo:", LOGO);
  console.log("RPC:", RPC_URL.replace(/api-key=[^&]+/i, "api-key=***"));

  const umi = createUmi(RPC_URL).use(mplTokenMetadata());
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
  const partialPath = path.join(outDir, "g2u-metadata-partial.json");
  const partial = fs.existsSync(partialPath)
    ? JSON.parse(fs.readFileSync(partialPath, "utf8"))
    : {};

  // Keep existing Irys image unless missing; always re-upload JSON on UPDATE
  let imageUri = partial.imageUri;
  if (!imageUri) {
    console.log("\nUploading logo to Irys…");
    const buf = fs.readFileSync(LOGO);
    const imageFile = createGenericFile(buf, "Gift2u_logo.png", {
      contentType: "image/png",
    });
    [imageUri] = await umi.uploader.upload([imageFile]);
    partial.imageUri = imageUri;
    fs.writeFileSync(partialPath, JSON.stringify(partial, null, 2));
  }
  console.log("Image URI:", imageUri);

  let metadataUri = DO_UPDATE ? null : partial.metadataUri;
  if (!metadataUri) {
    console.log("Uploading metadata JSON…");
    // Prefer site copy when present
    const siteJsonPath = path.join(ROOT, "public", "g2u-token.json");
    let payload = {
      name: NAME,
      symbol: SYMBOL,
      description: DESCRIPTION,
      image: imageUri,
      external_url: "https://gift2u.fun",
      properties: {
        category: "image",
        files: [{ uri: imageUri, type: "image/png" }],
      },
    };
    if (fs.existsSync(siteJsonPath)) {
      const site = JSON.parse(fs.readFileSync(siteJsonPath, "utf8"));
      payload = {
        ...site,
        name: NAME,
        symbol: SYMBOL,
        description: DESCRIPTION,
        image: imageUri,
        external_url: site.external_url || "https://gift2u.fun",
        properties: {
          ...(site.properties || {}),
          category: "image",
          files: [{ uri: imageUri, type: "image/png" }],
        },
      };
    }
    metadataUri = await umi.uploader.uploadJson(payload);
    partial.metadataUri = metadataUri;
    partial.description = DESCRIPTION;
    fs.writeFileSync(partialPath, JSON.stringify(partial, null, 2));
  }
  console.log("Metadata URI:", metadataUri);

  const mint = publicKey(MINT);
  const metadataPda = findMetadataPda(umi, { mint });
  console.log("Metadata PDA:", metadataPda[0]);

  let signature;
  if (DO_UPDATE) {
    console.log("\nUpdating on-chain Token Metadata URI…");
    const result = await updateV1(umi, {
      mint,
      authority: umi.identity,
      data: {
        name: NAME,
        symbol: SYMBOL,
        uri: metadataUri,
        sellerFeeBasisPoints: 0,
        creators: [
          {
            address: umi.identity.publicKey,
            verified: true,
            share: 100,
          },
        ],
      },
    }).sendAndConfirm(umi);
    signature = sigOf(result);
    console.log("\nMetadata updated");
  } else {
    console.log("\nCreating on-chain Token Metadata…");
    const result = await createV1(umi, {
      mint,
      authority: umi.identity,
      payer: umi.identity,
      updateAuthority: umi.identity,
      name: NAME,
      symbol: SYMBOL,
      uri: metadataUri,
      sellerFeeBasisPoints: percentAmount(0),
      tokenStandard: TokenStandard.Fungible,
    }).sendAndConfirm(umi);
    signature = sigOf(result);
    console.log("\nMetadata created");
  }

  const out = {
    mint: MINT,
    name: NAME,
    symbol: SYMBOL,
    description: DESCRIPTION,
    imageUri,
    metadataUri,
    metadataPda: String(metadataPda[0]),
    signature,
    mode: DO_UPDATE ? "update" : "create",
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(outDir, "g2u-metadata-result.json"),
    JSON.stringify(out, null, 2),
  );
  console.log(JSON.stringify(out, null, 2));
  console.log(
    "\nBirdEye/Solscan may cache for a while — check metadata URI above.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
