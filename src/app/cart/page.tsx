import type { Metadata } from "next";
import Link from "next/link";
import { CartView } from "@/components/cart-view";
import { StatusPanel } from "@/components/status-panel";
import { getCurrentUser } from "@/lib/auth";
import { getCart, type CartView as Cart } from "@/lib/cart";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Cart" };
export const dynamic = "force-dynamic";

async function loadCart(userId: string): Promise<Cart | null> {
  try {
    return await getCart(await createClient(), userId);
  } catch {
    return null;
  }
}

export default async function CartPage() {
  const user = await getCurrentUser();
  const cart = user ? await loadCart(user.id) : null;

  return (
    <div className="shell page">
      <h1 className="page-heading">Your cart</h1>
      {!user ? (
        <section className="status-panel" aria-labelledby="signin-title">
          <h2 id="signin-title">Sign in to see your cart</h2>
          <p>Your cart is saved to your Google account.</p>
          <Link className="button" href="/login?next=/cart">Continue with Google</Link>
        </section>
      ) : cart ? (
        <CartView initialCart={cart} />
      ) : (
        <StatusPanel title="Your cart could not be loaded">
          Something went wrong on our side. Please refresh the page to try again.
        </StatusPanel>
      )}
    </div>
  );
}
