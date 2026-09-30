import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env/client";
import type { Database } from "@/lib/supabase/database.types";

export function createClient() {
  const env = getPublicEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
