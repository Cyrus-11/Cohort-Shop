import { NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { getOrderHistory } from "@/lib/order-history";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const session = await getApiSession(request);
  if (!session) return NextResponse.json({ error: "Sign in to view orders." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const raw = new URL(request.url).searchParams.get("page") ?? "1";
  if (!/^[1-9]\d{0,5}$/.test(raw)) return NextResponse.json({ error: "Invalid page." }, { status: 400 });
  try { return NextResponse.json(await getOrderHistory(session.user.id, Number(raw), session.client), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Orders are unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
