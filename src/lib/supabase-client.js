// /lib/supabase-client.js
import { createClient } from "@supabase/supabase-js";

// Works for Vite (import.meta.env) and Node (process.env)
function env(key) {
  if (typeof import.meta !== "undefined" && import.meta.env && key in import.meta.env) {
    return import.meta.env[key];
  }
  return process.env[key];
}

const SUPABASE_URL = env("VITE_SUPABASE_URL") || env("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_ANON_KEY = env("VITE_SUPABASE_ANON_KEY") || env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = env("VITE_SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("[Supabase] Missing URL or ANON key. Check your .env");
}

// Derive stable project ref from the URL for unique storage keys
const PROJECT_REF = SUPABASE_URL?.match(/^https?:\/\/([^.]+)\./)?.[1] || "supabase";

// Global cache survives HMR / duplicate imports
const g = globalThis;
g.__sb_clients__ ||= {};

/** Anon client — safe for browser */
export function getSupabase() {
  if (!g.__sb_clients__.anon) {
    g.__sb_clients__.anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      db: { schema: "public" },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: `sb-${PROJECT_REF}-auth-token`,
        detectSessionInUrl: true,
      },
    });
    console.log("[Supabase] Anon client (global) created ✅");
  }
  return g.__sb_clients__.anon;
}

/** Admin client — **server only**. Never instantiate in the browser. */
export function getSupabaseAdmin() {
  if (typeof window !== "undefined") {
    throw new Error(
      "[Supabase] getSupabaseAdmin() called in the browser. Move admin usage to server-only code."
    );
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("[Supabase] Missing SERVICE ROLE key. Add VITE_SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!g.__sb_clients__.admin) {
    g.__sb_clients__.admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      db: { schema: "public" },
      auth: {
        // No storage for admin client
        persistSession: false,
        autoRefreshToken: false,
        storageKey: `sb-${PROJECT_REF}-admin-no-store`,
        detectSessionInUrl: false,
      },
    });
    console.log("[Supabase] Admin client (global) created ✅");
  }
  return g.__sb_clients__.admin;
}

/** Safe accessor that returns null in browser, admin client on server */
export function getSupabaseAdminSafe() {
  try {
    return getSupabaseAdmin();
  } catch {
    return null; // browser path
  }
}
