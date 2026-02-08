import { createClient } from '@supabase/supabase-js';

// These are your project's "address" and "key"
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// IF THE SCREEN IS WHITE, THIS WILL SHOW THE REASON
if (!supabaseUrl || !supabaseAnonKey) {
  const errorMsg = "ERROR: Supabase variables are MISSING from the build environment. Check Vercel Dashboard names.";
  console.error(errorMsg);
  // This physically writes the error to the screen so you can see it on your phone/browser
  if (typeof document !== 'undefined') {
    document.body.innerHTML = `<h1 style="color:red; background:white; padding:20px;">${errorMsg}</h1>`;
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);