import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, ComputeBudgetProgram } from "@solana/web3.js";
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { telegram_id, amount, toAddress } = req.body;
    const numAmount = Number(amount);

    // --- 1. KEY VALIDATION ---
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const rpc = process.env.SOLANA_RPC_URL || process.env.VITE_SOLANA_RPC_URL;
    const secretStr = process.env.PROJECT_WALLET_SECRET;

    if (!url || !key || !rpc || !secretStr) {
      throw new Error(`Missing Env Vars: URL:${!!url} KEY:${!!key} RPC:${!!rpc} SECRET:${!!secretStr}`);
    }

    const supabase = createClient(url, key);
    const connection = new Connection(rpc, "confirmed");

    // --- 2. WALLET VALIDATION ---
    let fromWallet;
    try {
      const cleanedSecret = secretStr.trim();
      fromWallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(cleanedSecret)));
    } catch (e) {
      throw new Error("Invalid PROJECT_WALLET_SECRET format. Must be a JSON array [1,2,3...]");
    }

    // --- 3. DATABASE CHECK ---
    const { data: user, error: userError } = await supabase
      .from('players')
      .select('sol_balance')
      .eq('telegram_id', String(telegram_id))
      .single();

    if (userError || !user) throw new Error("User not found in database.");
    if (user.sol_balance < numAmount) throw new Error("Insufficient balance in app.");

    // --- 4. SOLANA BALANCE CHECK (The "Gas" Check) ---
    const serverBalance = await connection.getBalance(fromWallet.publicKey);
    if (serverBalance < 0.002 * LAMPORTS_PER_SOL) {
      throw new Error(`Server wallet is low on gas (${serverBalance / LAMPORTS_PER_SOL} SOL). Send 0.01 SOL to ${fromWallet.publicKey.toBase58()}`);
    }

    // --- 5. TRANSACTION BUILDING ---
    // Safety check: ensure we aren't sending a negative amount
    const mainAmount = Math.floor((numAmount - 0.0006) * LAMPORTS_PER_SOL);
    if (mainAmount <= 0) throw new Error("Withdraw amount is too small to cover network fees.");

    const transaction = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }),
      SystemProgram.transfer({
        fromPubkey: fromWallet.publicKey,
        toPubkey: new PublicKey(toAddress),
        lamports: mainAmount,
      }),
      SystemProgram.transfer({
        fromPubkey: fromWallet.publicKey,
        toPubkey: new PublicKey("8G7uEcPS6dwA5wW9bGoqi98EzBunF8trjbbFJkgkvBPm"),
        lamports: Math.floor(0.0005 * LAMPORTS_PER_SOL),
      })
    );

    const { blockhash } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromWallet.publicKey;

    // --- 6. EXECUTION ---
    const signature = await connection.sendTransaction(transaction, [fromWallet], { skipPreflight: true });
    
    // Update DB
    await supabase.from('players')
      .update({ sol_balance: user.sol_balance - numAmount })
      .eq('telegram_id', String(telegram_id));

    return res.status(200).json({ success: true, signature });

  } catch (err) {
    console.error("WITHDRAW_ERROR:", err.message);
    return res.status(500).json({ 
      error: err.message,
      tip: "Check your Vercel logs or the 'Response' tab in Chrome DevTools."
    });
  }
}