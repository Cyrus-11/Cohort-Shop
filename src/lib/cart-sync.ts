import type { SupabaseClient } from "@supabase/supabase-js";

// Signals carry no cart/address data. Both clients reload their authenticated
// API/server view on changes and subscription recovery (events aren't replayed).
export function subscribeToCart(client: SupabaseClient, userId: string, refresh: () => void, status?: (connected: boolean) => void) {
  const channel = client.channel(`cart-sync:${userId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "cart_sync", filter: `user_id=eq.${userId}` }, refresh)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "cart_sync", filter: `user_id=eq.${userId}` }, refresh)
    .subscribe(state => {
      status?.(state === "SUBSCRIBED");
      if (state === "SUBSCRIBED") refresh();
    });
  return () => { void client.removeChannel(channel); };
}
