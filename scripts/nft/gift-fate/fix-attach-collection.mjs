/**
 * Attach an existing Core asset to Gift2u Elves collection
 * (fixes mints that passed a bare publicKey instead of CollectionV1).
 *
 *   export CONFIRM_MAINNET=yes
 *   export RPC_URL=...
 *   node fix-attach-collection.mjs [assetAddress]
 */
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  mplCore,
  fetchCollection,
  fetchAsset,
  updateV2,
  baseUpdateAuthority,
} from "@metaplex-foundation/mpl-core";
import {
  keypairIdentity,
  publicKey,
  some,
  none,
} from "@metaplex-foundation/umi";
import bs58 from "bs58";
import { GIFT2U_ELVES_COLLECTION } from "./config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLUSTER = process.env.CLUSTER || "mainnet";
const CONFIRM = (process.env.CONFIRM_MAINNET || "").toLowerCase();
const RPC_URL =
  process.env.RPC_URL ||
  process.env.VITE_SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";
const KEYPAIR_PATH =
  process.env.KEYPAIR_PATH ||
  path.join(os.homedir(), ".config", "solana", "id.json");

const ASSET =
  process.argv[2] ||
  JSON.parse(fs.readFileSync(path.join(__dirname, "mint-result.json"), "utf8"))
    .asset;

async function main() {
  if (CLUSTER === "mainnet" && CONFIRM !== "yes") {
    console.error("Set CONFIRM_MAINNET=yes");
    process.exit(1);
  }

  const umi = createUmi(RPC_URL).use(mplCore());
  const secret = new Uint8Array(
    JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf8")),
  );
  umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secret)));

  console.log("Wallet:", umi.identity.publicKey);
  console.log("Asset: ", ASSET);
  console.log("Collection:", GIFT2U_ELVES_COLLECTION);

  const collection = await fetchCollection(umi, GIFT2U_ELVES_COLLECTION);
  console.log("Collection name:", collection.name);
  console.log("Collection updateAuthority:", collection.updateAuthority);

  const asset = await fetchAsset(umi, ASSET);
  console.log("Asset name:", asset.name);
  console.log("Asset updateAuthority BEFORE:", asset.updateAuthority);

  // Move into collection: update authority becomes Collection + newCollection account
  const tx = await updateV2(umi, {
    asset: publicKey(ASSET),
    newCollection: collection.publicKey,
    newUpdateAuthority: some(
      baseUpdateAuthority("Collection", [collection.publicKey]),
    ),
    newName: none(),
    newUri: none(),
    authority: umi.identity,
    payer: umi.identity,
  }).sendAndConfirm(umi);

  const signature =
    typeof tx.signature === "string" ? tx.signature : bs58.encode(tx.signature);

  const after = await fetchAsset(umi, ASSET);
  console.log("Asset updateAuthority AFTER:", after.updateAuthority);
  console.log("Tx:", signature);
  console.log(
    "Solscan tx:",
    `https://solscan.io/tx/${signature}`,
  );
  console.log(
    "Core explorer:",
    `https://core.metaplex.com/explorer/${ASSET}`,
  );

  const out = {
    asset: ASSET,
    collection: GIFT2U_ELVES_COLLECTION,
    signature,
    updateAuthorityAfter: after.updateAuthority,
  };
  fs.writeFileSync(
    path.join(__dirname, "fix-collection-result.json"),
    JSON.stringify(out, null, 2),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
