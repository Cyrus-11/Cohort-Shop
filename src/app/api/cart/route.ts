import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isSameOrigin } from "@/lib/auth";
import { getCart } from "@/lib/cart";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: noStore });

const putSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().min(1).max(99),
});
const deleteSchema = z.object({ productId: z.uuid() });

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Sign in to view your cart." }, 401);
  try {
    return json(await getCart(await createClient(), user.id));
  } catch {
    return json({ error: "The cart could not be loaded. Please try again." }, 500);
  }
}

export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  const user = await getCurrentUser();
  if (!user) return json({ error: "Sign in to use your cart." }, 401);
  const parsed = putSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return json({ error: "Choose a product and a quantity from 1 to 99." }, 400);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("cart_items")
    .upsert(
      { user_id: user.id, product_id: parsed.data.productId, quantity: parsed.data.quantity },
      { onConflict: "user_id,product_id" },
    );
  if (error) {
    // 23514: unavailable product or 20-product limit; 23503/42501: unknown product.
    if (["23514", "23503", "42501"].includes(error.code)) {
      return json({ error: "This product cannot be added. It may be unavailable, or the cart is full (20 products)." }, 400);
    }
    return json({ error: "The cart could not be updated. Please try again." }, 500);
  }
  try {
    return json(await getCart(supabase, user.id));
  } catch {
    return json({ error: "The cart was updated but could not be reloaded." }, 500);
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  const user = await getCurrentUser();
  if (!user) return json({ error: "Sign in to use your cart." }, 401);
  const parsed = deleteSchema.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: "Choose a product to remove." }, 400);

  const supabase = await createClient();
  const { error } = await supabase
    .from("cart_items")
    .delete()
    .eq("user_id", user.id)
    .eq("product_id", parsed.data.productId);
  if (error) return json({ error: "The item could not be removed. Please try again." }, 500);
  try {
    return json(await getCart(supabase, user.id));
  } catch {
    return json({ error: "The item was removed but the cart could not be reloaded." }, 500);
  }
}
