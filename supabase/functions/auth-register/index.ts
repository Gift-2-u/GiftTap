import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

function b64(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return `pbkdf2_sha256$100000$${b64(salt)}$${b64(bits)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { username, password } = await req.json();
    const cleanName = String(username || "").trim();
    const pass = String(password || "");

    if (!USERNAME_RE.test(cleanName)) {
      throw new Error("Username must be 3–20 characters: letters, numbers, underscore only.");
    }
    if (pass.length < 6) {
      throw new Error("Password must be at least 6 characters.");
    }
    if (cleanName.toLowerCase() === "player") {
      throw new Error('Username "Player" is reserved. Pick a unique name.');
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Case-insensitive uniqueness
    const { data: existing } = await supabase
      .from("players")
      .select("telegram_id")
      .ilike("username", cleanName)
      .maybeSingle();

    if (existing) {
      throw new Error("That username is already taken. Choose another.");
    }

    const playerId = crypto.randomUUID();
    const password_hash = await hashPassword(pass);

    // Note: do not send created_at — players table may not have that column
    const { error: insertError } = await supabase.from("players").insert({
      telegram_id: playerId,
      username: cleanName,
      password_hash,
      has_beta_access: false,
      shard_balance: 0,
      season_shards: 0,
      lifetime_taps: 0,
      sol_balance: 0,
      usdc_balance: 0,
    });

    if (insertError) {
      if (insertError.message?.includes("players_username") || insertError.code === "23505") {
        throw new Error("That username is already taken. Choose another.");
      }
      // Always throw a real Error with a string message (never raw Postgrest object)
      const msg =
        insertError.message ||
        insertError.details ||
        insertError.hint ||
        (typeof insertError === "string" ? insertError : JSON.stringify(insertError));
      throw new Error(msg);
    }

    return new Response(
      JSON.stringify({
        success: true,
        player_id: playerId,
        username: cleanName,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
