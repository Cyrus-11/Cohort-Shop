import "server-only";
import FormData from "form-data";
import Mailgun from "mailgun.js";
import { getMailgunEnv } from "@/lib/env/server";
import { formatKobo } from "@/lib/money";
import type { OrderItem } from "@/lib/order-items";

const TIMEOUT_MS = 10000;

// rejected: Mailgun definitely refused the message (safe to retry later).
// unknown: timeout, network or server fault - acceptance is uncertain.
export class MailgunError extends Error {
  readonly kind: "rejected" | "unknown";

  constructor(kind: "rejected" | "unknown") {
    super(`Mailgun request failed (${kind}).`);
    this.kind = kind;
  }
}

type OrderEmail = {
  orderId: string;
  to: string;
  reference: string;
  totalKobo: number;
  items: OrderItem[];
};

export function buildConfirmationText(order: OrderEmail): string {
  const lines = order.items.map(
    (item) => `- ${item.name} x ${item.quantity}: ${formatKobo(item.unitPriceKobo * item.quantity)}`,
  );
  return [
    "Thank you for your order at Cohort Shop. Your payment was confirmed.",
    "",
    `Order ID: ${order.orderId}`,
    `Payment reference: ${order.reference}`,
    "",
    "Items:",
    ...lines,
    "",
    `Total: ${formatKobo(order.totalKobo)}`,
  ].join("\n");
}

// Resolves with Mailgun's message ID once Mailgun accepts the message for delivery.
export async function sendOrderConfirmation(order: OrderEmail): Promise<{ messageId: string }> {
  const env = getMailgunEnv();
  const client = new Mailgun(FormData).client({
    username: "api",
    key: env.MAILGUN_API_KEY,
    url: env.MAILGUN_API_URL,
    timeout: TIMEOUT_MS,
  });

  try {
    const result = await client.messages.create(env.MAILGUN_DOMAIN, {
      from: env.MAILGUN_FROM,
      to: [order.to],
      subject: `Your Cohort Shop order ${order.orderId.slice(0, 8)}`,
      text: buildConfirmationText(order),
    });
    if (!result.id || !result.id.trim()) throw new MailgunError("unknown");
    return { messageId: result.id.trim() };
  } catch (error) {
    if (error instanceof MailgunError) throw error;
    const status = (error as { status?: unknown })?.status;
    const definite =
      typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 429;
    throw new MailgunError(definite ? "rejected" : "unknown");
  }
}
