/**
 * Deploy Echo Wave 1 for all rarities, then write public/echo-cm.json.
 *
 *   export CONFIRM_MAINNET=yes
 *   export RPC_URL=...
 *   node deploy-all-wave1.mjs
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ECHO_TREASURY, GIFT2U_ELVES_COLLECTION } from "./config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../../..");
const RARITIES = ["common", "rare", "epic", "legendary"];

if ((process.env.CONFIRM_MAINNET || "").toLowerCase() !== "yes") {
  console.error("Set CONFIRM_MAINNET=yes");
  process.exit(1);
}

for (const rarity of RARITIES) {
  console.log("\n######## Deploying", rarity, "########");
  const r = spawnSync(process.execPath, ["deploy-one.mjs", rarity], {
    cwd: __dirname,
    env: process.env,
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.error("Failed:", rarity, "exit", r.status);
    process.exit(r.status || 1);
  }
}

const out = {};
for (const rarity of RARITIES) {
  const resultPath = path.join(__dirname, `wave1-${rarity}-result.json`);
  if (!fs.existsSync(resultPath)) {
    throw new Error(`Missing ${resultPath}`);
  }
  const r = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  out[rarity] = {
    candyMachine: r.candyMachine,
    candyGuard: r.candyGuard,
    collection: r.collection || GIFT2U_ELVES_COLLECTION,
    priceSol: r.priceSol,
    itemsAvailable: r.itemsAvailable,
    imageUri: r.imageUri,
    itemUri: r.itemUri,
    treasury: r.treasury || ECHO_TREASURY,
  };
}

const pubPath = path.join(ROOT, "public/echo-cm.json");
fs.writeFileSync(pubPath, JSON.stringify(out, null, 2) + "\n");
console.log("\nWrote", pubPath);
console.log(JSON.stringify(out, null, 2));
console.log("Done.");
