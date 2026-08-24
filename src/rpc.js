// Solana RPC — set VITE_SOLANA_RPC_URL in env (never ship a private Helius key in source).
export const RPC_URL =
  import.meta.env.VITE_SOLANA_RPC_URL ||
  'https://api.mainnet-beta.solana.com';
