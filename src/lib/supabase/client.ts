import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Database } from "./types";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  "https://zruonfdnfvgmaebanvdm.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpydW9uZmRuZnZnbWFlYmFudmRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMTczODksImV4cCI6MjA5MjU5MzM4OX0.AfutlmSt6ix8TNm0Lc70P2R2U554CXSaa7DxPyY8Hz4";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});