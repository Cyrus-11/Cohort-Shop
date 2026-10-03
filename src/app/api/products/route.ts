import { NextResponse } from "next/server";
import { getProducts } from "@/lib/products";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(await getProducts(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Products are unavailable. Please try again." }, { status: 503 }); }
}
