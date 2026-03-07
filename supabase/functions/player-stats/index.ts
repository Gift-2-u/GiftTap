import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Get the userId from the request body
    const { userId } = await req.json();

    if (!userId) {
      throw new Error("userId is required");
    }

    // Fetch the player's current stats
    const { data: player, error } = await supabaseClient
      .from('players')
      .select('streak, last_login_timestamp')
      .eq('id', userId)
      .single();

    if (error) throw error;

    // Calculate the time difference
    const serverTimeNow = new Date();
    const lastLoginTime = new Date(player.last_login_timestamp);
    const timeDiffMs = serverTimeNow.getTime() - lastLoginTime.getTime();
    const hoursSinceLastLogin = timeDiffMs / (1000 * 60 * 60);

    let currentStreak = player.streak;

    // If it has been more than 24 hours since their last login, reset the streak to 0
    if (hoursSinceLastLogin > 24) {
      currentStreak = 0;
      
      // Update the database before sending the response to the frontend
      const { error: updateError } = await supabaseClient
        .from('players')
        .update({ streak: currentStreak })
        .eq('id', userId);

      if (updateError) throw updateError;
    }

    // Return the accurate data
    return new Response(
      JSON.stringify({ 
        streak: currentStreak, 
        last_login_timestamp: player.last_login_timestamp 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});