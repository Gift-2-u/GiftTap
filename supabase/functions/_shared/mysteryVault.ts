/**
 * Mystery Gift vault (10% of max $G2U supply).
 *
 * Pays:
 *   - Bonus G2U SPL → player game wallet (when MYSTERY_PAYOUTS_LIVE)
 *   - Exclusive NFT: vault mints via Candy Guard group "mystry"
 *     (thirdPartySigner = vault, no shop solPayment, high mintLimit),
 *     then transfers asset to player pubkey. Never touches player secrets/SOL.
 *     Run scripts/nft/add-mystery-guard-group.mjs once so guards exist on-chain.
 *
 * Edge secrets:
 *   MYSTERY_VAULT_PUBKEY / MYSTERY_VAULT_SECRET
 *   G2U_MINT (Bonus G2U)
 *   MYSTERY_PAYOUTS_LIVE (Bonus G2U only)
 *   VITE_SOLANA_RPC_URL
 */

import { Keypair } from "npm:@solana/web3.js@1.98.4";
import bs58 from "npm:bs58";
import { createUmi } from "npm:@metaplex-foundation/umi-bundle-defaults@1.5.1";
import {
  mplCore,
  transferV1,
} from "npm:@metaplex-foundation/mpl-core@1.10.0";
import {
  mintV1,
  mplCandyMachine,
} from "npm:@metaplex-foundation/mpl-core-candy-machine@0.3.0";
import { setComputeUnitLimit } from "npm:@metaplex-foundation/mpl-toolbox@0.10.0";
import {
  generateSigner,
  keypairIdentity,
  publicKey,
  some,
  transactionBuilder,
} from "npm:@metaplex-foundation/umi@1.5.1";

export type MysteryVaultConfig = {
  pubkey: string;
  g2uMint: string;
  hasSecret: boolean;
  payoutsLiveFlag: boolean;
  g2uTransferReady: boolean;
  nftMintReady: boolean;
  source: "mystery_vault_10pct";
};

function env(name: string): string {
  try {
    return String(Deno.env.get(name) || "").trim();
  } catch {
    return "";
  }
}

export function getMysteryVaultConfig(): MysteryVaultConfig {
  const pubkey =
    env("MYSTERY_VAULT_PUBKEY") ||
    env("MYSTERY_VAULT_WALLET") ||
    env("MYSTERY_GIFT_VAULT");
  const g2uMint = env("G2U_MINT") || env("G2U_TOKEN_MINT") || env("GFT_MINT");
  const hasSecret = !!(
    env("MYSTERY_VAULT_SECRET") ||
    env("MYSTERY_VAULT_PRIVATE_KEY") ||
    env("MYSTERY_VAULT_KEYPAIR")
  );
  const payoutsLiveFlag = ["1", "true", "yes", "on"].includes(
    env("MYSTERY_PAYOUTS_LIVE").toLowerCase(),
  );

  return {
    pubkey,
    g2uMint,
    hasSecret,
    payoutsLiveFlag,
    g2uTransferReady: payoutsLiveFlag && !!pubkey && !!g2uMint && hasSecret,
    nftMintReady: hasSecret && !!pubkey,
    source: "mystery_vault_10pct",
  };
}

export function mysteryVaultPublicMeta(
  cfg: MysteryVaultConfig = getMysteryVaultConfig(),
) {
  return {
    source: cfg.source,
    vault: cfg.pubkey || null,
    g2u_mint: cfg.g2uMint || null,
    g2u_live: cfg.g2uTransferReady,
    nft_mint_live: cfg.nftMintReady,
  };
}

const COLLECTION = "FQPYWSohCPnS57W2AWAqwmQM21KRxGi4YXcCaiXUghPD";
const TREASURY = "AdvMvv6GzGvdLRtuxaso1Eubk7jmn6LCZEeEFHn22yeb";

type CmCfg = {
  candyMachine: string;
  candyGuard: string;
  collection: string;
  treasury: string;
  priceSol: number;
  wave: number;
  name: string;
};

