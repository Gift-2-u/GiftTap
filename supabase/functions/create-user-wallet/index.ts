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
    // player_id / telegram_id optional — frontend owns the players row upsert for web accounts
    const body = await req.json().catch(() => ({}));
    const playerKey = body.player_id || body.telegram_id || null;

    // 1. Generate the 12-word phrase
    const mnemonic = bip39.generateMnemonic();

    // 2. Convert the phrase into a Solana Keypair (Bulletproof Deno Fix)
    const seedBuffer = bip39.mnemonicToSeedSync(mnemonic);
    
    // Force pure math hex conversion (Bypasses Deno Buffer bugs)
    const seedHex = Array.from(seedBuffer)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const derivationPath = "m/44'/501'/0'/0'"; 
    const derivedSeed = derivePath(derivationPath, seedHex).key;
    const keypair = Keypair.fromSeed(derivedSeed);
    
    const publicKey = keypair.publicKey.toBase58();

    // 3. Optional: if a player row already exists, attach the public key only (never the seed)
    if (playerKey) {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      const { error: updateError } = await supabaseClient
        .from('players')
        .update({ wallet_address: publicKey })
        .eq('telegram_id', String(playerKey));

      // Ignore "no rows" — new web signups insert the row on the client after this returns
      if (updateError) console.warn('create-user-wallet update skipped:', updateError.message);
    }

    // 4. Return BOTH to the frontend (client encrypts/stores vault; we never keep the seed)
    return new Response(
      JSON.stringify({ 
        success: true, 
        publicKey: publicKey, 
        mnemonic: mnemonic
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