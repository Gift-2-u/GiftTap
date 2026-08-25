/**
 * Attach Candy Guard group "mystry" (max 6 chars) for Mystery Gift vault mints.
 *
 * Default (shop) guards: UNCHANGED — still solPayment + mintLimit 5.
 * Group "mystry":
 *   - thirdPartySigner = Mystery vault (only vault can mint this group)
 *   - no solPayment (fee ≈ botTax + rent only)
 *   - mintLimit id 99 / limit 65535 (vault can mint at volume)
 *
 *   export CONFIRM_MAINNET=yes
 *   export MYSTERY_VAULT_PUBKEY="..."   # required
 *   export KEYPAIR_PATH=~/.config/solana/id.json   # guard authority (AdvMvv6…)
 *   export RPC_URL="..."   # optional
 *   node scripts/nft/add-mystery-guard-group.mjs
 *
 * Then redeploy mystery-open (Edge already targets group "mystry").
 */
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplCore } from "@metaplex-foundation/mpl-core";
import {
  updateCandyGuard,
  mplCandyMachine,
  fetchCandyGuard,
} from "@metaplex-foundation/mpl-core-candy-machine";
import {
  setComputeUnitPrice,
  setComputeUnitLimit,
} from "@metaplex-foundation/mpl-toolbox";
import {
  keypairIdentity,
  publicKey,
  some,
  none,
  sol,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import bs58 from "bs58";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TREASURY = "AdvMvv6GzGvdLRtuxaso1Eubk7jmn6LCZEeEFHn22yeb";
const GROUP_LABEL = "mystry"; // Metaplex max 6 chars
const MYSTERY_LIMIT_ID = 99;
const MYSTERY_LIMIT = 65535;

/** All CMs Mystery Gift can roll (must match Edge mysteryVault.ts). */
const TARGETS = [
  {
    name: "fate-common",
    candyMachine: "8Xsen3GEmVKfrirGrENV18We8HN3SWx4gFHxuD8USuuU",
    candyGuard: "4v7c2tdq9a98nHX1yKJdLVn22KTfws6mUWA8X4YuVkpb",
    priceSol: 0.05,
    wave: 1,
  },
  {
    name: "echo-common",
    candyMachine: "2paivyfk7tLazrxs8rXDQx1CLMFXcbuXVpE8n3EvhqUM",
    candyGuard: "7zJVBJxM6TrXpjeMDcLBaHiVZ1Si8YAoVjyTJEY5nUtF",
    priceSol: 0.05,
    wave: 1,
  },
  {
    name: "rush-common",
    candyMachine: "2T5papzGBSCZjCa1dg3gFMro5A3JH3WQdRbu96WwVp59",
    candyGuard: "BncE3BaFZxjQcqAzZZ1qme6hKPKSQBWnwP6EetbonKM2",
    priceSol: 0.05,
    wave: 1,
  },
  {
    name: "shadow-common",
    candyMachine: "6eCDTALwmkSndK6guUFkmNMo9AoqAWJoNR7PaqHumVqD",
    candyGuard: "D7h5id6Q4NQPk9V9Md6iBRTpJuUjhvNyCG4Hxe9gqRXn",
    priceSol: 0.05,
    wave: 1,
  },
  {
    name: "locksmith",
    candyMachine: "AQbpmorxtBaaipqm4WcmCyBzci8Qf8km9qF8kAidsMkC",
    candyGuard: "CBK1Zwsnwwks3BLmhHASzD9Rsq8i2Xgs6RWMZGNSQRJ9",
    priceSol: 0.1,
    wave: 1,
  },
  {
    name: "star",
    candyMachine: "CRut6UNyve3JhZ86E6S4zx17sHQWj8XYk1wZc7YEnSjP",
    candyGuard: "DFrUCFbABmF3BNgwZVnEyyciNqq68ccXJ3SptgxuvkmS",
    priceSol: 0.1,
    wave: 1,
  },
];

const CLUSTER = process.env.CLUSTER || "mainnet";
const CONFIRM = (process.env.CONFIRM_MAINNET || "").toLowerCase();
const RPC_URL =
  process.env.RPC_URL ||
  process.env.VITE_SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";
const KEYPAIR_PATH =
  process.env.KEYPAIR_PATH ||
  path.join(os.homedir(), ".config", "solana", "id.json");
const VAULT =
  process.env.MYSTERY_VAULT_PUBKEY ||
  process.env.MYSTERY_VAULT_WALLET ||
  "";

function loadSecret() {
  return new Uint8Array(JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf8")));
}

function sigOf(result) {
  return typeof result.signature === "string"
    ? result.signature
    : bs58.encode(result.signature);
}

function shopGuards(priceSol, wave, treasury) {
  return {
    solPayment: some({
      lamports: sol(priceSol),
      destination: treasury,
    }),
    botTax: some({
      lamports: sol(0.001),
      lastInstruction: true,
    }),
    mintLimit: some({
      id: wave,
      limit: 5,
    }),
  };
}

function mysteryGroup(vaultPk) {
  return {
    label: GROUP_LABEL,
    guards: {
      solPayment: none(),
      mintLimit: some({
        id: MYSTERY_LIMIT_ID,
        limit: MYSTERY_LIMIT,
      }),
      botTax: some({
        lamports: sol(0.001),
        lastInstruction: true,
      }),
      thirdPartySigner: some({
        signerAddress: vaultPk,
      }),
    },
  };
}

async function updateOne(umi, target, treasury, vaultPk, sendOpts) {
  const candyGuard = publicKey(target.candyGuard);
  console.log(`\n=== ${target.name} ===`);
  console.log("Guard:", target.candyGuard);

  try {
    const before = await fetchCandyGuard(umi, candyGuard);
    const labels = (before.groups || []).map((g) => g.label);
    console.log("Existing groups:", labels.length ? labels.join(", ") : "(none)");
  } catch (e) {
    console.warn("fetchCandyGuard:", e?.message || e);
  }

  // Keep other custom groups if any (drop old mystry so we replace cleanly)
  let otherGroups = [];
  try {
    const before = await fetchCandyGuard(umi, candyGuard);
    otherGroups = (before.groups || [])
      .filter((g) => String(g.label).trim() !== GROUP_LABEL)
      .map((g) => ({
        label: g.label,
        guards: g.guards,
      }));
  } catch {
    /* ignore — still write shop default + mystry */
  }

  const builder = transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(setComputeUnitPrice(umi, { microLamports: 100_000 }))
    .add(
      updateCandyGuard(umi, {
        candyGuard,
        guards: shopGuards(target.priceSol, target.wave, treasury),
        groups: [...otherGroups, mysteryGroup(vaultPk)],
      }),
    );

  const tx = await builder.sendAndConfirm(umi, sendOpts);
  const signature = sigOf(tx);
  console.log("✅ Updated. Tx:", signature);

  try {
    const after = await fetchCandyGuard(umi, candyGuard);
    const g = (after.groups || []).find(
      (x) => String(x.label).trim() === GROUP_LABEL,
    );
    console.log(
      "mystry group:",
      g
        ? `thirdParty=${g.guards?.thirdPartySigner ? "yes" : "no"} mintLimit=${JSON.stringify(g.guards?.mintLimit ?? null)}`
        : "MISSING",
    );
  } catch {
    /* ignore */
  }

  return { ...target, signature, group: GROUP_LABEL };
}

async function main() {
  if (CLUSTER === "mainnet" && CONFIRM !== "yes") {
    console.error("Set CONFIRM_MAINNET=yes to run on mainnet.");
    process.exit(1);
  }
  if (!VAULT || VAULT.length < 32) {
    console.error("Set MYSTERY_VAULT_PUBKEY to the Mystery vault address.");
    process.exit(1);
  }

  console.log("=== Add Candy Guard group", GROUP_LABEL, "===");
  console.log("RPC:    ", RPC_URL);
  console.log("Keypair:", KEYPAIR_PATH);
  console.log("Vault:  ", VAULT);
  console.log("Targets:", TARGETS.length);

  const umi = createUmi(RPC_URL).use(mplCore()).use(mplCandyMachine());
  const kp = umi.eddsa.createKeypairFromSecretKey(loadSecret());
  umi.use(keypairIdentity(kp));
  console.log("Signer: ", umi.identity.publicKey.toString());
  if (umi.identity.publicKey.toString() !== TREASURY) {
    console.warn(
      "⚠ Signer is not TREASURY (AdvMvv6…). Guard updates need the guard authority.",
    );
  }

  const treasury = publicKey(TREASURY);
  const vaultPk = publicKey(VAULT);
  const sendOpts = {
    send: { skipPreflight: false, maxRetries: 5 },
    confirm: { commitment: "confirmed" },
  };

  const results = [];
  for (const t of TARGETS) {
    try {
      results.push(await updateOne(umi, t, treasury, vaultPk, sendOpts));
    } catch (e) {
      console.error(`❌ ${t.name}:`, e?.message || e);
      results.push({ ...t, error: String(e?.message || e) });
    }
  }

  const outPath = path.join(__dirname, "mystery-guard-group-result.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        group: GROUP_LABEL,
        vault: VAULT,
        updatedAt: new Date().toISOString(),
        results,
      },
      null,
      2,
    ),
  );
  console.log("\nSaved:", outPath);
  console.log(
    "Next: redeploy mystery-open (mint uses group mystry + vault thirdPartySigner).",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
