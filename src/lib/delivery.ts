import { z } from "zod";

const text = (label: string, max: number) => z.string().trim().min(2, `${label} is required.`).max(max, `${label} is too long.`).refine((value) => !/[\u0000-\u001f\u007f]/.test(value), `${label} contains invalid characters.`);

export const deliverySchema = z.object({
  recipientName: text("Recipient name", 100),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,25}$/, "Enter a valid phone number.").refine((value) => value.replace(/\D/g, "").length >= 10 && value.replace(/\D/g, "").length <= 15, "Enter a phone number with 10–15 digits."),
  address: text("Street address", 250),
  city: text("City", 100),
  state: text("State", 100),
}).strict();

export type DeliveryDetails = z.infer<typeof deliverySchema>;

export function parseDelivery(value: unknown): DeliveryDetails | null {
  const parsed = deliverySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function deliveryLines(details: DeliveryDetails): string[] {
  return [details.recipientName, details.phone, details.address, `${details.city}, ${details.state}`, "Nigeria"];
}
