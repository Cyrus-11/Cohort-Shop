"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { deliverySchema } from "@/lib/delivery";
import styles from "./delivery-form.module.css";
import { useState, type FormEvent } from "react";

type Props = { cartSignature: string };

const STORAGE_KEY = "checkout-attempt";

// One key identifies one checkout attempt. It survives retries and reloads while the
// cart and delivery details are unchanged; edits get a new key.
function loadKey(signature: string): string {
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
    if (stored?.signature === signature && typeof stored.key === "string") return stored.key;
  } catch {
    // Storage can be unavailable; fall through to a fresh key.
  }
  const key = crypto.randomUUID();
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ signature, key }));
  } catch {
    // The key still works for this page view.
  }
  return key;
}

export function PayButton({ cartSignature }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  async function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const parsed = deliverySchema.safeParse(Object.fromEntries(form.entries()));
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check your delivery details."); return; }
    const delivery = parsed.data;
    setPending(true);
    setError(null);
    setReference(null);
    try {
      // Keep address/phone values out of browser storage; only persist a digest.
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cartSignature + JSON.stringify(delivery)));
      const signature = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
      const key = loadKey(signature);
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutKey: key, delivery }),
      });
      if (response.status === 401) {
        router.push("/login?next=/checkout");
        return;
      }
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Checkout could not be started. Your cart is unchanged.");
        setReference(body.reference ?? null);
        setPending(false);
        return;
      }
      if (typeof body.authorizationUrl === "string" && body.authorizationUrl.startsWith("https://")) {
        window.location.assign(body.authorizationUrl);
        return; // Keep the button disabled while the browser navigates.
      }
      router.push(`/checkout/result?reference=${encodeURIComponent(body.reference)}`);
    } catch {
      setError("Network problem. Your cart is unchanged; you can try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={pay} className={styles.form}>
      <fieldset disabled={pending} className={styles.fields}>
        <legend>Delivery details</legend>
        <p>Delivery within Nigeria. No delivery fee is added.</p>
        {[
          ["recipientName", "Recipient name", "name", 100],
          ["phone", "Phone number", "tel", 25],
          ["address", "Street address", "street-address", 250],
          ["city", "City", "address-level2", 100],
          ["state", "State / FCT", "address-level1", 100],
        ].map(([name, label, autoComplete, max]) => <label key={name} htmlFor={String(name)}>
          {label}<input id={String(name)} name={String(name)} autoComplete={String(autoComplete)} type={name === "phone" ? "tel" : "text"} maxLength={Number(max)} minLength={name === "phone" ? 10 : 2} aria-describedby={error ? "checkout-error" : undefined} required />
        </label>)}
      </fieldset>
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Connecting to Paystack…" : "Pay with Paystack"}
      </button>
      {error ? <p id="checkout-error" role="alert" className="form-error">{error}</p> : null}
      {reference ? (
        <p>
          <Link href={`/checkout/result?reference=${encodeURIComponent(reference)}`}>
            Check payment status
          </Link>
        </p>
      ) : null}
    </form>
  );
}
