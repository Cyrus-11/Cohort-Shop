import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmPayment } from "@/lib/payments";
import { isValidWebhookSignature } from "@/lib/paystack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const eventSchema = z.object({ event: z.string(), data: z.unknown().optional() });
const chargeSchema = z.object({ reference: z.string().regex(/^[A-Za-z0-9.-]{1,100}$/) });

export async function POST(request: Request) {
  // Read the raw bytes once; the signature covers exactly these bytes.
  const rawBody = Buffer.from(await request.arrayBuffer());
  let valid = false;
  try {
    valid = isValidWebhookSignature(rawBody, request.headers.get("x-paystack-signature"));
  } catch {
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 500 });
  }
  if (!valid) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });

  let parsed;
  try {
    parsed = eventSchema.safeParse(JSON.parse(rawBody.toString("utf8")));
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });

  // Signed but irrelevant events are acknowledged without work.
  if (parsed.data.event !== "charge.success") {
    return NextResponse.json({ received: true });
  }
  const charge = chargeSchema.safeParse(parsed.data.data);
  if (!charge.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });

  // The payload is only a hint: confirmPayment re-verifies with Paystack and awaits
  // finalisation and email before we answer, so nothing runs after the response.
  const outcome = await confirmPayment(charge.data.reference);
  if (outcome.kind === "unavailable") {
    return NextResponse.json({ error: "Temporarily unavailable." }, { status: 503 });
  }
  if (outcome.kind === "order" && outcome.view.paymentStatus === "pending") {
    return NextResponse.json({ error: "Payment not yet verifiable." }, { status: 503 });
  }
  return NextResponse.json({ received: true });
}
