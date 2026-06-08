import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Database } from "./types";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  "https://zoxztfjptjkuapqldlha.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpveHp0ZmpwdGprdWFwcWxkbGhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0NTYzNzQsImV4cCI6MjA5MTAzMjM3NH0.1dweJWsNFFmSN_Q17l4N_FjiE-i79dwHnFj-i4ucqPs";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});