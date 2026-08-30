/**
 * Airdrop payout wallets — separate from Mystery vault.
 *
 * Edge secrets (set in Supabase):
 *   AIRDROP_L5_VAULT_PUBKEY / AIRDROP_L5_VAULT_SECRET
 *   AIRDROP_WEEKLY_VAULT_PUBKEY / AIRDROP_WEEKLY_VAULT_SECRET
 *   AIRDROP_MONTHLY_VAULT_PUBKEY / AIRDROP_MONTHLY_VAULT_SECRET
 *   G2U_MINT (optional; defaults to canonical mint)
 *   VITE_SOLANA_RPC_URL / SOLANA_RPC_URL
 */

import { Keypair } from "npm:@solana/web3.js@1.98.4";
import bs58 from "npm:bs58";

export type AirdropSource = "l5" | "weekly" | "monthly";

function env(name: string): string {
  try {
    return String(Deno.env.get(name) || "").trim();
  } catch {
    return "";
  }
}

function rpcUrl(): string {
  return (
    env("VITE_SOLANA_RPC_URL") ||
    env("SOLANA_RPC_URL") ||
    "https://api.mainnet-beta.solana.com"
  );
}

function g2uMint(): string {
  return (
    env("G2U_MINT") ||
    env("G2U_TOKEN_MINT") ||
    "EvFu9qKTNi3wWDbgnm5qmZjLFUHDN3o4A8HjUrqaGMBR"
  );
}

function parseSecretKey(raw: string): Uint8Array {
  const s = String(raw || "").trim();
  if (!s) throw new Error("Missing airdrop vault secret");
  if (s.startsWith("[")) return Uint8Array.from(JSON.parse(s) as number[]);
  return bs58.decode(s);
}

const SOURCE_ENV: Record<
  AirdropSource,
  { pub: string; secret: string; label: string }
> = {
  l5: {
    pub: "AIRDROP_L5_VAULT_PUBKEY",
    secret: "AIRDROP_L5_VAULT_SECRET",
    label: "L5 airdrop",
  },
  weekly: {
    pub: "AIRDROP_WEEKLY_VAULT_PUBKEY",
    secret: "AIRDROP_WEEKLY_VAULT_SECRET",
    label: "Weekly airdrop",
  },
  monthly: {
    pub: "AIRDROP_MONTHLY_VAULT_PUBKEY",
    secret: "AIRDROP_MONTHLY_VAULT_SECRET",
    label: "Monthly airdrop",
  },
};

export function getAirdropVaultConfig(source: AirdropSource) {
  const keys = SOURCE_ENV[source];
  if (!keys) throw new Error(`Unknown airdrop source: ${source}`);
  const pubkey = env(keys.pub) || env(keys.pub.replace("_PUBKEY", "_WALLET"));
  const secretRaw =
    env(keys.secret) ||
    env(keys.secret.replace("_SECRET", "_PRIVATE_KEY")) ||
    env(keys.secret.replace("_SECRET", "_KEYPAIR"));
  return {
    source,
    label: keys.label,
    pubkey,
    hasSecret: !!secretRaw,
    mint: g2uMint(),
    ready: !!(pubkey && secretRaw && g2uMint()),
  };
}

function loadSourceKeypair(source: AirdropSource): Keypair {
  const keys = SOURCE_ENV[source];
  const secretRaw =
    env(keys.secret) ||
    env(keys.secret.replace("_SECRET", "_PRIVATE_KEY")) ||
    env(keys.secret.replace("_SECRET", "_KEYPAIR"));
  return Keypair.fromSecretKey(parseSecretKey(secretRaw));
}

/**
 * Build claim tx: vault transfers $G2U → player; **player is fee payer**
 * (pays network fee + ATA rent). Vault partial-signs; client signs & sends.
 */
export async function buildAirdropClaimPartialTx(opts: {
  source: AirdropSource;
  amountUi: number;
  toWallet: string;
}): Promise<
  | {
      ok: true;
      tx_base64: string;
      vault: string;
      mint: string;
      amount_raw: string;
      blockhash: string;
      min_sol_lamports: number;
    }
  | { ok: false; error: string }
