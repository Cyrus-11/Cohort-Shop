import "server-only";
import { getAppEnv } from "@/lib/env/server";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = { id: string; email: string };

// getClaims verifies the session token (signature or Auth server) on every call;
// never trust cookie contents or client-supplied IDs directly.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub || typeof claims.email !== "string") return null;
  return { id: claims.sub, email: claims.email };
}

// Only same-site relative paths may be used as post-login destinations.
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }
  return next;
}

// Cookie-authenticated writes must come from this app's own origin.
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(getAppEnv().APP_URL).origin;
  } catch {
    return false;
  }
}