/** Wave-1 CMs (mirrors client mint*.js) — Mystery exclusive rolls. */
const MYSTERY_CMS: Record<string, Record<string, CmCfg>> = {
  fate: {
    common: {
      candyMachine: "8Xsen3GEmVKfrirGrENV18We8HN3SWx4gFHxuD8USuuU",
      candyGuard: "4v7c2tdq9a98nHX1yKJdLVn22KTfws6mUWA8X4YuVkpb",
      collection: COLLECTION,
      treasury: TREASURY,
      priceSol: 0.05,
      wave: 1,
      name: "Fate Common",
    },
  },
  echo: {
    common: {
      candyMachine: "2paivyfk7tLazrxs8rXDQx1CLMFXcbuXVpE8n3EvhqUM",
      candyGuard: "7zJVBJxM6TrXpjeMDcLBaHiVZ1Si8YAoVjyTJEY5nUtF",
      collection: COLLECTION,
      treasury: TREASURY,
      priceSol: 0.05,
      wave: 1,
      name: "Echo Common",
    },
  },
  rush: {
    common: {
      candyMachine: "2T5papzGBSCZjCa1dg3gFMro5A3JH3WQdRbu96WwVp59",
      candyGuard: "BncE3BaFZxjQcqAzZZ1qme6hKPKSQBWnwP6EetbonKM2",
      collection: COLLECTION,
      treasury: TREASURY,
      priceSol: 0.05,
      wave: 1,
      name: "Rush Common",
    },
  },
  shadow: {
    common: {
      candyMachine: "6eCDTALwmkSndK6guUFkmNMo9AoqAWJoNR7PaqHumVqD",
      candyGuard: "D7h5id6Q4NQPk9V9Md6iBRTpJuUjhvNyCG4Hxe9gqRXn",
      collection: COLLECTION,
      treasury: TREASURY,
      priceSol: 0.05,
      wave: 1,
      name: "Shadow Common",
    },
  },
  locksmith: {
    rare: {
      candyMachine: "AQbpmorxtBaaipqm4WcmCyBzci8Qf8km9qF8kAidsMkC",
      candyGuard: "CBK1Zwsnwwks3BLmhHASzD9Rsq8i2Xgs6RWMZGNSQRJ9",
      collection: COLLECTION,
      treasury: TREASURY,
      priceSol: 0.1,
      wave: 1,
      name: "GiftLocksmith",
    },
  },
  star: {
    shard: {
      candyMachine: "CRut6UNyve3JhZ86E6S4zx17sHQWj8XYk1wZc7YEnSjP",
      candyGuard: "DFrUCFbABmF3BNgwZVnEyyciNqq68ccXJ3SptgxuvkmS",
      collection: COLLECTION,
      treasury: TREASURY,
      priceSol: 0.1,
      wave: 1,
      name: "Star Badge",
    },
  },
};

function rpcUrl(): string {
  return (
    env("VITE_SOLANA_RPC_URL") ||
    env("SOLANA_RPC_URL") ||
    "https://api.mainnet-beta.solana.com"
  );
}

function parseSecretKey(raw: string): Uint8Array {
  const s = String(raw || "").trim();
  if (!s) throw new Error("Missing vault secret");
  if (s.startsWith("[")) {
    return Uint8Array.from(JSON.parse(s) as number[]);
  }
  return bs58.decode(s);
}

function resolveCm(kind: string, rarity: string): CmCfg {
  const k = String(kind || "").toLowerCase();
  const r = String(rarity || "").toLowerCase();
  const byKind = MYSTERY_CMS[k];
  if (!byKind) throw new Error(`Unknown Mystery NFT kind: ${kind}`);
  const cfg =
    byKind[r] ||
    byKind.common ||
    byKind.rare ||
    byKind.shard ||
    Object.values(byKind)[0];
  if (!cfg?.candyMachine || !cfg?.candyGuard) {
    throw new Error(`Candy machine not configured for ${kind}/${rarity}`);
  }
  return cfg;
}

