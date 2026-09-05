import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * False until a real Supabase project is wired up via .env.local (see
 * .env.local.example). Consuming client components should check this and
 * render a placeholder rather than crash — keeps `npm run build`/`next dev`
 * green before Supabase is configured.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl!, supabaseAnonKey!)
  : null;
