import { createClient, processLock } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { config } from "./config";
import type { Database } from "../../src/lib/supabase/database.types";

// Sessions and the PKCE verifier live in Android encrypted storage, never in the
// cart cache. No service key or payment/email credentials belong in this app.
export const supabase = createClient<Database>(config.supabaseUrl || "https://not-configured.supabase.co", config.publishableKey || "not-configured", {
  auth: {
    storage: {
      getItem: key => SecureStore.getItemAsync(key),
      setItem: (key, value) => SecureStore.setItemAsync(key, value),
      removeItem: key => SecureStore.deleteItemAsync(key),
    },
    flowType: "pkce", lock: processLock, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
  },
});
