import assert from "node:assert/strict";
import { test } from "node:test";
import { deliverySchema, parseDelivery } from "../../src/lib/delivery.ts";
import { buildOrderConfirmationEmail } from "../../src/lib/order-email.ts";

const details = { recipientName: "Demo Customer", phone: "+234 801 234 5678", address: "12 Demo Street", city: "Ikeja", state: "Lagos" };

test("delivery validation trims fields and rejects missing, malformed and oversized details", () => {
  assert.equal(deliverySchema.parse({ ...details, city: " Ikeja " }).city, "Ikeja");
  for (const invalid of [null, {}, { ...details, recipientName: " " }, { ...details, phone: "123" }, { ...details, phone: "a08012345678" }, { ...details, address: "x".repeat(251) }, { ...details, state: "Lagos\nB" }, { ...details, userId: "other" }]) {
    assert.equal(deliverySchema.safeParse(invalid).success, false);
  }
  assert.equal(parseDelivery(null), null);
});

test("receipt includes delivery details and escapes them in HTML; legacy receipts remain valid", () => {
  const order = { orderId: "demo-order", reference: "demo-reference", totalKobo: 1000, to: "demo@example.test", items: [], delivery: { ...details, recipientName: "<Demo & Customer>" } };
  const receipt = buildOrderConfirmationEmail(order);
  assert.match(receipt.text, /12 Demo Street/);
  assert.match(receipt.text, /Nigeria/);
  assert.match(receipt.html, /&lt;Demo &amp; Customer&gt;/);
  assert.doesNotMatch(receipt.html, /<Demo & Customer>/);
  assert.doesNotMatch(buildOrderConfirmationEmail({ ...order, delivery: null }).html, /Delivery details/);
});
