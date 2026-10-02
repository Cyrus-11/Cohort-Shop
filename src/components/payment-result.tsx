"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { PaymentView } from "@/lib/payments";
import { DeliverySummary } from "./delivery-summary";
import { formatKobo } from "@/lib/money";
import styles from "./payment-result.module.css";

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string; signedOut?: boolean; notFound?: boolean }
  | { phase: "done"; view: PaymentView };

export function PaymentResult({ reference }: { reference: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "loading" });

  // Initial state is already "loading", so the first run sets state only after the fetch.
  const run = useCallback(async () => {
    try {
      const response = await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const body = await response.json();
      if (response.ok) {
        setState({ phase: "done", view: body });
        // Confirming payment clears the cart on the server; refresh the header count.
        if (body.paymentStatus === "paid") router.refresh();
      } else {
        setState({
          phase: "error",
          message: body.error ?? "We could not check this payment right now.",
          signedOut: response.status === 401,
          notFound: response.status === 404,
        });
      }
    } catch {
      setState({
        phase: "error",
        message: "Network problem while checking the payment. Please check again; do not pay again.",
      });
    }
  }, [reference, router]);

  const check = useCallback(() => {
    setState({ phase: "loading" });
    void run();
  }, [run]);

  useEffect(() => {
    // Fetch on mount: state is only set after the response arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void run();
  }, [run]);

  if (state.phase === "loading") {
    return <p role="status" className="page-copy">Checking your payment with Paystack…</p>;
  }

  if (state.phase === "error") {
    return (
      <section className="status-panel" aria-labelledby="result-title">
        <h2 id="result-title">
          {state.notFound ? "Order not found" : state.signedOut ? "Sign in to see this order" : "We could not check the payment"}
        </h2>
        <p role="alert">{state.message}</p>
        {state.signedOut ? (
          <Link className="button" href={`/login?next=${encodeURIComponent(`/checkout/result?reference=${reference}`)}`}>
            Sign in with Google
          </Link>
        ) : state.notFound ? (
          <Link className="button" href="/">Back to shop</Link>
        ) : (
          <button type="button" className="button" onClick={check}>Check payment again</button>
        )}
      </section>
    );
  }

  const { view } = state;
  const title =
    view.paymentStatus === "paid"
      ? "Payment confirmed"
      : view.paymentStatus === "pending"
        ? "Payment still processing"
        : "Payment was not successful";

  return (
    <section className="status-panel" aria-labelledby="result-title">
      <h2 id="result-title">{title}</h2>
      {view.paymentStatus === "pending" ? (
        <p>
          We have not received confirmation from Paystack yet. Your cart is kept. Please do not pay
          again until you have checked the status.
        </p>
      ) : null}
      {view.paymentStatus === "unsuccessful" ? (
        <p>No payment was taken for this order, and your cart is kept so you can try again.</p>
      ) : null}
      {view.paymentStatus === "paid" ? (
        <p role="status" className={view.emailStatus === "accepted" ? "form-note" : undefined}>
          {view.emailStatus === "accepted"
            ? "A confirmation email has been sent to your Google address."
            : "Payment confirmed; email pending. We will keep trying to send your confirmation."}
        </p>
      ) : null}

      <dl className={styles.meta}>
        <dt>Reference</dt>
        <dd>{view.reference}</dd>
        <dt>Order</dt>
        <dd>{view.orderId}</dd>
      </dl>
      <ul className={styles.items}>
        {view.items.map((item) => (
          <li key={item.name}>
            <span>{item.name} × {item.quantity}</span>
            <span>{formatKobo(item.unitPriceKobo * item.quantity)}</span>
          </li>
        ))}
      </ul>
      <p className={styles.total}>
        <span>Total</span>
        <strong>{formatKobo(view.totalKobo)}</strong>
      </p>

      <DeliverySummary details={view.delivery} />
      <div className={styles.actions}>
        <Link className="button button-secondary" href="/orders">View order history</Link>
        {view.paymentStatus === "pending" ? (
          <button type="button" className="button" onClick={check}>Check payment again</button>
        ) : null}
        {view.paymentStatus === "paid" && view.emailStatus !== "accepted" ? (
          <button type="button" className="button button-secondary" onClick={check}>
            Retry confirmation email
          </button>
        ) : null}
        {view.paymentStatus === "unsuccessful" ? (
          <Link className="button" href="/checkout">Back to checkout</Link>
        ) : null}
        <Link className="button button-secondary" href="/">Back to shop</Link>
      </div>
    </section>
  );
}
