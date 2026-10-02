import "server-only";
import FormData from "form-data";
import Mailgun from "mailgun.js";
import { getMailgunEnv } from "@/lib/env/server";
import { buildOrderConfirmationEmail, type OrderEmail } from "@/lib/order-email";

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
      ...buildOrderConfirmationEmail(order),
      "o:tracking": "no",
      "o:tracking-clicks": "no",
      "o:tracking-opens": "no",
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
