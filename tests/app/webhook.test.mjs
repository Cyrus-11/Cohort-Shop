import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { beforeEach, test } from "node:test";

// Calls the real webhook route handler with mocked Paystack, database, and Mailgun.
process.env.PAYSTACK_SECRET_KEY = "sk_test_fake_secret_for_unit_tests";
process.env.PAYSTACK_MODE = "test";

const { POST } = await import("@/app/api/paystack/webhook/route");

let order;
beforeEach(() => {
  order = {
    id: randomUUID(), user_id: randomUUID(), customer_email: "buyer@example.test",
    items: [{ product_id: randomUUID(), name: "Everyday Tee", unit_price_kobo: 1200000, quantity: 1, cart_revision: randomUUID() }],
    total_kobo: 1200000, currency: "NGN", checkout_key: randomUUID(),
    payment_reference: `cs-${randomUUID().replaceAll("-", "")}`, authorization_url: "https://checkout.paystack.com/x",
    payment_status: "pending", paid_at: null, email_status: "pending", email_attempt_at: null,
    email_attempt_id: null, mailgun_message_id: null, created_at: new Date().toISOString(),
  };
  globalThis.__orders = [order];
  globalThis.__finalizeCalls = 0;
  globalThis.__mailgun = { sent: [], mode: "accept", delay: 0 };
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ status: true, data: { status: "success", reference: order.payment_reference, amount: order.total_kobo, currency: "NGN", domain: "test" } }));
});

const sign = (body) => createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(body).digest("hex");
const post = (body, signature = sign(body)) =>
  POST(new Request("http://localhost/api/paystack/webhook", {
    method: "POST", body, headers: signature === null ? {} : { "x-paystack-signature": signature },
  }));
const charge = (reference) => JSON.stringify({ event: "charge.success", data: { reference } });

test("missing, wrong, or mismatched signatures are rejected before any work", async () => {
  const body = charge(order.payment_reference);
  assert.equal((await post(body, null)).status, 401);
  assert.equal((await post(body, "00".repeat(64))).status, 401);
  assert.equal((await post(body, sign(charge("other")))).status, 401);
  assert.equal(order.payment_status, "pending");
  assert.equal(globalThis.__mailgun.sent.length, 0);
});

test("signed events of other types are acknowledged with 200", async () => {
  assert.equal((await post(JSON.stringify({ event: "transfer.success", data: {} }))).status, 200);
  assert.equal((await post(JSON.stringify({ event: "ping" }))).status, 200);
  assert.equal(order.payment_status, "pending");
});

test("signed but malformed charge events are rejected with 400", async () => {
  assert.equal((await post(JSON.stringify({ event: "charge.success", data: {} }))).status, 400);
  assert.equal((await post("not json")).status, 400);
});

test("a signed charge.success for an unknown reference is acknowledged", async () => {
  assert.equal((await post(charge("cs-unknown"))).status, 200);
  assert.equal(order.payment_status, "pending");
});

test("a signed charge.success pays the order once; replays change nothing", async () => {
  const body = charge(order.payment_reference);
  assert.equal((await post(body)).status, 200);
  assert.equal(order.payment_status, "paid");
  assert.equal(order.email_status, "accepted");
  for (let i = 0; i < 3; i++) assert.equal((await post(body)).status, 200);
  assert.equal(globalThis.__mailgun.sent.length, 1);
  assert.equal(globalThis.__orders.length, 1);
});

test("a temporary Paystack outage returns a retryable 503", async () => {
  globalThis.fetch = async () => new Response("{}", { status: 500 });
  assert.equal((await post(charge(order.payment_reference))).status, 503);
  assert.equal(order.payment_status, "pending");
});

test("a signed success that Paystack cannot confirm yet returns 503 so it is retried", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ status: false }), { status: 404 });
  assert.equal((await post(charge(order.payment_reference))).status, 503);
  assert.equal(order.payment_status, "pending");
});

test("a verified payment with the wrong amount is acknowledged but never marks the order paid", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ status: true, data: { status: "success", reference: order.payment_reference, amount: 100, currency: "NGN", domain: "test" } }));
  assert.equal((await post(charge(order.payment_reference))).status, 200);
  assert.equal(order.payment_status, "pending");
  assert.equal(globalThis.__mailgun.sent.length, 0);
});
