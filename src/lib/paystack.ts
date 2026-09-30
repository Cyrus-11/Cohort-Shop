import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getPaystackEnv } from "@/lib/env/server";

const API_URL = "https://api.paystack.co";
const TIMEOUT_MS = 8000;

// unknown: timeout, network, 5xx or unreadable reply - the provider may or may not have acted.
// duplicate: the reference was already used. rejected: a definite provider refusal.
export class PaystackError extends Error {
  readonly kind: "unknown" | "duplicate" | "rejected";

  constructor(kind: "unknown" | "duplicate" | "rejected") {
    super(`Paystack request failed (${kind}).`);
    this.kind = kind;
  }
}

async function paystackFetch(path: string, init: RequestInit = {}) {
  const { PAYSTACK_SECRET_KEY } = getPaystackEnv();
  try {
    return await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new PaystackError("unknown");
  }
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

const initializeSchema = z.object({
  status: z.literal(true),
  data: z.object({ authorization_url: z.url(), reference: z.string() }),
});

export async function initializeTransaction(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
}): Promise<{ authorizationUrl: string }> {
  const response = await paystackFetch("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKobo,
      currency: "NGN",
      reference: input.reference,
      callback_url: input.callbackUrl,
    }),
  });
  const body = await readBody(response);

  if (!response.ok) {
    const details = body as { code?: unknown; message?: unknown } | undefined;
    if (
      details?.code === "duplicate_reference" ||
      (typeof details?.message === "string" && /duplicate/i.test(details.message))
    ) {
      throw new PaystackError("duplicate");
    }
    throw new PaystackError(response.status >= 500 ? "unknown" : "rejected");
  }

  const parsed = initializeSchema.safeParse(body);
  if (!parsed.success || parsed.data.data.reference !== input.reference) {
    throw new PaystackError("unknown");
  }
  const url = new URL(parsed.data.data.authorization_url);
  if (url.protocol !== "https:" || !url.hostname.endsWith("paystack.com")) {
    throw new PaystackError("unknown");
  }
  return { authorizationUrl: url.toString() };
}

const verifySchema = z.object({
  status: z.literal(true),
  data: z.object({
    status: z.string(),
    reference: z.string(),
    amount: z.number(),
    currency: z.string(),
    domain: z.string(),
  }),
});

export type PaystackTransaction = {
  status: string;
  reference: string;
  amountKobo: number;
  currency: string;
  domain: string;
};

// Returns null when Paystack has no transaction with this reference.
export async function verifyTransaction(reference: string): Promise<PaystackTransaction | null> {
  const response = await paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`);
  const body = await readBody(response);
  if (response.status === 404) return null;
  if (!response.ok) throw new PaystackError(response.status >= 500 ? "unknown" : "rejected");

  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) throw new PaystackError("unknown");
  const { data } = parsed.data;
  return {
    status: data.status,
    reference: data.reference,
    amountKobo: data.amount,
    currency: data.currency,
    domain: data.domain,
  };
}

// Paystack signs the raw request bytes with HMAC-SHA512 using the secret key.
export function isValidWebhookSignature(rawBody: Buffer, signature: string | null): boolean {
  if (!signature) return false;
  const expected = createHmac("sha512", getPaystackEnv().PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
