import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { userId } = await req.json();

    if (!userId) {
      throw new Error("userId is required");
    }

    const { data: player, error } = await supabaseClient
      .from('players')
      .select('current_streak, last_tap_date')
      .eq('telegram_id', String(userId))
      .single();

    if (error) throw error;
    if (!player) throw new Error("Player not found");

    let currentStreak = player.current_streak || 0;
    const lastTapDateStr = player.last_tap_date; // Example: "2026-03-07"

    // 1. Calculate "Yesterday" in exact YYYY-MM-DD format to match your frontend
    const yesterdayObj = new Date();
    yesterdayObj.setDate(yesterdayObj.getDate() - 1);
    const yesterdayStr = yesterdayObj.toISOString().split('T')[0];

    // 2. STREAK LOGIC: Only reset to 0 if their last tap was BEFORE yesterday
    if (lastTapDateStr && lastTapDateStr < yesterdayStr) {
      currentStreak = 0;
      
      const { error: updateError } = await supabaseClient
        .from('players')
        .update({ current_streak: currentStreak })
        .eq('telegram_id', String(userId));

      if (updateError) throw updateError;
    }

    return new Response(
      JSON.stringify({ 
        streak: currentStreak, 
        last_tap_date: player.last_tap_date 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});