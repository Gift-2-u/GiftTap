import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"
// Use this specific import - it's faster for the CPU to parse
import * as tweetnacl from "https://esm.sh/tweetnacl@1.0.3"
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts"
import { b58 } from "https://deno.land/x/b58@v1.0.2/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Generate Wallet using TweetNaCl (MUCH faster than the full Solana web3 library)
    const keypair = tweetnacl.sign.keyPair()
    // Manual Base58 conversion for Solana addresses is CPU heavy, so we send the Raw bytes 
    // and let the frontend or DB handle the format if needed. 
    // For now, we use a simple Base64 for the test.
    const publicKey = b58.encode(keypair.publicKey)
    const secretKeyRaw = keypair.secretKey 

    // 2. Encryption (Using the faster WebCrypto API)
    const hexKey = Deno.env.get("MASTER_ENCRYPTION_KEY") || ""
    // Optimized hex-to-uint8 conversion
    const keyData = new Uint8Array(hexKey.length / 2);
    for (let i = 0; i < hexKey.length; i += 2) {
      keyData[i / 2] = parseInt(hexKey.substring(i, i + 2), 16);
    }

    const encryptionKey = await crypto.subtle.importKey(
      "raw", keyData, { name: "AES-GCM" }, false, ["encrypt"]
    )

    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      encryptionKey,
      secretKeyRaw
    )

    // 3. Save to DB
    const { error: dbError } = await supabase
      .from('players')
      .upsert({ 
        wallet_address: publicKey, 
        encrypted_key: encodeBase64(new Uint8Array(encryptedBuffer)),
        encryption_iv: encodeBase64(iv),
        shard_balance: 0,
        last_energy: 1000
      }, { onConflict: 'wallet_address' })

    if (dbError) throw dbError

    return new Response(JSON.stringify({ publicKey }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500, // Changed to 500 to catch internal CPU panics better
    })
  }
})