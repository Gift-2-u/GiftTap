import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = String(stored || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
  const iterations = parseInt(parts[1], 10);
  const salt = b64ToBytes(parts[2]);
  const expected = parts[3];
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return b64(bits) === expected;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const { username, password, player_id } = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let row;
    if (username && password) {
      const { data, error } = await supabase
        .from("players")
        .select("telegram_id, password_hash, is_banned")
        .ilike("username", String(username).trim())
        .maybeSingle();
      if (error) throw error;
      if (!data?.password_hash) throw new Error("No password on account");
      if (data.is_banned) throw new Error("ACCOUNT_BANNED");
      const ok = await verifyPassword(String(password), data.password_hash);
      if (!ok) throw new Error("Wrong password");
      row = data;
    } else if (player_id && password) {
      const { data, error } = await supabase
        .from("players")
        .select("telegram_id, password_hash, is_banned")
        .eq("telegram_id", String(player_id))
        .maybeSingle();
      if (error) throw error;
      if (!data?.password_hash) throw new Error("No password on account");
      if (data.is_banned) throw new Error("ACCOUNT_BANNED");
      const ok = await verifyPassword(String(password), data.password_hash);
      if (!ok) throw new Error("Wrong password");
      row = data;
    } else {
      throw new Error("username+password or player_id+password required");
    }

    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const progressToken = b64(tokenBytes);
    const tokenExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error: upErr } = await supabase
      .from("players")
      .update({
        progress_token: progressToken,
        progress_token_expires: tokenExpires,
      })
      .eq("telegram_id", row.telegram_id);
    if (upErr) throw upErr;

    return new Response(
      JSON.stringify({
        success: true,
        player_id: row.telegram_id,
        progress_token: progressToken,
        progress_token_expires: tokenExpires,
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
