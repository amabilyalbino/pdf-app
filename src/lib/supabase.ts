import { createClient } from "@supabase/supabase-js";
import { parseAllowedEmails } from "./auth";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

function buildAuthStorageKey(url: string) {
  try {
    return `ops-pdf-studio-auth:${new URL(url).hostname}`;
  } catch {
    return "ops-pdf-studio-auth";
  }
}

export const allowedEmails = parseAllowedEmails(import.meta.env.VITE_ALLOWED_EMAILS);
export const hasSupabaseEnv = Boolean(supabaseUrl && supabasePublishableKey);
export const hasProtectedAuthSetup = hasSupabaseEnv && allowedEmails.length > 0;

export const supabase = hasSupabaseEnv
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        storageKey: buildAuthStorageKey(supabaseUrl)
      }
    })
  : null;
