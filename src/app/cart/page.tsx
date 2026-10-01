import type { Metadata } from "next";
import Link from "next/link";
import { CartView } from "@/components/cart-view";
import { GoogleButton } from "@/components/google-button";
import { StatusPanel } from "@/components/status-panel";
import { getCurrentUser } from "@/lib/auth";
import { getCart, type CartView as Cart } from "@/lib/cart";
import { createClient } from "@/lib/supabase/server";
import styles from "./cart.module.css";

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
      <header className={styles.header}>
        <h1 className={styles.heading}>Your cart</h1>
        {cart && cart.count > 0 ? (
          <p className={styles.count}>
            {cart.count} {cart.count === 1 ? "item" : "items"}
          </p>
        ) : null}
      </header>
      {!user ? (
        <section className={styles.gate} aria-labelledby="signin-title">
          <div className={styles.art} aria-hidden="true">
            <svg viewBox="0 0 120 120" className={styles.cartIcon} focusable="false">
              <circle cx="60" cy="60" r="60" fill="var(--color-accent)" />
              <path d="M34 46h56l-6 34H40z" fill="#fff" stroke="#000" strokeWidth="4" strokeLinejoin="round" />
              <path d="M24 34h10l4 12" fill="none" stroke="#000" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="48" cy="94" r="5" fill="#000" />
              <circle cx="78" cy="94" r="5" fill="#000" />
              <path d="M52 62h28" stroke="#000" strokeWidth="4" strokeLinecap="round" />
            </svg>
          </div>
          <div className={styles.gateBody}>
            <h2 id="signin-title" className={styles.gateTitle}>Sign in to see your cart</h2>
            <p className={styles.gateCopy}>
              Your cart is saved to your Google account, so it follows you from your phone to your laptop.
            </p>
            <ul className={styles.benefits}>
              <li>Items stay saved until you check out</li>
              <li>Secure payment on Paystack</li>
              <li>Order confirmation sent to your email</li>
            </ul>
            <GoogleButton next="/cart" />
            <Link className={styles.browse} href="/#products">Keep browsing the shop</Link>
          </div>
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
