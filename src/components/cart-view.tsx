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
      <section className="status-panel" aria-labelledby="empty-title">
        <h2 id="empty-title">Your cart is empty</h2>
        <p>Add something you like from the shop.</p>
        <Link className="button" href="/">Back to shop</Link>
      </section>
    );
  }

  return (
    <div className={styles.layout}>
      <div>
        {error ? <p role="alert" className="form-error">{error}</p> : null}
        <ul className={styles.list}>
          {cart.items.map((item) => {
            const busy = busyId === item.productId;
            return (
              <li key={item.productId} className={styles.row}>
                <Image
                  src={item.imagePath}
                  alt=""
                  width={96}
                  height={120}
                  className={styles.thumb}
                  unoptimized
                />
                <div className={styles.details}>
                  <h2 className={styles.name}>{item.name}</h2>
                  <p className={styles.muted}>{formatKobo(item.unitPriceKobo)} each</p>
                  <div className={styles.controls}>
                    <label className={styles.quantity}>
                      <span>Quantity</span>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        defaultValue={item.quantity}
                        key={`${item.productId}-${item.quantity}`}
                        disabled={busy}
                        onBlur={(event) => {
                          const value = Number(event.target.value);
                          if (!Number.isInteger(value) || value < 1 || value > 99) {
                            setError("Enter a quantity from 1 to 99.");
                            event.target.value = String(item.quantity);
                          } else if (value !== item.quantity) {
                            void send("PUT", item.productId, value);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={busy}
                      onClick={() => send("DELETE", item.productId)}
                      aria-label={`Remove ${item.name}`}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <p className={styles.lineTotal}>{formatKobo(item.lineTotalKobo)}</p>
              </li>
            );
          })}
        </ul>
      </div>
      <aside className={styles.summary} aria-labelledby="summary-title">
        <h2 id="summary-title">Order summary</h2>
        <p className={styles.total}>
          <span>Total</span>
          <strong>{formatKobo(cart.totalKobo)}</strong>
        </p>
        <Link className="button" href="/checkout">Proceed to checkout</Link>
      </aside>
    </div>
  );
}
