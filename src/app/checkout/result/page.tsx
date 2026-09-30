import type { Metadata } from "next";
import Link from "next/link";
import { PaymentResult } from "@/components/payment-result";

export const metadata: Metadata = { title: "Payment result" };
export const dynamic = "force-dynamic";

type ResultProps = { searchParams: Promise<{ reference?: string; trxref?: string }> };

export default async function CheckoutResultPage({ searchParams }: ResultProps) {
  const params = await searchParams;
  const reference = params.reference ?? params.trxref;
  const valid = typeof reference === "string" && /^[A-Za-z0-9.-]{1,100}$/.test(reference);

  return (
    <div className="shell page">
      <h1 className="page-heading">Payment status</h1>
      {valid ? (
        <PaymentResult reference={reference} />
      ) : (
        <section className="status-panel" aria-labelledby="none-title">
          <h2 id="none-title">No payment to check</h2>
          <p>Open this page from your checkout, or go back to the shop.</p>
          <Link className="button" href="/">Back to shop</Link>
        </section>
      )}
    </div>
  );
}
