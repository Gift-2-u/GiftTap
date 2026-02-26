import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, ComputeBudgetProgram } from "@solana/web3.js";
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // 1. Handle CORS for your Telegram Mini App
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { telegram_id, amount, toAddress } = req.body;

    // 1. Initialize Supabase (Use Service Role Key)
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const connection = new Connection(process.env.VITE_SOLANA_RPC_URL, "confirmed");
    const secretKey = Uint8Array.from(JSON.parse(process.env.PROJECT_WALLET_SECRET));
    const fromWallet = Keypair.fromSecretKey(secretKey);

    // 2. Database Check
    const { data: user, error: userError } = await supabase
      .from('players')
      .select('sol_balance')
      .eq('telegram_id', String(telegram_id))
      .single();

    if (userError || !user || user.sol_balance < amount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // 4. Build Full Transaction (Including Fees & Treasury)
    const transaction = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }),
      SystemProgram.transfer({
        fromPubkey: fromWallet.publicKey,
        toPubkey: new PublicKey(toAddress),
        lamports: Math.floor((amount - 0.00052) * LAMPORTS_PER_SOL),
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

    // 5. Send and WAIT for confirmation (Vercel gives us enough time!)
    const signature = await connection.sendTransaction(transaction, [fromWallet]);
    
    // 6. Deduct from DB
    await supabase
      .from('players')
      .update({ sol_balance: user.sol_balance - amount })
      .eq('telegram_id', String(telegram_id));

    return res.status(200).json({ success: true, signature });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}