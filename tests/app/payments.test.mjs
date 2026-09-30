import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { beforeEach, test } from "node:test";

// Mocked provider checks only: no real payments, emails, or network calls.
process.env.PAYSTACK_SECRET_KEY = "sk_test_fake_secret_for_unit_tests";
process.env.PAYSTACK_MODE = "test";

const { confirmPayment } = await import("@/lib/payments");
const { isValidWebhookSignature } = await import("@/lib/paystack");

const OWNER = randomUUID();

function makeOrder(overrides = {}) {
  return {
    id: randomUUID(),
    user_id: OWNER,
    customer_email: "buyer@example.test",
    items: [{ product_id: randomUUID(), name: "Everyday Tee", unit_price_kobo: 1200000, quantity: 2, cart_revision: randomUUID() }],
    total_kobo: 2400000,
    currency: "NGN",
    checkout_key: randomUUID(),
    payment_reference: `cs-${randomUUID().replaceAll("-", "")}`,
    authorization_url: "https://checkout.paystack.com/abc",
    payment_status: "pending",
    paid_at: null,
    email_status: "pending",
    email_attempt_at: null,
    email_attempt_id: null,
    mailgun_message_id: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// Sets what Paystack's verify endpoint returns for the next calls.
function providerReturns(order, data = {}, httpStatus = 200) {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify(
        httpStatus === 200
          ? { status: true, data: { status: "success", reference: order.payment_reference, amount: order.total_kobo, currency: "NGN", domain: "test", ...data } }
          : { status: false, message: "error" },
      ),
      { status: httpStatus },
    );
}

let order;
beforeEach(() => {
  order = makeOrder();
  globalThis.__orders = [order];
  globalThis.__finalizeCalls = 0;
  globalThis.__mailgun = { sent: [], mode: "accept", delay: 0 };
});

const confirm = (reference = order.payment_reference, options = { ownerUserId: OWNER }) =>
  confirmPayment(reference, options);

test("a verified, matching payment marks the order paid and sends one email", async () => {
  providerReturns(order);
  const result = await confirm();
  assert.equal(result.kind, "order");
  assert.equal(result.view.paymentStatus, "paid");
  assert.equal(result.view.emailStatus, "accepted");
  assert.equal(order.payment_status, "paid");
  assert.equal(globalThis.__mailgun.sent.length, 1);
  assert.equal(globalThis.__mailgun.sent[0].to, "buyer@example.test");
});

test("an unfinished payment stays pending and unpaid", async () => {
  providerReturns(order, { status: "abandoned" });
  const result = await confirm();
  assert.equal(result.view.paymentStatus, "pending");
  assert.equal(order.payment_status, "pending");
  assert.equal(globalThis.__finalizeCalls, 0);
  assert.equal(globalThis.__mailgun.sent.length, 0);
});

test("a failed payment is unsuccessful and never paid", async () => {
  providerReturns(order, { status: "failed" });
  const result = await confirm();
  assert.equal(result.view.paymentStatus, "unsuccessful");
  assert.equal(order.payment_status, "pending");
  assert.equal(globalThis.__mailgun.sent.length, 0);
});

for (const [label, data] of [
  ["wrong amount", { amount: 100 }],
  ["wrong currency", { currency: "USD" }],
  ["live payment in test mode", { domain: "live" }],
  ["different reference", { reference: "someone-elses-reference" }],
]) {
  test(`a successful response with ${label} is rejected`, async () => {
    providerReturns(order, data);
    const result = await confirm();
    assert.equal(result.view.paymentStatus, "unsuccessful");
    assert.equal(order.payment_status, "pending");
    assert.equal(globalThis.__finalizeCalls, 0);
    assert.equal(globalThis.__mailgun.sent.length, 0);
  });
}

test("an unknown reference at Paystack leaves the order pending", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ status: false }), { status: 404 });
  const result = await confirm();
  assert.equal(result.view.paymentStatus, "pending");
  assert.equal(order.payment_status, "pending");
});

test("a provider outage is reported as unavailable and changes nothing", async () => {
  providerReturns(order, {}, 500);
  assert.deepEqual(await confirm(), { kind: "unavailable" });
  assert.equal(order.payment_status, "pending");
});

test("another customer's order and unknown references are not found", async () => {
  providerReturns(order);
  assert.deepEqual(await confirm(order.payment_reference, { ownerUserId: randomUUID() }), { kind: "not_found" });
  assert.deepEqual(await confirm("cs-doesnotexist"), { kind: "not_found" });
  assert.equal(order.payment_status, "pending");
  assert.equal(globalThis.__mailgun.sent.length, 0);
});

test("concurrent and repeated confirmations send exactly one email", async () => {
  providerReturns(order);
  globalThis.__mailgun.delay = 25;
  const results = await Promise.all([confirm(), confirm(), confirm(undefined, {})]);
  assert.ok(results.every((r) => r.kind === "order"));
  await confirm();
  await confirm();
  assert.equal(globalThis.__mailgun.sent.length, 1);
  assert.equal(order.email_status, "accepted");
  assert.equal(globalThis.__orders.length, 1);
});

test("a rejected email keeps the order paid and a later confirmation retries it", async () => {
  providerReturns(order);
  globalThis.__mailgun.mode = "reject";
  const first = await confirm();
  assert.equal(first.view.paymentStatus, "paid");
  assert.equal(first.view.emailStatus, "failed");

  globalThis.__mailgun.mode = "accept";
  const second = await confirm();
  assert.equal(second.view.emailStatus, "accepted");
  assert.equal(globalThis.__mailgun.sent.length, 2);
});

test("an email timeout stays uncertain and is not resent automatically", async () => {
  providerReturns(order);
  globalThis.__mailgun.mode = "timeout";
  const first = await confirm();
  assert.equal(first.view.paymentStatus, "paid");
  assert.equal(first.view.emailStatus, "sending");

  globalThis.__mailgun.mode = "accept";
  await confirm();
  assert.equal(globalThis.__mailgun.sent.length, 1);
});

test("webhook signatures: only the exact body signed with the secret is accepted", () => {
  const body = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference: "cs-1" } }));
  const sign = (bytes, key = process.env.PAYSTACK_SECRET_KEY) =>
    createHmac("sha512", key).update(bytes).digest("hex");

  assert.equal(isValidWebhookSignature(body, sign(body)), true);
  assert.equal(isValidWebhookSignature(Buffer.from(`${body} `), sign(body)), false, "tampered body");
  assert.equal(isValidWebhookSignature(body, sign(body, "another-secret")), false, "wrong secret");
  assert.equal(isValidWebhookSignature(body, null), false, "missing header");
  assert.equal(isValidWebhookSignature(body, "not-hex"), false, "garbage header");
  assert.equal(isValidWebhookSignature(body, sign(body).slice(0, 20)), false, "truncated header");
});
