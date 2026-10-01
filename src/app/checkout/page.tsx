import type { Metadata } from "next";
import Link from "next/link";
import { PayButton } from "@/components/pay-button";
import { StatusPanel } from "@/components/status-panel";
import { getCurrentUser } from "@/lib/auth";
import { getCart, type CartView } from "@/lib/cart";
import { formatKobo } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import styles from "./checkout.module.css";

export const metadata: Metadata = { title: "Checkout" };
export const dynamic = "force-dynamic";

async function load(userId: string) {
  try {
    const supabase = await createClient();
    const cart = await getCart(supabase, userId);
    // Unresolved payments are shown first so the customer does not pay twice.
    const { data: pending } = await supabase
      .from("orders")
      .select("payment_reference, total_kobo")
      .eq("user_id", userId)
      .eq("payment_status", "pending")
      .not("authorization_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    return { cart, pending: pending?.[0] ?? null };
  } catch {
    return null;
  }
}

function signatureOf(cart: CartView): string {
  return cart.items.map((i) => `${i.productId}:${i.quantity}:${i.unitPriceKobo}`).join("|");
}

export default async function CheckoutPage() {
  const user = await getCurrentUser();
  const data = user ? await load(user.id) : null;

  let body;
  if (!user) {
    body = (
      <section className="status-panel" aria-labelledby="signin-title">
        <h2 id="signin-title">Sign in to check out</h2>
        <p>Your cart and orders are tied to your Google account.</p>
        <Link className="button" href="/login?next=/checkout">Sign in with Google</Link>
      </section>
    );
  } else if (!data) {
    body = (
      <StatusPanel title="Checkout is unavailable">
        We could not load your cart. Please refresh the page to try again.
      </StatusPanel>
    );
  } else if (data.cart.items.length === 0) {
    body = (
      <section className="status-panel" aria-labelledby="empty-title">
        <h2 id="empty-title">Your cart is empty</h2>
        <p>Add something from the shop before checking out.</p>
        <Link className="button" href="/">Back to shop</Link>
      </section>
    );
  } else {
    const { cart, pending } = data;
    body = (
      <>
        {pending ? (
          <section className="status-panel" aria-labelledby="pending-title">
            <h2 id="pending-title">A payment is waiting</h2>
            <p>
              You started a payment of {formatKobo(pending.total_kobo)} that has not been confirmed.
              Check it before paying again.
            </p>
            <Link className="button button-secondary" href={`/checkout/result?reference=${encodeURIComponent(pending.payment_reference)}`}>
              Check payment status
            </Link>
          </section>
        ) : null}
        <div className={styles.layout}>
          <section aria-labelledby="review-title">
            <h2 id="review-title" className={styles.heading}>Review your items</h2>
            <ul className={styles.list}>
              {cart.items.map((item) => (
                <li key={item.productId} className={styles.row}>
                  <span>{item.name} × {item.quantity}</span>
                  <span>{formatKobo(item.lineTotalKobo)}</span>
                </li>
              ))}
            </ul>
            <p className={styles.email}>
              Receipt and confirmation go to <strong>{user.email}</strong>.
            </p>
            <Link href="/cart">Edit cart</Link>
          </section>
          <aside className={styles.summary} aria-labelledby="summary-title">
            <h2 id="summary-title" className={styles.heading}>Order summary</h2>
            <p className={styles.total}>
              <span>Total</span>
              <strong>{formatKobo(cart.totalKobo)}</strong>
            </p>
            <p className={styles.note}>
              You will pay on Paystack&apos;s secure page. The final amount is calculated on our server from current prices.
            </p>
            <PayButton cartSignature={signatureOf(cart)} />
          </aside>
        </div>
      </>
    );
  }

  return (
    <div className="shell page">
      <h1 className="page-heading">Checkout</h1>
      {body}
    </div>
  );
}
