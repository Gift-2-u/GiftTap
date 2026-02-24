import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// 1. ADDED ComputeBudgetProgram to the imports!
import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, ComputeBudgetProgram } from "https://esm.sh/@solana/web3.js@1.78.0"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', // Add this line
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    const { telegram_id, amount, toAddress } = await req.json()

    // Using the telegram_id here fixes the "underlined" warning in your editor
    console.log(`Withdrawing ${amount} for user ${telegram_id}`);

    // Initialize Supabase Client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // USE THE TELEGRAM_ID: Check user balance
    const { data: user, error: userError } = await supabase
      .from('users') // Replace with your actual table name
      .select('balance')
      .eq('telegram_id', telegram_id)
      .single()

    if (userError || !user || user.balance < amount) {
      throw new Error("Insufficient sol in game account.");
    }
    
    // Setup Connection using your Private RPC
    const connection = new Connection(Deno.env.get("VITE_SOLANA_RPC_URL")!, "confirmed")
    
    // Load your Treasury/Project Master Key 
    const secretKey = Uint8Array.from(JSON.parse(Deno.env.get("PROJECT_WALLET_SECRET")!))
    const fromWallet = Keypair.fromSecretKey(secretKey)

    // 2. MATH: Calculate exactly what the player gets
    // Project Fee = 0.0005. Network Buffer = ~0.00002. Total deduction = 0.00052.
    const totalDeduction = 0.00052; 
    const playerReceives = amount - totalDeduction;

    // Safety check: Don't allow withdrawals if the amount doesn't cover the fees
    if (playerReceives <= 0) {
      throw new Error("Withdrawal amount is too small to cover network and project fees.");
    }

    // 3. Build the Transaction
    const transaction = new Transaction().add(
      // --- PRIORITY FEES (Tip to the network) ---
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }),

      // --- SEND NET AMOUNT TO PLAYER ---
      SystemProgram.transfer({
        fromPubkey: fromWallet.publicKey,
        toPubkey: new PublicKey(toAddress),
        lamports: Math.floor(playerReceives * LAMPORTS_PER_SOL),
      }),

      // --- SEND PROJECT FEE TO TREASURY ---
      SystemProgram.transfer({
        fromPubkey: fromWallet.publicKey,
        toPubkey: new PublicKey("8G7uEcPS6dwA5wW9bGoqi98EzBunF8trjbbFJkgkvBPm"),
        lamports: Math.floor(0.0005 * LAMPORTS_PER_SOL),
      })
    )

    // 4. Get the latest blockhash (Crucial for modern Solana transactions)
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.feePayer = fromWallet.publicKey;

    // 5. Sign and Send
    const signature = await connection.sendTransaction(transaction, [fromWallet])

    // 2. Deduct the SOL from the database after the transaction succeeds
    await supabase
      .from('players')
      .update({ sol_balance: user.balance - amount })
      .eq('telegram_id', telegram_id)
    
    return new Response(JSON.stringify({ success: true, signature }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})