import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("CX5aqenEeWvfwvhF8Xek8Dd6sVPn8uHRhXafbKQvUAxy");

const [vaultAuthority, bump] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault_authority")],
  PROGRAM_ID
);

console.log("===============================================");
console.log("YOUR VAULT AUTHORITY PDA:", vaultAuthority.toBase58());
console.log("BUMP SEED:", bump);
console.log("===============================================");