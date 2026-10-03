import "server-only";
import { getPaystackEnv } from "@/lib/env/server";
import { MailgunError, sendOrderConfirmation } from "@/lib/mailgun";
import { parseOrderItems } from "@/lib/order-items";
import { verifyTransaction } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

import { parseDelivery } from "@/lib/delivery";

type Order = Database["public"]["Tables"]["orders"]["Row"];

import type { PaymentView } from "@/lib/shop-types";
export type { PaymentView } from "@/lib/shop-types";

export type ConfirmOutcome =
  | { kind: "order"; view: PaymentView }
  | { kind: "not_found" }
  | { kind: "unavailable" };

const FAILED_PROVIDER_STATUSES = new Set(["failed", "reversed"]);

function toView(order: Order, paymentStatus: PaymentView["paymentStatus"]): PaymentView {
  return {
    orderId: order.id,
    reference: order.payment_reference,
    paymentStatus,
    emailStatus: order.email_status as PaymentView["emailStatus"],
    items: parseOrderItems(order.items),
    delivery: parseDelivery(order.delivery_details),
    totalKobo: order.total_kobo,
  };
}

async function loadOrder(id: string): Promise<Order | null> {
  const { data, error } = await createAdminClient().from("orders").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

// Shared by the verify endpoint and the webhook. A redirect, query string or webhook
// body never marks an order paid: only Paystack's verify API plus an exact match of
// reference, amount, currency and test/live domain does. Pass ownerUserId for
// customer requests; the webhook (signature-checked) omits it.
export async function confirmPayment(
  reference: string,
  options: { ownerUserId?: string } = {},
): Promise<ConfirmOutcome> {
  try {
    const admin = createAdminClient();
    const { data: found, error } = await admin
      .from("orders")
      .select("*")
      .eq("payment_reference", reference)
      .maybeSingle();
    if (error) throw error;
    if (!found || (options.ownerUserId && found.user_id !== options.ownerUserId)) {
      return { kind: "not_found" };
    }

    let order = found;
    let paymentStatus: PaymentView["paymentStatus"] = "paid";

    if (order.payment_status !== "paid") {
      const transaction = await verifyTransaction(order.payment_reference);
      if (transaction === null) {
        paymentStatus = "pending";
      } else if (transaction.status === "success") {
        const matches =
          transaction.reference === order.payment_reference &&
          transaction.amountKobo === order.total_kobo &&
          transaction.currency === order.currency &&
          transaction.domain === getPaystackEnv().PAYSTACK_MODE;
        if (!matches) {
          console.error("Paystack payment did not match the stored order", { orderId: order.id });
          paymentStatus = "unsuccessful";
        } else {
          const { data: paid, error: finalizeError } = await admin.rpc("finalize_paid_order", {
            p_order_id: order.id,
            p_reference: order.payment_reference,
            p_amount_kobo: transaction.amountKobo,
            p_currency: transaction.currency,
          });
          if (finalizeError || !paid) throw finalizeError ?? new Error("No order returned.");
          order = paid;
        }
      } else {
        paymentStatus = FAILED_PROVIDER_STATUSES.has(transaction.status) ? "unsuccessful" : "pending";
      }
    }

    if (order.payment_status === "paid") order = await sendConfirmationOnce(order);
    return { kind: "order", view: toView(order, paymentStatus) };
  } catch {
    return { kind: "unavailable" };
  }
}

// The database claim lets exactly one caller send. Accepted and in-flight emails are
// skipped. A timeout leaves the order in "sending" (acceptance uncertain) for manual
// reconciliation against Mailgun logs rather than risking a duplicate.
async function sendConfirmationOnce(order: Order): Promise<Order> {
  if (order.email_status === "accepted" || order.email_status === "sending") return order;

  const admin = createAdminClient();
  const { data: claimed, error: claimError } = await admin.rpc("claim_order_email", {
    p_order_id: order.id,
  });
  if (claimError) throw claimError;
  const claim = claimed?.[0];
  if (!claim || !claim.email_attempt_id) return (await loadOrder(order.id)) ?? order;

  try {
    const { messageId } = await sendOrderConfirmation({
      orderId: claim.id,
      to: claim.customer_email,
      reference: claim.payment_reference,
      totalKobo: claim.total_kobo,
      items: parseOrderItems(claim.items),
      delivery: parseDelivery(claim.delivery_details),
    });
    await admin.rpc("complete_order_email", {
      p_order_id: claim.id,
      p_attempt_id: claim.email_attempt_id,
      p_status: "accepted",
      p_message_id: messageId,
    });
  } catch (error) {
    if (error instanceof MailgunError && error.kind === "rejected") {
      await admin.rpc("complete_order_email", {
        p_order_id: claim.id,
        p_attempt_id: claim.email_attempt_id,
        p_status: "failed",
      });
    } else {
      console.error("Order email outcome is uncertain; left in sending state", { orderId: claim.id });
    }
  }
  return (await loadOrder(order.id)) ?? order;
}
