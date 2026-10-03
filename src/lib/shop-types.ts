import type { OrderItem } from "@/lib/order-items";
import type { DeliveryDetails } from "@/lib/delivery";

export type CartLine = {
  productId: string;
  name: string;
  imagePath: string;
  unitPriceKobo: number;
  quantity: number;
  lineTotalKobo: number;
};
export type CartView = { items: CartLine[]; totalKobo: number; count: number };
export type PaymentView = {
  orderId: string;
  reference: string;
  paymentStatus: "paid" | "pending" | "unsuccessful";
  emailStatus: "pending" | "sending" | "accepted" | "failed";
  items: OrderItem[];
  delivery: DeliveryDetails | null;
  totalKobo: number;
};