> {
  const cfg = getAirdropVaultConfig(opts.source);
  if (!cfg.ready) {
    return {
      ok: false,
      error: `${cfg.label} vault not configured (pubkey/secret/mint)`,
    };
  }
  const toWallet = String(opts.toWallet || "").trim();
  if (toWallet.length < 32) {
    return { ok: false, error: "Player has no game wallet address" };
  }
  const amountUi = Number(opts.amountUi);
  if (!Number.isFinite(amountUi) || amountUi <= 0) {
    return { ok: false, error: "Nothing to claim" };
  }

  try {
    const {
      Connection,
      PublicKey,
      Transaction,
      ComputeBudgetProgram,
    } = await import("npm:@solana/web3.js@1.98.4");
    const {
      getMint,
      getAssociatedTokenAddressSync,
      createAssociatedTokenAccountIdempotentInstruction,
      createTransferCheckedInstruction,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    } = await import("npm:@solana/spl-token@0.4.9");

    const vaultKp = loadSourceKeypair(opts.source);
    const connection = new Connection(rpcUrl(), "confirmed");
    const mintPk = new PublicKey(cfg.mint);
    const toPk = new PublicKey(toWallet);
    const mintInfo = await getMint(connection, mintPk);
    const decimals = mintInfo.decimals;
    const amountRaw = BigInt(Math.round(amountUi * 10 ** decimals));
    if (amountRaw <= 0n) return { ok: false, error: "Amount too small" };

    const fromAta = getAssociatedTokenAddressSync(mintPk, vaultKp.publicKey);
    const toAta = getAssociatedTokenAddressSync(mintPk, toPk);

    // Player pays: fee + idempotent ATA create
    const tx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
      createAssociatedTokenAccountIdempotentInstruction(
        toPk,
        toAta,
        toPk,
        mintPk,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
      createTransferCheckedInstruction(
        fromAta,
        mintPk,
        toAta,
        vaultKp.publicKey,
        amountRaw,
        decimals,
      ),
    );

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = toPk;
    tx.partialSign(vaultKp);

    const serialized = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    let binary = "";
    for (let i = 0; i < serialized.length; i++) {
      binary += String.fromCharCode(serialized[i]);
    }

    return {
      ok: true,
      tx_base64: btoa(binary),
      vault: vaultKp.publicKey.toBase58(),
      mint: cfg.mint,
      amount_raw: amountRaw.toString(),
      blockhash,
      // ~0.01 SOL covers fee + possible ATA rent with headroom
      min_sol_lamports: 10_000_000,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Confirm a user-submitted claim signature: fee payer = player, success, G2U credited.
 */
export async function verifyAirdropClaimTx(opts: {
  signature: string;
  source: AirdropSource;
  amountUi: number;
  toWallet: string;
}): Promise<{ ok: boolean; error?: string }> {
  const cfg = getAirdropVaultConfig(opts.source);
  const sig = String(opts.signature || "").trim();
  const toWallet = String(opts.toWallet || "").trim();
  if (sig.length < 32) return { ok: false, error: "Invalid signature" };
  if (toWallet.length < 32) return { ok: false, error: "Invalid wallet" };

  try {
    const { Connection } = await import("npm:@solana/web3.js@1.98.4");
    const connection = new Connection(rpcUrl(), "confirmed");
    const parsed = await connection.getParsedTransaction(sig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!parsed) {
      return { ok: false, error: "Transaction not found yet — wait and retry" };
    }
    if (parsed.meta?.err) {
      return { ok: false, error: "On-chain claim transaction failed" };
    }

    const keys = parsed.transaction.message.accountKeys || [];
    const feePayer =
      (keys[0] &&
        (typeof keys[0] === "string"
          ? keys[0]
          : keys[0].pubkey?.toBase58?.() || String(keys[0].pubkey || ""))) ||
      "";
    if (feePayer !== toWallet) {
      return {
        ok: false,
        error: "Claim fee must be paid by your game wallet",
      };
    }

    const mint = cfg.mint;
    const amountUi = Number(opts.amountUi) || 0;
    const pre = parsed.meta?.preTokenBalances || [];
    const post = parsed.meta?.postTokenBalances || [];
    let credited = 0;
    for (const p of post) {
      if (String(p.mint) !== mint) continue;
      if (String(p.owner) !== toWallet) continue;
      const postAmt = Number(p.uiTokenAmount?.uiAmount) || 0;
      const preRow = pre.find(
        (x) =>
          x.accountIndex === p.accountIndex ||
          (String(x.mint) === mint && String(x.owner) === toWallet),
      );
      const preAmt = Number(preRow?.uiTokenAmount?.uiAmount) || 0;
      credited = Math.max(credited, postAmt - preAmt);
    }
    if (credited + 1e-6 < amountUi * 0.99) {
      return {
        ok: false,
        error: `Claim tx did not credit enough $G2U (saw ${credited}, need ${amountUi})`,
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Legacy: vault pays fee and sends (prefer buildAirdropClaimPartialTx + user sign).
 */
export async function transferAirdropG2u(opts: {
  source: AirdropSource;
  amountUi: number;
  toWallet: string;
}): Promise<{ ok: boolean; signature?: string; error?: string }> {
  const built = await buildAirdropClaimPartialTx(opts);
  if (!built.ok) return { ok: false, error: built.error };
  return {
    ok: false,
    error:
      "Server-paid airdrop claims are disabled — use user-signed claim (prepare + confirm)",
  };
}
