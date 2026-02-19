import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "https://esm.sh/@solana/web3.js@1.78.0"

serve(async (req) => {
  try {
    const { telegram_id, amount, toAddress } = await req.json()
    
    // 1. Setup Connection using your Private RPC
    const connection = new Connection(Deno.env.get("VITE_SOLANA_RPC_URL")!, "confirmed")
    
    // 2. Load your Treasury/Project Master Key (from Supabase Secrets)
    const secretKey = Uint8Array.from(JSON.parse(Deno.env.get("PROJECT_WALLET_SECRET")!))
    const fromWallet = Keypair.fromSecretKey(secretKey)

    // 3. Build the Transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromWallet.publicKey,
        toPubkey: new PublicKey(toAddress),
        lamports: amount * LAMPORTS_PER_SOL,
      })
    )

    // 4. Sign and Send
    const signature = await connection.sendTransaction(transaction, [fromWallet])
    
    return new Response(JSON.stringify({ success: true, signature }), { headers: { "Content-Type": "application/json" } })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400 })
  }
})