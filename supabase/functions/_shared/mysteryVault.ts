/**
 * Mystery Gift vault (10% of max $G2U supply).
 *
 * Pays:
 *   - Bonus G2U SPL prizes → player game wallet
 *   - Candy Machine mint fees / mint authority for Exclusive NFT wins
 *
 * Edge secrets (Supabase → Edge Functions → Secrets):
 *   MYSTERY_VAULT_PUBKEY     — public address of the 10% Mystery vault
 *   MYSTERY_VAULT_SECRET     — base58 or JSON secret key (payer) — keep private
 *   G2U_MINT                 — $G2U SPL mint address
 *   MYSTERY_PAYOUTS_LIVE     — "true" only when ready to send on-chain
 *
 * Until MYSTERY_PAYOUTS_LIVE=true (+ pubkey + mint + secret), wins stay
 * queued on the player (mystery_g2u_* / mystery_nft_pending) and are tagged
 * with this vault as the payer so claim/mint knows the source wallet.
 */

export type MysteryVaultConfig = {
  /** Public Mystery vault (10% allocation) */
  pubkey: string;
  /** $G2U mint */
  g2uMint: string;
  /** Secret key present in Edge env (never returned to clients) */
  hasSecret: boolean;
  /** Explicit go-live switch */
  payoutsLiveFlag: boolean;
  /** Ready to transfer Bonus G2U on-chain */
  g2uTransferReady: boolean;
  /** Ready to mint Exclusive NFTs from vault as payer */
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
    nftMintReady: payoutsLiveFlag && !!pubkey && hasSecret,
    source: "mystery_vault_10pct",
  };
}

/** Safe subset for API / inventory tags (no secrets). */
export function mysteryVaultPublicMeta(cfg: MysteryVaultConfig = getMysteryVaultConfig()) {
  return {
    source: cfg.source,
    vault: cfg.pubkey || null,
    g2u_mint: cfg.g2uMint || null,
    g2u_live: cfg.g2uTransferReady,
    nft_mint_live: cfg.nftMintReady,
  };
}
