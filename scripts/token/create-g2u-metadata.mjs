/**
 * Upload Gift2U logo + JSON to Irys, create Metaplex Token Metadata on mainnet.
 *
 *   CONFIRM_MAINNET=yes node scripts/token/create-g2u-metadata.mjs
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
const CLUSTER = process.env.CLUSTER || "mainnet";
const CONFIRM = (process.env.CONFIRM_MAINNET || "").toLowerCase();
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

  console.log("Mint:", MINT);
  console.log("Name/Symbol:", NAME, "/", SYMBOL);
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

  let metadataUri = partial.metadataUri;
  if (!metadataUri) {
    console.log("Uploading metadata JSON…");
    metadataUri = await umi.uploader.uploadJson({
      name: NAME,
      symbol: SYMBOL,
      description:
        "Gift2U ($G2U) — utility token for Gift Tap: vault, staking, markets, and ecosystem rewards. https://gift2u.fun",
      image: imageUri,
      external_url: "https://gift2u.fun",
      properties: {
        category: "image",
        files: [{ uri: imageUri, type: "image/png" }],
      },
    });
    partial.metadataUri = metadataUri;
    fs.writeFileSync(partialPath, JSON.stringify(partial, null, 2));
  }
  console.log("Metadata URI:", metadataUri);

  const mint = publicKey(MINT);
  const metadataPda = findMetadataPda(umi, { mint });
  console.log("Metadata PDA:", metadataPda[0]);

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

  const signature = sigOf(result);
  const out = {
    mint: MINT,
    name: NAME,
    symbol: SYMBOL,
    imageUri,
    metadataUri,
    metadataPda: String(metadataPda[0]),
    signature,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(outDir, "g2u-metadata-result.json"),
    JSON.stringify(out, null, 2),
  );
  console.log("\nMetadata created");
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
