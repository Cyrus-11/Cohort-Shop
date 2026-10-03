import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getProducts() {
  const { data, error } = await (await createClient()).from("products")
    .select("id, name, description, image_path, price_kobo")
    .order("price_kobo", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
