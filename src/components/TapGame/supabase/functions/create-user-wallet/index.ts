import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { Keypair } from "https://esm.sh/@solana/web3.js@1.87.6"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Handle CORS for your React frontend
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 2. Generate Solana Wallet (Fast & Native)
    const wallet = Keypair.generate()
    const publicKey = wallet.publicKey.toBase58()
    const secretKeyRaw = wallet.secretKey 

    // 3. Import Encryption Key (Hex to Binary)
    const hexKey = Deno.env.get("MASTER_ENCRYPTION_KEY") || ""
    const keyData = new Uint8Array(hexKey.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))
    const encryptionKey = await crypto.subtle.importKey(
      "raw", keyData, { name: "AES-GCM" }, false, ["encrypt"]
    )

    // 4. Encrypt Secret Key
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      encryptionKey,
      secretKeyRaw
    )

    // 5. Convert to Base64 for Database (CPU Efficient)
    const encryptedKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)))
    const ivBase64 = btoa(String.fromCharCode(...iv))

    // 6. Save to Database (Keeping Energy & Shards!)
    const { error: dbError } = await supabase
      .from('players')
      .upsert({ 
        wallet_address: publicKey,
        encrypted_key: encryptedKeyBase64,
        encryption_iv: ivBase64,
        shard_balance: 0,
        last_energy: 1000,
        last_updated: new Date().toISOString()
      }, { onConflict: 'wallet_address' })

    if (dbError) throw dbError

    return new Response(JSON.stringify({ publicKey }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})