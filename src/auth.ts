import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

if (supabase && typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((event, session) => {
    if (session?.provider_token) {
      const identity = session.user.identities?.find(item => item.provider === "google" || item.provider === "azure");
      if (identity) {
        sessionStorage.setItem("grandLumenMailProviderToken", JSON.stringify({
          provider: identity.provider,
          token: session.provider_token,
          expiresAt: Date.now() + 50 * 60 * 1000
        }));
      }
    }
    if (event === "SIGNED_OUT") sessionStorage.removeItem("grandLumenMailProviderToken");
  });
}
