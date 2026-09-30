import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isSameOrigin } from "@/lib/auth";
import { confirmPayment } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: noStore });

const bodySchema = z.object({ reference: z.string().regex(/^[A-Za-z0-9.-]{1,100}$/) });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "Request not allowed." }, 403);
  const user = await getCurrentUser();
  if (!user) return json({ error: "Sign in to check a payment." }, 401);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    payload = undefined;
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return json({ error: "Invalid payment reference." }, 400);

  const outcome = await confirmPayment(parsed.data.reference, { ownerUserId: user.id });
  if (outcome.kind === "not_found") return json({ error: "Order not found." }, 404);
  if (outcome.kind === "unavailable") {
    return json(
      { error: "We could not check this payment right now. Please check again in a moment; do not pay again." },
      503,
    );
  }
  return json(outcome.view);
}
