import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getOrderHistory(userId: string, page: number) {
  const client = await createClient();
  const { data, error } = await client.from("orders")
    .select("id, items, total_kobo, payment_status, payment_reference, email_status, created_at, delivery_details")
    .eq("user_id", userId)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range((page - 1) * 10, page * 10);
  if (error) throw error;
  return { orders: (data ?? []).slice(0, 10), hasNext: (data?.length ?? 0) > 10 };
}
