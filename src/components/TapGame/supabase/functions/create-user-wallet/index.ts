import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Keypair } from 'https://esm.sh/@solana/web3.js@1.87.6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { userId } = await req.json()
    
    // 1. Generate New Solana Wallet
    const wallet = Keypair.generate()
    const publicKey = wallet.publicKey.toBase58()
    const secretKeyString = JSON.stringify(Array.from(wallet.secretKey))

    // 2. Initialize Supabase Admin
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 3. Save to Database
    // Note: We are saving the secret key. Ensure RLS is tight!
    const { error } = await supabase
      .from('players')
      .update({ 
        wallet_address: publicKey,
        encrypted_key: secretKeyString // For now, we'll store the string. 
      })
      .eq('id', userId)

    if (error) throw error

    return new Response(JSON.stringify({ publicKey }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})