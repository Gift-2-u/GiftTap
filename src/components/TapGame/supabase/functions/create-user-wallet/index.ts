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
    
    const wallet = Keypair.generate();
    const publicKey = wallet.publicKey.toString();
    const secretKey = wallet.secretKey; // This is a Uint8Array

    // 2. Initialize Supabase Admin
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 3. Save to Database
    // Note: We are saving the secret key. Ensure RLS is tight!
    const { data, error } = await supabase
      .from('players')
      .upsert(
        { 
          wallet_address: publicKey,
          encrypted_key: secretKeyString,
          shard_balance: 0,
          last_energy: 1000,
          last_updated: new Date().toISOString()
        }, 
        { onConflict: 'wallet_address' } // Tell it exactly which column to use for matching
      )
      .select('wallet_address') // Only ask for the wallet back, NOT the whole row (prevents looking for 'id')

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