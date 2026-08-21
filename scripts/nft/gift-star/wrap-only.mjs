/**
 * Poll until candy guard exists, then wrap CM.
 *   node wrap-only.mjs <candyMachine> <candyGuard>
 */
import fs from "fs";
import os from "os";
import path from "path";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplCandyMachine, wrap } from "@metaplex-foundation/mpl-core-candy-machine";
import { keypairIdentity, publicKey } from "@metaplex-foundation/umi";
import bs58 from "bs58";

const CM = process.argv[2];
const GUARD = process.argv[3];
if (!CM || !GUARD) {
  console.error("Usage: node wrap-only.mjs <candyMachine> <candyGuard>");
  process.exit(1);
}

const RPC =
  process.env.RPC_URL ||
  "https://mainnet.helius-rpc.com/?api-key=538f6c8f-c773-46a2-939c-6d48c75b2226";
const secret = new Uint8Array(
  JSON.parse(
    fs.readFileSync(path.join(os.homedir(), ".config/solana/id.json"), "utf8"),
  ),
);
const umi = createUmi(RPC).use(mplCandyMachine());
umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secret)));

const candyGuard = publicKey(GUARD);
const candyMachine = publicKey(CM);

console.log("Polling guard", GUARD);
for (let i = 0; i < 20; i++) {
  const acc = await umi.rpc.getAccount(candyGuard);
  console.log("poll", i, "exists=", acc.exists);
  if (acc.exists) break;
  if (i === 19) throw new Error("Guard still missing");
  await new Promise((r) => setTimeout(r, 2000));
}

let lastErr;
for (let attempt = 1; attempt <= 5; attempt++) {
  try {
    console.log("Wrap try", attempt);
    const tx = await wrap(umi, {
      candyGuard,
      candyMachine,
      authority: umi.identity,
      candyMachineAuthority: umi.identity,
    }).sendAndConfirm(umi, {
      send: { skipPreflight: false },
      confirm: { commitment: "confirmed" },
    });
    const sig =
      typeof tx.signature === "string"
        ? tx.signature
        : bs58.encode(tx.signature);
    console.log("WRAP OK", sig);
    const out = {
      candyMachine: CM,
      candyGuard: GUARD,
      wrapTx: sig,
      priceSol: 0.1,
      collection: "FQPYWSohCPnS57W2AWAqwmQM21KRxGi4YXcCaiXUghPD",
      treasury: "AdvMvv6GzGvdLRtuxaso1Eubk7jmn6LCZEeEFHn22yeb",
      imageUri:
        "https://gateway.irys.xyz/DKxXzSn2aFMlNZpekhfpimLvL8EXfg3erDBYBSteY0g",
      itemsAvailable: 50000,
      maxPerWallet: 10,
      feeBufferSol: 0.02,
      wave: 1,
      name: "Star Badge",
      imageUrl: "/shop/socket-star2.jpg?v=1",
    };
    fs.writeFileSync(
      path.join(path.dirname(new URL(import.meta.url).pathname), "wave1-result.json"),
      JSON.stringify(out, null, 2),
    );
    const pub = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      "../../../public/star-cm.json",
    );
    fs.writeFileSync(pub, JSON.stringify(out, null, 2) + "\n");
    console.log("Wrote public/star-cm.json");
    process.exit(0);
  } catch (e) {
    lastErr = e;
    console.warn("wrap failed", attempt, e?.message || e);
    await new Promise((r) => setTimeout(r, 2500));
  }
}
throw lastErr;
