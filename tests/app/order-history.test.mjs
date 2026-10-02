import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { parseDelivery, deliverySchema } from "../../src/lib/delivery.ts";
import { parseOrderItems } from "../../src/lib/order-items.ts";

const require = createRequire(import.meta.url);
function load(path, mocks) {
  const source = readFileSync(new URL(`../../src/${path}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const compiled = { exports: {} };
  new Function("require", "module", "exports", outputText)((id) => {
    if (id in mocks) return mocks[id];
    if (id === "server-only" || id.endsWith(".css")) return {};
    if (id === "next/link") return { __esModule: true, default: ({ children, ...props }) => require("react").createElement("a", props, children) };
    return require(id);
  }, compiled, compiled.exports);
  return compiled.exports;
}

test("history query filters the verified owner, requests one extra row and propagates failures", async () => {
  const calls = [];
  let error = null;
  const query = Object.fromEntries(["select", "eq", "order"].map(name => [name, (...args) => { calls.push([name, ...args]); return query; }]));
  query.range = async (...args) => { calls.push(["range", ...args]); return { data: Array.from({ length: 11 }, (_, id) => ({ id })), error }; };
  const { getOrderHistory } = load("lib/order-history.ts", { "@/lib/supabase/server": { createClient: async () => ({ from: () => query }) } });
  const result = await getOrderHistory("verified-owner", 2);
  assert.equal(result.orders.length, 10);
  assert.equal(result.hasNext, true);
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(["eq", "user_id", "verified-owner"])));
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(["range", 10, 20])));
  error = new Error("unavailable");
  await assert.rejects(getOrderHistory("verified-owner", 1), /unavailable/);
});

test("order history handles sign-in, empty, failure, legacy and pending orders", async () => {
  let user = null, fail = false, orders = [], reads = 0;
  const summary = load("components/delivery-summary.tsx", { "@/lib/delivery": { deliveryLines: d => [d.recipientName, d.phone, d.address, d.city, d.state] } });
  const { default: Page } = load("app/orders/page.tsx", {
    "@/lib/auth": { getCurrentUser: async () => user },
    "@/lib/order-history": { getOrderHistory: async (id) => { reads++; assert.equal(id, "owner"); if (fail) throw new Error(); return { orders, hasNext: false }; } },
    "@/lib/delivery": { parseDelivery }, "@/lib/order-items": { parseOrderItems },
    "@/lib/money": { formatKobo: n => `NGN ${n / 100}` }, "@/components/delivery-summary": summary,
  });
  const render = async () => renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
  assert.match(await render(), /Sign in to see your orders/);
  assert.equal(reads, 0);
  user = { id: "owner" };
  assert.match(await render(), /No orders yet/);
  fail = true;
  assert.match(await render(), /Orders are unavailable/);
  fail = false;
  orders = [{ id: "12345678-demo", payment_status: "pending", payment_reference: "cs-demo", created_at: "2026-10-03T10:00:00Z", items: [{ name: "Demo item", quantity: 2, unit_price_kobo: 500 }], total_kobo: 1000, delivery_details: null }];
  const html = await render();
  assert.match(html, /Payment not confirmed/);
  assert.match(html, /Check payment status/);
  assert.match(html, /No delivery details were recorded/);
  assert.match(html, /Demo item/);
  assert.match(html, /NGN 10/);
});

test("delivery form submits validated details, retains retry identity on failure and keeps personal details out of storage", async () => {
  const original = { fetch: globalThis.fetch, FormData: globalThis.FormData, sessionStorage: globalThis.sessionStorage };
  const values = { recipientName: "Demo Customer", phone: "08012345678", address: "12 Demo Street", city: "Ikeja", state: "Lagos" };
  const storage = new Map();
  const states = [];
  let requests = [];
  globalThis.FormData = class { entries() { return Object.entries(values); } };
  globalThis.sessionStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  globalThis.fetch = async (url, init) => { requests.push(JSON.parse(init.body)); return new Response(JSON.stringify({ error: "Provider unavailable" }), { status: 502 }); };
  let stateIndex = 0;
  const { PayButton } = load("components/pay-button.tsx", {
    react: { useState: initial => { const index = stateIndex++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = value; }]; } },
    "next/navigation": { useRouter: () => ({ push() {} }) }, "@/lib/delivery": { deliverySchema },
  });
  const render = () => { stateIndex = 0; return PayButton({ cartSignature: "cart" }); };
  try {
    assert.match(renderToStaticMarkup(render()), /autocomplete="street-address"/i);
    const submit = () => render().props.onSubmit({ preventDefault() {}, currentTarget: {} });
    await submit();
    await submit();
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0].delivery, values);
    assert.equal(requests[0].checkoutKey, requests[1].checkoutKey);
    assert.equal(states[0], false);
    assert.equal(states[1], "Provider unavailable");
    for (const value of storage.values()) { assert.doesNotMatch(value, /Demo Customer|08012345678|Demo Street|Ikeja|Lagos/); }
    values.city = "Abuja";
    await submit();
    assert.notEqual(requests[2].checkoutKey, requests[0].checkoutKey);
    values.phone = "123";
    await submit();
    assert.equal(requests.length, 3);
  } finally { Object.assign(globalThis, original); }
});
