import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path, mocks) {
  const source = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const compiled = { exports: {} };
  new Function("require", "module", "exports", outputText)(id => id in mocks ? mocks[id] : require(id), compiled, compiled.exports);
  return compiled.exports;
}

test("native API tokens are verified, never fall back to cookies, and keep cookie CSRF protection", async () => {
  let cookieReads = 0, verified = [], tokenHeaders = null;
  const cookieClient = { kind: "cookie" };
  const tokenClient = { auth: { getUser: async token => { verified.push(token); return token === "valid" ? { data: { user: { id: "verified-owner", email: "demo@example.test" } }, error: null } : { data: { user: null }, error: new Error("invalid") }; } } };
  const { getApiSession, isAllowedApiWrite } = load("src/lib/api-session.ts", {
    "server-only": {},
    "@supabase/supabase-js": { createClient: (_url, _key, options) => { tokenHeaders = options.global.headers; return tokenClient; } },
    "@/lib/auth": { getCurrentUser: async () => { cookieReads++; return { id: "cookie-owner", email: "cookie@example.test" }; }, isSameOrigin: req => req.headers.get("origin") === "https://shop.example.test" },
    "@/lib/env/client": { getPublicEnv: () => ({ NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key" }) },
    "@/lib/supabase/server": { createClient: async () => cookieClient },
  });
  const request = headers => new Request("https://shop.example.test/api/cart", { headers });
  const native = await getApiSession(request({ Authorization: "Bearer valid" }));
  assert.equal(native.user.id, "verified-owner");
  assert.equal(native.client, tokenClient);
  assert.equal(tokenHeaders.Authorization, "Bearer valid");
  assert.equal(cookieReads, 0);
  for (const authorization of ["Bearer forged", "Basic valid", "Bearer", "Bearer token extra", ""]) assert.equal(await getApiSession(request({ Authorization: authorization })), null);
  assert.equal(cookieReads, 0);
  assert.deepEqual(verified, ["valid", "forged"]);
  assert.equal((await getApiSession(request({}))).user.id, "cookie-owner");
  assert.equal(isAllowedApiWrite(request({})), false);
  assert.equal(isAllowedApiWrite(request({ Origin: "https://evil.example.test" })), false);
  assert.equal(isAllowedApiWrite(request({ Origin: "https://shop.example.test" })), true);
  assert.equal(isAllowedApiWrite(request({ Authorization: "Bearer forged" })), true, "Bearer writes still require getApiSession verification");
});

test("cart signals subscribe only to owner-filtered INSERT/UPDATE, reload on recovery, and clean up", () => {
  const { subscribeToCart } = load("src/lib/cart-sync.ts", {});
  const handlers = [];
  let subscription, refreshed = 0, removed = 0, status;
  const channel = { on: (_type, filter, handler) => { handlers.push({ filter, handler }); return channel; }, subscribe: handler => { subscription = handler; return channel; } };
  const client = { channel: topic => { assert.equal(topic, "cart-sync:owner"); return channel; }, removeChannel: target => { assert.equal(target, channel); removed++; } };
  const cleanup = subscribeToCart(client, "owner", () => refreshed++, value => { status = value; });
  assert.deepEqual(handlers.map(item => item.filter.event), ["INSERT", "UPDATE"]);
  for (const { filter, handler } of handlers) { assert.equal(filter.filter, "user_id=eq.owner"); assert.equal(filter.table, "cart_sync"); handler(); }
  subscription("SUBSCRIBED"); assert.equal(status, true);
  subscription("CHANNEL_ERROR"); assert.equal(status, false);
  subscription("SUBSCRIBED"); assert.equal(refreshed, 4);
  cleanup(); assert.equal(removed, 1);
});

test("mobile OAuth accepts only the app callback with a PKCE code and exchanges duplicate callbacks once", async () => {
  let calls = 0;
  const { authCodeFromUrl, completeSignIn } = load("mobile/src/auth.ts", {
    "expo-web-browser": {}, "./supabase": { supabase: { auth: { exchangeCodeForSession: async code => { assert.equal(code, "demo-code"); calls++; return { error: null }; } } } },
  });
  for (const url of ["https://evil.example.test/?code=demo-code", "cohortshop://evil/callback?code=demo-code", "cohortshop://auth/callback#access_token=forged"]) assert.equal(authCodeFromUrl(url), null);
  const callback = "cohortshop://auth/callback?code=demo-code";
  await Promise.all([completeSignIn(callback), completeSignIn(callback)]);
  await completeSignIn(callback);
  assert.equal(calls, 1);
});

test("shared private endpoints reject unsigned sessions; checkout rejects browser totals and passes server identity", async () => {
  let session = null, started = [];
  const apiMocks = {
    "next/server": require("next/server.js"),
    "@/lib/api-session": { getApiSession: async () => session, isAllowedApiWrite: () => true },
    "@/lib/cart": { getCart: async (_client, userId) => ({ items: [], totalKobo: 0, count: 0, userId }) },
    "@/lib/orders": { startCheckout: async (...args) => { started.push(args); return { ok: true, orderId: "order", reference: "ref", paymentStatus: "pending", authorizationUrl: "https://checkout.paystack.com/demo" }; } },
    "@/lib/delivery": require("../../src/lib/delivery.ts"),
    "@/lib/payments": { confirmPayment: async () => ({ kind: "not_found" }) },
    "@/lib/order-history": { getOrderHistory: async () => ({ orders: [], hasNext: false }) },
  };
  const cart = load("src/app/api/cart/route.ts", apiMocks);
  const checkout = load("src/app/api/checkout/route.ts", apiMocks);
  const payments = load("src/app/api/payments/verify/route.ts", apiMocks);
  const orders = load("src/app/api/orders/route.ts", apiMocks);
  const get = new Request("https://shop.example.test/api/cart");
  const post = payload => new Request("https://shop.example.test/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  for (const response of [await cart.GET(get), await orders.GET(get), await checkout.POST(post({})), await payments.POST(post({}))]) assert.equal(response.status, 401);
  session = { user: { id: "verified-owner", email: "demo@example.test" }, client: {} };
  assert.equal((await (await cart.GET(get)).json()).userId, "verified-owner");
  assert.equal((await cart.PUT(post({ productId: "not-a-uuid", quantity: 0 }))).status, 400);
  const payload = { checkoutKey: "b735d2ea-c05c-40a4-b89b-63e322f26410", delivery: { recipientName: "Demo Customer", phone: "08012345678", address: "12 Demo Street", city: "Ikeja", state: "Lagos" } };
  assert.equal((await checkout.POST(post({ ...payload, totalKobo: 1 }))).status, 400);
  assert.equal((await checkout.POST(post(payload))).status, 200);
  assert.equal(started[0][0].id, "verified-owner");
  assert.deepEqual(started[0][2], payload.delivery);
  assert.equal((await payments.POST(post({ reference: "another-order" }))).status, 404);
});
