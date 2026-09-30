"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export function GoogleButton({ next }: { next: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    try {
      const redirectTo = new URL("/auth/callback", window.location.origin);
      redirectTo.searchParams.set("next", next);
      const { error: oauthError } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectTo.toString() },
      });
      if (oauthError) throw oauthError;
    } catch {
      setError("Google sign-in is unavailable right now. Please try again.");
      setPending(false);
    }
  }

  return (
    <div>
      <button type="button" className="button" onClick={signIn} disabled={pending}>
        {pending ? "Redirecting to Google…" : "Continue with Google"}
      </button>
      {error ? <p role="alert" className="form-error">{error}</p> : null}
    </div>
  );
}
