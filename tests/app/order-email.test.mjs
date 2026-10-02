import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOrderConfirmationEmail } from "@/lib/order-email";
import { formatKobo } from "@/lib/money";
import { sendOrderConfirmation } from "../../src/lib/mailgun.ts";

const order = {
  orderId: "12345678-1234-1234-1234-123456789012",
  reference: "cs-confirmed-reference",
  to: "buyer@example.test",
  totalKobo: 3500000,
  items: [
    { name: "Everyday Tee", unitPriceKobo: 1200000, quantity: 2 },
    { name: "Linen Dress", unitPriceKobo: 1100000, quantity: 1 },
  ],
};

test("HTML and plain-text receipts preserve the paid snapshot and full references", () => {
  const message = buildOrderConfirmationEmail(order);
  for (const body of [message.html, message.text]) {
    for (const value of ["Everyday Tee", "Linen Dress", order.orderId, order.reference,
      formatKobo(2400000), formatKobo(1100000), formatKobo(order.totalKobo)]) {
      assert.ok(body.includes(value), value);
    }
  }
  assert.match(message.html, /scope="col"/);
  assert.match(message.text, /Everyday Tee x 2/);
  assert.match(message.subject, /12345678/);
});

test("untrusted snapshot names and references cannot inject HTML", () => {
  const message = buildOrderConfirmationEmail({
    ...order,
    orderId: "<script>alert(1)</script>",
    reference: '<img src=x onerror="alert(1)">',
    items: [{ name: 'Shirt & <strong>"Sale"</strong> \'special\'', unitPriceKobo: 10000, quantity: 1 }],
  });
  assert.ok(!message.html.includes("<script>"));
  assert.ok(!message.html.includes("<img"));
  assert.ok(message.html.includes("&lt;script&gt;"));
  assert.ok(message.html.includes("Shirt &amp; &lt;strong&gt;&quot;Sale&quot;&lt;/strong&gt; &#39;special&#39;"));
});

test("receipt has no remote images, scripts, tracking pixels or promotional claims", () => {
  const { html } = buildOrderConfirmationEmail(order);
  assert.doesNotMatch(html, /<script|<img|https?:\/\//i);
  assert.doesNotMatch(html, /shipped|discount|unsubscribe/i);
});

test("Mailgun receives both receipt formats with tracking disabled", async () => {
  process.env.MAILGUN_API_KEY = "fake-key";
  process.env.MAILGUN_DOMAIN = "mail.example.test";
  process.env.MAILGUN_FROM = "Cohort Shop <orders@mail.example.test>";
  process.env.MAILGUN_API_URL = "https://api.mailgun.net";
  globalThis.__mailgunSdk = { sent: [] };
  const result = await sendOrderConfirmation(order);
  assert.equal(result.messageId, "<receipt@example.test>");
  assert.equal(globalThis.__mailgunSdk.sent.length, 1);
  const { domain, message } = globalThis.__mailgunSdk.sent[0];
  assert.equal(domain, "mail.example.test");
  assert.deepEqual(message.to, [order.to]);
  assert.equal(message.html, buildOrderConfirmationEmail(order).html);
  assert.equal(message.text, buildOrderConfirmationEmail(order).text);
  for (const option of ["o:tracking", "o:tracking-clicks", "o:tracking-opens"]) assert.equal(message[option], "no");
});

test("Mailgun rejection is safe to retry but timeout, rate limit and server faults stay uncertain", async () => {
  for (const [error, kind] of [[{status:401}, "rejected"], [{status:408}, "unknown"],
    [{status:429}, "unknown"], [{status:500}, "unknown"], [new Error("timeout"), "unknown"]]) {
    globalThis.__mailgunSdk = { sent: [], error };
    await assert.rejects(sendOrderConfirmation(order), e => e.kind === kind);
  }
});
