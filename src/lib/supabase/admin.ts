import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env/client";
import { getSupabaseServerEnv } from "@/lib/env/server";
import type { Database } from "@/lib/supabase/database.types";

export function createAdminClient() {
  const publicEnv = getPublicEnv();
  const serverEnv = getSupabaseServerEnv();

  return createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SECRET_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
