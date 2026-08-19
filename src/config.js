import { PublicKey } from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey("CX5aqenEeWvfwvhF8Xek8Dd6sVPn8uHRhXafbKQvUAxy");
export const MINT_ADDRESS = new PublicKey("EvFu9qKTNi3wWDbgnm5qmZjLFUHDN3o4A8HjUrqaGMBR"); // Gift2U ($G2U)
export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
// 3. The RPC Endpoint (Where your app talks to the blockchain)
export const RPC_ENDPOINT =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SOLANA_RPC_URL) ||
  'https://api.mainnet-beta.solana.com';

export const VAULT_AUTHORITY_PDA = new PublicKey("BiC9NrLP53gmGm4nc5dYv8zXc7e6sJKkJxJAVGxGqAyv");
export const VAULT_TOKEN_ACCOUNT = new PublicKey("6BYCd59YbXVawaurM6FE7BVugH7tuyNTS7hj8F6QMDWk");