import { supabase } from "./supabase";
import { config } from "./config";
import type { CartView, PaymentView } from "../../src/lib/shop-types";
import type { DeliveryDetails } from "../../src/lib/delivery";
import type { Database } from "../../src/lib/supabase/database.types";

export type Product = Pick<Database["public"]["Tables"]["products"]["Row"], "id" | "name" | "description" | "image_path" | "price_kobo">;
export type HistoryOrder = Pick<Database["public"]["Tables"]["orders"]["Row"], "id" | "items" | "total_kobo" | "payment_status" | "payment_reference" | "created_at" | "delivery_details">;
export type History = { orders: HistoryOrder[]; hasNext: boolean };
export type Checkout = { orderId: string; reference: string; authorizationUrl: string | null; paymentStatus: string };
export class ApiError extends Error {
  constructor(message: string, public status: number, public reference?: string) { super(message); }
}

export async function request<T>(path: string, method = "GET", body?: unknown, publicRequest = false): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!publicRequest) {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw new Error("Sign in with Google to continue.");
    headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(new URL(path, config.apiUrl).toString(), { method, headers, signal: controller.signal, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    let result;
    try { result = await response.json(); } catch { throw new Error("The shop returned an unexpected response. Please try again."); }
    if (!response.ok) throw new ApiError(response.status === 401 ? "Your session expired. Sign in again." : result.error ?? "The request failed. Please try again.", response.status, typeof result.reference === "string" ? result.reference : undefined);
    return result as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("The shop did not respond. Check your connection and try again.");
    throw error;
  } finally { clearTimeout(timer); }
}

export const api = {
  products: () => request<Product[]>("/api/products", "GET", undefined, true),
  cart: () => request<CartView>("/api/cart"),
  setQuantity: (productId: string, quantity: number) => request<CartView>("/api/cart", "PUT", { productId, quantity }),
  remove: (productId: string) => request<CartView>("/api/cart", "DELETE", { productId }),
  orders: (page: number) => request<History>(`/api/orders?page=${page}`),
  pendingCheckout: () => request<{ pending: { payment_reference: string; total_kobo: number } | null }>("/api/checkout"),
  checkout: (checkoutKey: string, delivery: DeliveryDetails) => request<Checkout>("/api/checkout", "POST", { checkoutKey, delivery }),
  verify: (reference: string) => request<PaymentView>("/api/payments/verify", "POST", { reference }),
};
