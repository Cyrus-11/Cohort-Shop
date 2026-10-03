import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiSession, isAllowedApiWrite } from "@/lib/api-session";
import { startCheckout } from "@/lib/orders";
import { deliverySchema } from "@/lib/delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: noStore });

const bodySchema = z.object({ checkoutKey: z.uuid(), delivery: deliverySchema }).strict();

export async function GET(request: Request) {
  const session = await getApiSession(request);
  if (!session) return json({ error: "Sign in to check out." }, 401);
  const { data, error } = await session.client.from("orders")
    .select("payment_reference, total_kobo")
    .eq("user_id", session.user.id).eq("payment_status", "pending")
    .not("authorization_url", "is", null)
    .order("created_at", { ascending: false }).limit(1);
  if (error) return json({ error: "Pending payments could not be loaded." }, 503);
  return json({ pending: data?.[0] ?? null });
}

export async function POST(request: Request) {
  if (!isAllowedApiWrite(request)) return json({ error: "Request not allowed." }, 403);
  const user = (await getApiSession(request))?.user;
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
    const result = await startCheckout(user, parsed.data.checkoutKey, parsed.data.delivery);
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
