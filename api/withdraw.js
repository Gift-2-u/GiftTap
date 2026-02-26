import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, ComputeBudgetProgram } from "@solana/web3.js";
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Allow Vercel to handle the preflight
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // 2. Define Variables (This fixes the ReferenceError)
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Missing Environment Variables");
    return res.status(500).json({ error: "Server Configuration Error: Missing Supabase credentials." });
  }

  // 3. Initialize Supabase
  const supabase = createClient(url, key);

  try {
    const { telegram_id, amount, toAddress } = req.body;
    const numAmount = Number(amount);

    if (!telegram_id || !numAmount || !toAddress) {
      return res.status(400).json({ error: "Missing fields: telegram_id, amount, or toAddress" });
    }

    // 4. Verify Balance in DB
    const { data: user, error: userError } = await supabase
      .from('players')
      .select('sol_balance')
      .eq('telegram_id', String(telegram_id))
      .single();

    if (userError || !user) return res.status(404).json({ error: "User not found" });
    if (user.sol_balance < numAmount) return res.status(400).json({ error: "Insufficient balance" });

    // 5. Solana Transaction Logic
    const connection = new Connection(process.env.VITE_SOLANA_RPC_URL, "confirmed");
    const secretKey = Uint8Array.from(JSON.parse(process.env.PROJECT_WALLET_SECRET));
    const fromWallet = Keypair.fromSecretKey(secretKey);

    const transaction = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }),
      SystemProgram.transfer({
        fromPubkey: fromWallet.publicKey,
        toPubkey: new PublicKey(toAddress),
        lamports: Math.floor((numAmount - 0.00052) * LAMPORTS_PER_SOL),
      }),
      SystemProgram.transfer({
        fromPubkey: fromWallet.publicKey,
        toPubkey: new PublicKey("8G7uEcPS6dwA5wW9bGoqi98EzBunF8trjbbFJkgkvBPm"),
        lamports: Math.floor(0.0005 * LAMPORTS_PER_SOL),
      })
    );

    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromWallet.publicKey;

    // 6. Execute Transaction
    const signature = await connection.sendTransaction(transaction, [fromWallet]);
    
    // 7. Deduct Balance from DB
    const { error: updateError } = await supabase
      .from('players')
      .update({ sol_balance: user.sol_balance - numAmount })
      .eq('telegram_id', String(telegram_id));

    if (updateError) throw new Error("Transaction sent but DB failed to update.");

    return res.status(200).json({ success: true, signature });

  } catch (err) {
    console.error("Handler Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}