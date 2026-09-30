import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isSameOrigin } from "@/lib/auth";
import { startCheckout } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: noStore });

const bodySchema = z.object({ checkoutKey: z.uuid() });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  const user = await getCurrentUser();
  if (!user) return json({ error: "Sign in to check out." }, 401);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    payload = undefined;
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return json({ error: "Invalid checkout request." }, 400);

  try {
    const result = await startCheckout(user, parsed.data.checkoutKey);
    if (!result.ok) return json({ error: result.error, reference: result.reference }, result.status);
    return json({
      orderId: result.orderId,
      reference: result.reference,
      paymentStatus: result.paymentStatus,
      authorizationUrl: result.authorizationUrl,
    });
  } catch {
    return json({ error: "Checkout could not be started. Please try again." }, 500);
  }
}
