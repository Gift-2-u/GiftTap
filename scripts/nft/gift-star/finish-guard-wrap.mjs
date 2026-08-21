/**
 * Create Candy Guard + wrap for an existing Core Candy Machine.
 *
 *   node finish-guard-wrap.mjs <candyMachine> <priceSol> <waveId>
 */
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createCandyGuard,
  findCandyGuardPda,
  wrap,
  mplCandyMachine,
} from "@metaplex-foundation/mpl-core-candy-machine";
import {
  keypairIdentity,
  publicKey,
  some,
  sol,
  generateSigner,
} from "@metaplex-foundation/umi";
import bs58 from "bs58";
const FATE_TREASURY = "AdvMvv6GzGvdLRtuxaso1Eubk7jmn6LCZEeEFHn22yeb";

const CM = process.argv[2];
const PRICE = Number(process.argv[3] || 0);
const WAVE = Number(process.argv[4] || 1);
if (!CM || !PRICE) {
  console.error("Usage: node finish-guard-wrap.mjs <candyMachine> <priceSol> [waveId]");
  process.exit(1);
}

const RPC_URL =
  process.env.RPC_URL ||
  process.env.VITE_SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";
const KEYPAIR_PATH =
  process.env.KEYPAIR_PATH ||
  path.join(os.homedir(), ".config", "solana", "id.json");

const umi = createUmi(RPC_URL).use(mplCandyMachine());
const secret = new Uint8Array(
  JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf8")),
);
umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secret)));
const treasury = publicKey(process.env.TREASURY || FATE_TREASURY);

// Candy Guard base MUST be a Signer. For an existing CM we use a fresh base signer
// (Metaplex allows any base; PDA is derived from base).
// IMPORTANT: for standard CM+guard, base of the guard is the candy machine keypair.
// We no longer have the CM secret if it was generateSigner and process exited.
// So we must create a NEW guard with a new base signer, then wrap(cm, guard).
//
// Actually Metaplex docs: findCandyGuardPda({ base: candyMachine.publicKey })
// means base = CM public key. createCandyGuard needs base as Signer with that pubkey.
// Without the original CM keypair we CANNOT recreate the standard PDA.
//
// Recovery path: createCandyGuard with a NEW base signer, then wrap with that guard PDA.
const guardBase = generateSigner(umi);
const sendOpts = {
  send: { skipPreflight: false },
  confirm: { commitment: "confirmed" },
};

console.log("CM:", CM);
console.log("Guard base (new):", guardBase.publicKey.toString());
console.log("Price:", PRICE, "Wave:", WAVE);

console.log("Creating candy guard…");
const guardBuilder = createCandyGuard(umi, {
  base: guardBase,
  guards: {
    solPayment: some({
      lamports: sol(PRICE),
      destination: treasury,
    }),
    botTax: some({
      lamports: sol(0.001),
      lastInstruction: true,
    }),
    mintLimit: some({
      id: WAVE,
      limit: 10,
    }),
  },
});
const guardTx = await guardBuilder.sendAndConfirm(umi, sendOpts);
const guardSig =
  typeof guardTx.signature === "string"
    ? guardTx.signature
    : bs58.encode(guardTx.signature);
console.log("Guard tx:", guardSig);

const candyGuardPda = findCandyGuardPda(umi, { base: guardBase.publicKey });
const candyGuard = publicKey(candyGuardPda);
console.log("Candy Guard:", candyGuard.toString());

// Confirm guard account exists
await new Promise((r) => setTimeout(r, 2000));

console.log("Wrapping…");
const wrapTx = await wrap(umi, {
  candyGuard,
  candyMachine: publicKey(CM),
  authority: umi.identity,
  candyMachineAuthority: umi.identity,
}).sendAndConfirm(umi, sendOpts);
const wrapSig =
  typeof wrapTx.signature === "string"
    ? wrapTx.signature
    : bs58.encode(wrapTx.signature);
console.log("Wrap tx:", wrapSig);

const out = {
  candyMachine: CM,
  candyGuard: candyGuard.toString(),
  guardBase: guardBase.publicKey.toString(),
  // Save guard base secret so we could update guards later if needed
  guardBaseSecret: bs58.encode(guardBase.secretKey),
  priceSol: PRICE,
  wave: WAVE,
  guardTx: guardSig,
  wrapTx: wrapSig,
};
const outPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  `guard-wrap-${CM.slice(0, 8)}.json`,
);
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log("wrote", outPath);
console.log(JSON.stringify(out, null, 2));
