import { z } from "zod";

const itemSchema = z.object({
  name: z.string(),
  unit_price_kobo: z.number().int(),
  quantity: z.number().int(),
});

export type OrderItem = { name: string; unitPriceKobo: number; quantity: number };

// The JSON snapshot is validated by the database on insert; this narrows its type.
export function parseOrderItems(items: unknown): OrderItem[] {
  return z
    .array(itemSchema)
    .parse(items)
    .map((item) => ({
      name: item.name,
      unitPriceKobo: item.unit_price_kobo,
      quantity: item.quantity,
    }));
}
