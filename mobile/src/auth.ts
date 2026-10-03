import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase";

export const AUTH_REDIRECT = "cohortshop://auth/callback";
let exchanging: Promise<void> | null = null;
let lastCode: string | null = null;

export function authCodeFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "cohortshop:" || url.hostname !== "auth" || url.pathname !== "/callback") return null;
    if (url.searchParams.has("error")) throw new Error("Google sign-in did not complete. Try again.");
    return url.searchParams.get("code");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Google")) throw error;
    return null;
  }
}

export async function completeSignIn(url: string): Promise<void> {
  const code = authCodeFromUrl(url);
  if (!code || code === lastCode) return;
  if (exchanging) return exchanging;
  exchanging = (async () => {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw new Error("Google sign-in could not be completed. Please try again.");
    lastCode = code;
  })();
  try { await exchanging; } finally { exchanging = null; }
}

export async function signInWithGoogle(): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true } });
  if (error || !data.url) throw new Error("Google sign-in is unavailable. Please try again.");
  const result = await WebBrowser.openAuthSessionAsync(data.url, AUTH_REDIRECT);
  if (result.type === "success") await completeSignIn(result.url);
}
