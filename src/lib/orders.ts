import "server-only";
import { getAppEnv } from "@/lib/env/server";
import { initializeTransaction, PaystackError, verifyTransaction } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CurrentUser } from "@/lib/auth";

export type CheckoutResult =
  | { ok: true; orderId: string; reference: string; paymentStatus: "pending" | "paid"; authorizationUrl: string | null }
  | { ok: false; status: 400 | 409 | 502 | 500; error: string; reference?: string };

const CART_PROBLEM = "Your cart is empty or has items that are no longer available.";

// Prices come from the database inside create_order_snapshot; the browser only
// supplies the retry key. The user comes from verified session claims.
export async function startCheckout(user: CurrentUser, checkoutKey: string): Promise<CheckoutResult> {
  const admin = createAdminClient();

  const { data: created, error: createError } = await admin.rpc("create_order_snapshot", {
    p_user_id: user.id,
    p_customer_email: user.email,
    p_checkout_key: checkoutKey,
  });
  if (createError || !created) {
    return createError?.code === "22023"
      ? { ok: false, status: 400, error: CART_PROBLEM }
      : { ok: false, status: 500, error: "Checkout could not be started. Please try again." };
  }
  let order = created;
  const summary = (url: string | null) => ({
    ok: true as const,
    orderId: order.id,
    reference: order.payment_reference,
    paymentStatus: order.payment_status as "pending" | "paid",
    authorizationUrl: url,
  });

  if (order.payment_status === "paid") return summary(null);
  if (order.authorization_url) return summary(order.authorization_url);

  // The order and reference are saved; now initialise with Paystack. Paystack
  // rejects a repeated reference, so concurrent requests cannot create two payments.
  try {
    const { authorizationUrl } = await initializeTransaction({
      email: order.customer_email,
      amountKobo: order.total_kobo,
      reference: order.payment_reference,
      callbackUrl: new URL("/checkout/result", getAppEnv().APP_URL).toString(),
    });
    const { data: saved, error: saveError } = await admin
      .from("orders")
      .update({ authorization_url: authorizationUrl })
      .eq("id", order.id)
      .eq("user_id", user.id)
      .is("authorization_url", null)
      .select()
      .maybeSingle();
    if (saveError) throw saveError;
    if (saved) order = saved;
    return summary(authorizationUrl);
  } catch (error) {
    return reconcile(user.id, order.id, order.payment_reference, error);
  }
}

// After an uncertain initialisation, check the stored order and Paystack before
// anything could start a second transaction for the same order.
async function reconcile(
  userId: string,
  orderId: string,
  reference: string,
  cause: unknown,
): Promise<CheckoutResult> {
  const admin = createAdminClient();
  const { data: current } = await admin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("user_id", userId)
    .maybeSingle();
  if (current?.payment_status === "paid") {
    return { ok: true, orderId, reference, paymentStatus: "paid", authorizationUrl: null };
  }
  if (current?.authorization_url) {
    return { ok: true, orderId, reference, paymentStatus: "pending", authorizationUrl: current.authorization_url };
  }

  const kind = cause instanceof PaystackError ? cause.kind : "unknown";
  if (kind === "rejected") {
    return { ok: false, status: 502, error: "The payment provider could not start this payment. Your cart is unchanged; please try again shortly." };
  }

  try {
    const transaction = await verifyTransaction(reference);
    if (transaction === null) {
      return { ok: false, status: 502, error: "The payment provider did not respond. Nothing was charged and your cart is unchanged; please try again." };
    }
  } catch {
    // Verification is also unavailable, so the outcome is unknown.
  }
  return {
    ok: false,
    status: 409,
    reference,
    error: "We are still confirming this payment with the provider. Please do not pay again; check the payment status instead.",
  };
}
