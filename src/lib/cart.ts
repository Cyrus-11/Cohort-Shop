import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

import type { CartView } from "@/lib/shop-types";
export type { CartLine, CartView } from "@/lib/shop-types";

// Reads through the user's own session, so RLS also limits rows to the owner.
// Inactive products are hidden by RLS and therefore drop out of the inner join.
export async function getCart(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<CartView> {
  const { data, error } = await supabase
    .from("cart_items")
    .select("quantity, created_at, products!inner(id, name, image_path, price_kobo)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const items = (data ?? []).map((row) => {
    const product = row.products;
    return {
      productId: product.id,
      name: product.name,
      imagePath: product.image_path,
      unitPriceKobo: product.price_kobo,
      quantity: row.quantity,
      lineTotalKobo: product.price_kobo * row.quantity,
    };
  });
  return {
    items,
    totalKobo: items.reduce((sum, item) => sum + item.lineTotalKobo, 0),
    count: items.reduce((sum, item) => sum + item.quantity, 0),
  };
}
