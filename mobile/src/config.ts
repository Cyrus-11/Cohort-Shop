export const config = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "https://cohort-shop.vercel.app",
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
};
export function configurationError(): string | null {
  if (!config.supabaseUrl || !config.publishableKey) return "Set the public Supabase settings in mobile/.env.local before starting the app.";
  try {
    const api = new URL(config.apiUrl);
    const supabase = new URL(config.supabaseUrl);
    if ((api.protocol !== "https:" && !__DEV__) || supabase.protocol !== "https:" || api.username || api.password || api.pathname !== "/" || api.search || api.hash) return "Use an HTTPS shop origin and Supabase URL in the app settings.";
  } catch { return "The app settings contain an invalid URL."; }
  return null;
}
