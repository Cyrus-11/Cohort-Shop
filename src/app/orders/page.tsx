import type { Metadata } from "next";
import Link from "next/link";
import { DeliverySummary } from "@/components/delivery-summary";
import { getCurrentUser } from "@/lib/auth";
import { getOrderHistory } from "@/lib/order-history";
import { parseDelivery } from "@/lib/delivery";
import { parseOrderItems } from "@/lib/order-items";
import { formatKobo } from "@/lib/money";
import styles from "./orders.module.css";

export const metadata: Metadata = { title: "Order history" };
export const dynamic = "force-dynamic";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return <div className="shell page"><h1 className="page-heading">Your orders</h1><section className="status-panel"><h2>Sign in to see your orders</h2><p>Your order history is linked to your Google account.</p><Link className="button" href="/login?next=/orders">Sign in with Google</Link></section></div>;
  const params = await searchParams;
  const page = params.page && /^[1-9]\d{0,5}$/.test(params.page) ? Number(params.page) : 1;
  let history;
  try { history = await getOrderHistory(user.id, page); } catch {
    return <div className="shell page"><h1 className="page-heading">Your orders</h1><section className="status-panel"><h2>Orders are unavailable</h2><p>We could not load your orders. Please try again.</p><Link className="button" href="/orders">Try again</Link></section></div>;
  }
  return <div className="shell page">
    <h1 className="page-heading">Your orders</h1>
    <p className="page-copy">Your purchases and payments, newest first.</p>
    {history.orders.length === 0 ? <section className="status-panel"><h2>{page === 1 ? "No orders yet" : "No more orders"}</h2><p>{page === 1 ? "Your orders will appear here when you start checkout." : "Return to an earlier page to see your orders."}</p><Link className="button" href={page === 1 ? "/" : "/orders"}>{page === 1 ? "Browse the shop" : "Back to latest orders"}</Link></section> : <ol className={styles.list}>
      {history.orders.map(order => <li key={order.id} className={styles.card}>
        <div className={styles.top}><h2>Order {order.id.slice(0, 8)}</h2><span className={styles.badge}>{order.payment_status === "paid" ? "Payment confirmed" : "Payment not confirmed"}</span></div>
        <p><time dateTime={order.created_at}>{new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }).format(new Date(order.created_at))} WAT</time></p>
        <ul className={styles.items}>{parseOrderItems(order.items).map((item, index) => <li key={index}><span>{item.name} × {item.quantity}</span><span>{formatKobo(item.unitPriceKobo * item.quantity)}</span></li>)}</ul>
        <p className={styles.total}>Total <strong>{formatKobo(order.total_kobo)}</strong></p>
        <DeliverySummary details={parseDelivery(order.delivery_details)} />
        <p className={styles.reference}>Reference: {order.payment_reference}</p>
        <Link className="button button-secondary" href={`/checkout/result?reference=${encodeURIComponent(order.payment_reference)}`}>{order.payment_status === "paid" ? "View payment confirmation" : "Check payment status"}</Link>
      </li>)}
    </ol>}
    <nav className={styles.pagination} aria-label="Order history pages">
      {page > 1 ? <Link className="button button-secondary" href={`/orders?page=${page - 1}`}>Newer orders</Link> : null}
      {history.hasNext ? <Link className="button button-secondary" href={`/orders?page=${page + 1}`}>Older orders</Link> : null}
    </nav>
  </div>;
}
