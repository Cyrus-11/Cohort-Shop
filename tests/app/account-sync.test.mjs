import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);

// Exercise the real components with controlled router, hooks and browser events.
// No Supabase sessions, customer writes, payments or emails are involved.
function loadComponent(name, mocks) {
  const source = readFileSync(new URL(`../../src/components/${name}.tsx`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const compiled = { exports: {} };
  const resolve = (id) => {
    if (id in mocks) return mocks[id];
    if (id.endsWith(".css")) return {};
    if (id === "next/image" || id === "next/link") {
      return { __esModule: true, default: ({ children }) => children ?? null };
    }
    if (id === "@/lib/money") return { formatKobo: (value) => `NGN ${value / 100}` };
    return require(id);
  };
  new Function("require", "module", "exports", outputText)(resolve, compiled, compiled.exports);
  return compiled.exports;
}

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name, listener) {
      if (listeners.get(name) === listener) listeners.delete(name);
    },
    emit(name) { listeners.get(name)?.(); },
    listeners,
  };
}

test("account sync refreshes visible online pages and cleans up listeners/timer", () => {
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"),
  };
  let tick, interval, cleared, cleanup, refreshes = 0, pending = false;
  const browser = {
    ...eventTarget(),
    setInterval(callback, delay) { tick = callback; interval = delay; return 7; },
    clearInterval(id) { cleared = id; },
  };
  const document = { ...eventTarget(), visibilityState: "visible" };
  const navigator = { onLine: true };
  globalThis.window = browser;
  globalThis.document = document;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: navigator });
  try {
    const { AccountSync } = loadComponent("account-sync", {
      react: {
        useEffect(effect) { cleanup = effect(); },
        useRef(value) { return { current: value }; },
        useTransition() { return [pending, (action) => action()]; },
      },
      "@/lib/supabase/browser": { createClient: () => ({}) },
      "@/lib/cart-sync": { subscribeToCart: () => () => {} },
      "next/navigation": { useRouter: () => ({ refresh() { refreshes++; } }) },
    });
    AccountSync({ userId: "owner" });
    assert.equal(interval, 10_000);
    tick();
    browser.emit("focus");
    assert.equal(refreshes, 2);
    document.visibilityState = "hidden";
    tick();
    browser.emit("focus");
    assert.equal(refreshes, 2, "Background devices do not poll");
    document.visibilityState = "visible";
    navigator.onLine = false;
    tick();
    assert.equal(refreshes, 2, "Offline devices do not poll");
    navigator.onLine = true;
    browser.emit("online");
    document.emit("visibilitychange");
    assert.equal(refreshes, 4);
    cleanup();
    assert.equal(cleared, 7);
    assert.equal(browser.listeners.size, 0);
    assert.equal(document.listeners.size, 0);
    pending = true;
    AccountSync({ userId: "owner" });
    tick();
    browser.emit("focus");
    assert.equal(refreshes, 4, "An unfinished refresh is not started again");
    cleanup();
  } finally {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    if (previous.navigator) Object.defineProperty(globalThis, "navigator", previous.navigator);
    else delete globalThis.navigator;
  }
});

test("refreshed server cart replaces quantities/totals and can become empty without remounting", () => {
  // These hooks preserve client state between renders, as router.refresh does.
  const state = [];
  let cursor = 0;
  const { CartView } = loadComponent("cart-view", {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value) => { state[index] = value; }];
      },
      useTransition: () => [false, (action) => action()],
    },
    "next/navigation": { useRouter: () => ({ refresh() {}, push() {} }) },
  });
  function render(quantity) {
    cursor = 0;
    return renderToStaticMarkup(CartView({ initialCart: {
      items: quantity ? [{ productId: "tee", name: "Tee", imagePath: "/tee.jpg",
        quantity, unitPriceKobo: 10000, lineTotalKobo: quantity * 10000 }] : [],
      count: quantity, totalKobo: quantity * 10000,
    } }));
  }
  assert.match(render(1), />1<\/output>/);
  const updated = render(4);
  assert.match(updated, />4<\/output>/);
  assert.match(updated, /NGN 400/);
  assert.match(render(0), /Your cart is empty/);
});

test("product button uses refreshed quantity instead of its original mounted quantity", () => {
  const state = [];
  let cursor = 0;
  const { AddToCartButton } = loadComponent("add-to-cart-button", {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value) => { state[index] = value; }];
      },
      useTransition: () => [false, (action) => action()],
    },
    "next/navigation": { useRouter: () => ({ refresh() {}, push() {} }) },
  });
  function render(quantity) {
    cursor = 0;
    return renderToStaticMarkup(AddToCartButton({ productId: "tee", productName: "Tee", initialQuantity: quantity }));
  }
  assert.doesNotMatch(render(0), /disabled=""/);
  assert.match(render(99), /disabled=""/);
  assert.doesNotMatch(render(2), /disabled=""/);
});
