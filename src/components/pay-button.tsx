"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { cartSignature: string };

const STORAGE_KEY = "checkout-attempt";

// One key identifies one checkout attempt. It survives retries and reloads while the
// cart is unchanged; a deliberately changed cart gets a new key.
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

  async function pay() {
    if (pending) return;
    const key = loadKey(cartSignature);
    setPending(true);
    setError(null);
    setReference(null);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutKey: key }),
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
    <div>
      <button type="button" className="button" onClick={pay} disabled={pending}>
        {pending ? "Connecting to Paystack…" : "Pay with Paystack"}
      </button>
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      {reference ? (
        <p>
          <Link href={`/checkout/result?reference=${encodeURIComponent(reference)}`}>
            Check payment status
          </Link>
        </p>
      ) : null}
    </div>
  );
}
