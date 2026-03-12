import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"
// Use this specific import - it's faster for the CPU to parse
import tweetnacl from "https://esm.sh/tweetnacl@1.0.3"
import bs58 from "https://esm.sh/bs58@5.0.0"

// Standard library for Base64 is usually safe, but let's use the older stable version
import { encode as encodeBase64 } from "https://deno.land/std@0.145.0/encoding/base64.ts"
import * as bip39 from "npm:bip39";
import { derivePath } from "npm:ed25519-hd-key";
import { Keypair } from "npm:@solana/web3.js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}


serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { telegram_id, username } = await req.json();

    // 1. Generate the 12-word phrase
    const mnemonic = bip39.generateMnemonic();

    // 2. Convert the phrase into a Solana Keypair
    const seed = bip39.mnemonicToSeedSync(mnemonic).toString('hex');
    const derivationPath = "m/44'/501'/0'/0'"; // The official Solana derivation path
    const derivedSeed = derivePath(derivationPath, seed).key;
    const keypair = Keypair.fromSeed(derivedSeed);
    
    const publicKey = keypair.publicKey.toBase58();

    // 3. Initialize Supabase
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 4. Save ONLY the public key to the database
    const { error: updateError } = await supabaseClient
      .from('players')
      .update({ wallet_address: publicKey })
      .eq('telegram_id', String(telegram_id));

    if (updateError) throw updateError;

    // 5. Return BOTH to the frontend (The frontend will catch the mnemonic and save it to local storage)
    return new Response(
      JSON.stringify({ 
        success: true, 
        publicKey: publicKey, 
        mnemonic: mnemonic // <--- Sending the 12 words back!
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});