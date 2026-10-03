import "server-only";
import { createClient as createTokenClient } from "@supabase/supabase-js";
import { getCurrentUser, isSameOrigin, type CurrentUser } from "@/lib/auth";
import { getPublicEnv } from "@/lib/env/client";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

// A supplied Authorization header never falls back to website cookies. Native
// tokens are checked by Supabase Auth before they can bypass the cookie CSRF gate.
export async function getApiSession(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization !== null) {
    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match || match[1].length > 8192) return null;
    const env = getPublicEnv();
    const client = createTokenClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${match[1]}` } },
    });
    const { data, error } = await client.auth.getUser(match[1]);
    if (error || !data.user?.id || !data.user.email) return null;
    const user: CurrentUser = { id: data.user.id, email: data.user.email };
    return { user, client };
  }
  const user = await getCurrentUser();
  return user ? { user, client: await createClient() } : null;
}

export function isAllowedApiWrite(request: Request): boolean {
  return request.headers.has("authorization") || isSameOrigin(request);
}