function loadVaultKeypair(): Keypair {
  const raw =
    env("MYSTERY_VAULT_SECRET") ||
    env("MYSTERY_VAULT_PRIVATE_KEY") ||
    env("MYSTERY_VAULT_KEYPAIR");
  return Keypair.fromSecretKey(parseSecretKey(raw));
}

export type MysteryMintResult = {
  ok: boolean;
  asset?: string;
  signature?: string;
  transferSignature?: string;
  owner?: string;
  name?: string;
  error?: string;
  pending?: boolean;
};

/**
 * Vault-only mint-on-win:
 * 1) Mystery vault signs CM mint (NFT owned by vault briefly)
 * 2) transferV1 → player game wallet pubkey (from DB — no player secret)
 */
export async function mintMysteryNftToPlayer(opts: {
  kind: string;
  rarity: string;
  playerId: string;
  playerWallet: string;
  /** @deprecated ignored — we never touch player secrets */
  encryptedVault?: string | null;
}): Promise<MysteryMintResult> {
  const cfgVault = getMysteryVaultConfig();
  if (!cfgVault.nftMintReady) {
    return {
      ok: false,
      pending: true,
      error: "Mystery vault secret not configured for NFT mint",
    };
  }

  const toWallet = String(opts.playerWallet || "").trim();
  if (toWallet.length < 32) {
    return {
      ok: false,
      pending: true,
      error: "Player has no game wallet_address — cannot deliver NFT",
    };
  }

  let cm: CmCfg;
  try {
    cm = resolveCm(opts.kind, opts.rarity);
  } catch (e) {
    return {
      ok: false,
      pending: true,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  try {
    const vaultKp = loadVaultKeypair();
    const umi = createUmi(rpcUrl()).use(mplCore()).use(mplCandyMachine());
    const umiKp = umi.eddsa.createKeypairFromSecretKey(vaultKp.secretKey);
    umi.use(keypairIdentity(umiKp));

    // Group "mystry": vault thirdPartySigner, no shop solPayment, high mintLimit.
    // Identity = vault already signs; thirdPartySigner must be the same vault pubkey.
    const vaultPk = publicKey(umi.identity.publicKey);
    const asset = generateSigner(umi);
    const mintBuilder = transactionBuilder()
      .add(setComputeUnitLimit(umi, { units: 400_000 }))
      .add(
        mintV1(umi, {
          candyMachine: publicKey(cm.candyMachine),
          asset,
          collection: publicKey(cm.collection),
          candyGuard: publicKey(cm.candyGuard),
          group: some("mystry"),
          mintArgs: {
            // Guard group enforces botTax + thirdPartySigner + high mintLimit
            thirdPartySigner: some({ signer: vaultPk }),
            mintLimit: some({ id: 99 }),
          },
        }),
      );

    const mintResult = await mintBuilder.sendAndConfirm(umi, {
      confirm: { commitment: "confirmed" },
      send: { skipPreflight: false },
    });

    const mintSig =
      typeof mintResult.signature === "string"
        ? mintResult.signature
        : bs58.encode(mintResult.signature as Uint8Array);

    const transferBuilder = transactionBuilder().add(
      transferV1(umi, {
        asset: asset.publicKey,
        newOwner: publicKey(toWallet),
        collection: publicKey(cm.collection),
      }),
    );

    const transferResult = await transferBuilder.sendAndConfirm(umi, {
      confirm: { commitment: "confirmed" },
      send: { skipPreflight: false },
    });

    const transferSig =
      typeof transferResult.signature === "string"
        ? transferResult.signature
        : bs58.encode(transferResult.signature as Uint8Array);

    return {
      ok: true,
      asset: asset.publicKey.toString(),
      signature: mintSig,
      transferSignature: transferSig,
      owner: toWallet,
      name: cm.name,
    };
  } catch (e) {
    return {
      ok: false,
      pending: true,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
