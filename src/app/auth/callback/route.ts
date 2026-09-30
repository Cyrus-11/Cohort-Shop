import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth";
import { getAppEnv } from "@/lib/env/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = new URL(getAppEnv().APP_URL).origin;
  const next = safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  const failed = new URL("/login", origin);
  failed.searchParams.set("error", "signin");
  if (next !== "/") failed.searchParams.set("next", next);
  return NextResponse.redirect(failed);
}
