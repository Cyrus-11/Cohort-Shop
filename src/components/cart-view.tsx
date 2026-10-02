"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CartView as Cart } from "@/lib/cart";
import { formatKobo } from "@/lib/money";
import styles from "./cart-view.module.css";

export function CartView({ initialCart }: { initialCart: Cart }) {
  const router = useRouter();
  const [cart, setCart] = useState(initialCart);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "PUT" | "DELETE", productId: string, quantity?: number) {
    setBusyId(productId);
    setError(null);
    try {
      const response = await fetch("/api/cart", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(method === "PUT" ? { productId, quantity } : { productId }),
      });
      if (response.status === 401) {
        router.push("/login?next=/cart");
        return;
      }
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "The cart could not be updated.");
        return;
      }
      setCart(body);
      router.refresh();
    } catch {
      setError("Network problem. Your cart was not changed.");
    } finally {
      setBusyId(null);
    }
  }

  if (cart.items.length === 0) {
    return (
      <section className={styles.empty} aria-labelledby="empty-title">
        <svg className={styles.emptyIcon} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <circle cx="32" cy="32" r="32" fill="var(--color-accent)" />
          <path d="M18 24h30l-3 18H21z" fill="none" stroke="#000" strokeWidth="3" strokeLinejoin="round" />
          <path d="M14 18h5l2 6" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="26" cy="49" r="3" fill="#000" />
          <circle cx="42" cy="49" r="3" fill="#000" />
        </svg>
        <h2 id="empty-title" className={styles.emptyTitle}>Your cart is empty</h2>
        <p className={styles.muted}>Looks like you haven&apos;t added anything yet.</p>
        <Link className="button" href="/#products">Start shopping</Link>
      </section>
    );
  }

  return (
    <div className={styles.layout}>
      <section aria-label="Items in your cart">
        {error ? <p role="alert" className={styles.alert}>{error}</p> : null}
        <ul className={styles.list}>
          {cart.items.map((item) => {
            const busy = busyId === item.productId;
            return (
              <li key={item.productId} className={`${styles.row} ${busy ? styles.busy : ""}`}>
                <Image
                  src={item.imagePath}
                  alt={item.name}
                  width={96}
                  height={137}
                  className={styles.thumb}
                />
                <div className={styles.details}>
                  <div className={styles.top}>
                    <h2 className={styles.name}>{item.name}</h2>
                    <p className={styles.lineTotal}>{formatKobo(item.lineTotalKobo)}</p>
                  </div>
                  <p className={styles.muted}>{formatKobo(item.unitPriceKobo)} each</p>
                  <div className={styles.controls}>
                    <div className={styles.quantityControl}>
                      <div className={styles.stepper} role="group" aria-label={`Quantity of ${item.name}`} aria-busy={busy}>
                        <button
                          type="button"
                          aria-label={`Decrease quantity of ${item.name}`}
                          disabled={busy || item.quantity <= 1}
                          onClick={() => send("PUT", item.productId, item.quantity - 1)}
                        >
                          −
                        </button>
                        <output aria-live="polite">{item.quantity}</output>
                        <button
                          type="button"
                          aria-label={`Increase quantity of ${item.name}`}
                          disabled={busy || item.quantity >= 99}
                          onClick={() => send("PUT", item.productId, item.quantity + 1)}
                        >
                          +
                        </button>
                      </div>
                      <span className={styles.updateStatus} role="status" aria-atomic="true">
                        {busy ? "Updating…" : ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.remove}
                      disabled={busy}
                      onClick={() => send("DELETE", item.productId)}
                      aria-label={`Remove ${item.name} from cart`}
                    >
                      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
                        <path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <Link className={styles.continue} href="/#products">← Continue shopping</Link>
      </section>

      <aside className={styles.summary} aria-labelledby="summary-title">
        <h2 id="summary-title" className={styles.summaryTitle}>Order summary</h2>
        <dl className={styles.figures}>
          <div>
            <dt>Items</dt>
            <dd>{cart.count}</dd>
          </div>
          <div>
            <dt>Subtotal</dt>
            <dd>{formatKobo(cart.totalKobo)}</dd>
          </div>
        </dl>
        <p className={styles.total}>
          <span>Total</span>
          <strong>{formatKobo(cart.totalKobo)}</strong>
        </p>
        <Link className="button" href="/checkout">Proceed to checkout</Link>
        <p className={styles.secure}>
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
            <rect x="4" y="9" width="12" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M7 9V6a3 3 0 016 0v3" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          Secure payment on Paystack. The final price is confirmed on our server.
        </p>
      </aside>
    </div>
  );
}
