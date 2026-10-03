import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, test } from "node:test";
import { startDatabase } from "./local-postgres.mjs";

let db;
before(async () => { db = await startDatabase(); }, { timeout: 180_000 });
after(async () => { if (db) await db.stop(); }, { timeout: 30_000 });

const quoted = (value) => `'${String(value).replaceAll("'", "''")}'`;
const privileged = (sql) => db.as("service_role", null, sql);
const customer = (user, sql) => db.as("authenticated", user, sql);
const json = async (sql, run = db.sql) => JSON.parse(await run(sql));

async function user() {
  const id = randomUUID();
  await db.sql(`INSERT INTO auth.users (id,email) VALUES ('${id}','${id}@example.test')`);
  return id;
}

async function products(count = 1) {
  const ids = Array.from({ length: count }, () => randomUUID());
  await privileged(`INSERT INTO public.products (id,name,description,image_path,price_kobo,is_active) VALUES ${ids.map((id, index) => `('${id}','Product ${index}','Test product','/products/test.svg',${1000 + index},true)`).join(",")}`);
  return ids;
}

async function add(owner, product, quantity = 1) {
  return customer(owner, `INSERT INTO public.cart_items (user_id,product_id,quantity) VALUES ('${owner}','${product}',${quantity}) ON CONFLICT (user_id,product_id) DO UPDATE SET quantity = EXCLUDED.quantity`);
}

async function order(owner, key = randomUUID()) {
  return json(`SELECT row_to_json(created) FROM public.create_order_snapshot('${owner}','${owner}@example.test','${key}') AS created`, privileged);
}

async function finalize(created, overrides = {}) {
  const values = { ...created, ...overrides };
  return json(`SELECT row_to_json(finalized) FROM public.finalize_paid_order('${values.id}',${quoted(values.payment_reference)},${values.total_kobo},${quoted(values.currency)}) AS finalized`, privileged);
}

async function claim(id) {
  const result = await privileged(`SELECT row_to_json(claimed) FROM public.claim_order_email('${id}') AS claimed`);
  return result ? JSON.parse(result) : null;
}

async function complete(id, attempt, status, message = null) {
  const result = await privileged(`SELECT row_to_json(completed) FROM public.complete_order_email('${id}','${attempt}',${quoted(status)},${message === null ? "NULL" : quoted(message)}) AS completed`);
  return result ? JSON.parse(result) : null;
}

async function rejected(promise) {
  await assert.rejects(promise, /ERROR:/, "Expected PostgreSQL to reject the write");
}

test("seed is repeatable, preserves existing edits, and references six real images", async () => {
  const initial = await json("SELECT json_agg(p ORDER BY id) FROM public.products p");
  assert.equal(initial.length, 6);
  for (const product of initial) {
    assert.ok(product.price_kobo > 0);
    assert.ok(product.image_path.startsWith("/products/"));
    await access(path.join(db.root, "public", product.image_path));
  }
  const first = initial[0];
  await privileged(`UPDATE public.products SET name = 'Edited after seed', price_kobo = 12345 WHERE id = '${first.id}'`);
  await db.sql(await readFile(path.join(db.root, "supabase/seed.sql"), "utf8"));
  assert.equal(await db.sql("SELECT count(*) FROM public.products"), "6");
  assert.equal(await db.sql(`SELECT name || ':' || price_kobo FROM public.products WHERE id = '${first.id}'`), "Edited after seed:12345");
});

test("RLS exposes only active products and the customer's own cart and orders", async () => {
  const [alice, bob] = await Promise.all([user(), user()]);
  const [active, inactive] = await products(2);
  await privileged(`UPDATE public.products SET is_active = false WHERE id = '${inactive}'`);
  assert.equal(await db.as("anon", null, `SELECT count(*) FROM public.products WHERE id = '${inactive}'`), "0");
  assert.equal(await db.as("anon", null, `SELECT count(*) FROM public.products WHERE id = '${active}'`), "1");
  await add(alice, active, 2);
  await add(bob, active, 3);
  const created = await order(alice);
  assert.equal(await customer(bob, `SELECT count(*) FROM public.cart_items WHERE user_id = '${alice}'`), "0");
  assert.equal(await customer(bob, `SELECT count(*) FROM public.orders WHERE id = '${created.id}'`), "0");
  assert.equal(await customer(alice, `SELECT count(*) FROM public.orders WHERE id = '${created.id}'`), "1");
  await customer(bob, `UPDATE public.cart_items SET quantity = 9 WHERE user_id = '${alice}'`);
  await customer(bob, `DELETE FROM public.cart_items WHERE user_id = '${alice}'`);
  assert.equal(await customer(alice, `SELECT quantity FROM public.cart_items WHERE product_id = '${active}'`), "2");
  await rejected(customer(bob, `INSERT INTO public.cart_items (user_id,product_id,quantity) VALUES ('${alice}','${inactive}',1)`));
  await rejected(db.as("anon", null, `INSERT INTO public.cart_items (user_id,product_id,quantity) VALUES ('${alice}','${active}',1)`));
});

test("customers cannot write products, orders, payment/email states or call privileged functions", async () => {
  const owner = await user();
  const [product] = await products();
  await add(owner, product);
  const created = await order(owner);
  for (const sql of [
    `UPDATE public.products SET price_kobo = 1 WHERE id = '${product}'`,
    `DELETE FROM public.products WHERE id = '${product}'`,
    `INSERT INTO public.products (name,description,image_path,price_kobo) VALUES ('Free','Free','/free.svg',1)`,
    `INSERT INTO public.orders (user_id,customer_email,items,total_kobo,checkout_key) VALUES ('${owner}','a@example.test','[]',1,'${randomUUID()}')`,
    `UPDATE public.orders SET payment_status = 'paid', email_status = 'accepted' WHERE id = '${created.id}'`,
    `DELETE FROM public.orders WHERE id = '${created.id}'`,
    `SELECT public.create_order_snapshot('${owner}','a@example.test','${randomUUID()}')`,
    `SELECT public.finalize_paid_order('${created.id}','${created.payment_reference}',${created.total_kobo},'NGN')`,
    `SELECT public.claim_order_email('${created.id}')`,
    `SELECT public.complete_order_email('${created.id}','${randomUUID()}','accepted','fake-id')`,
  ]) await rejected(customer(owner, sql));
  await rejected(db.as("anon", null, `SELECT public.claim_order_email('${created.id}')`));
});

test("cart rejects invalid quantities/products and prevents owner/product/revision tampering", async () => {
  const [owner, other] = await Promise.all([user(), user()]);
  const [product, inactive, replacement] = await products(3);
  await privileged(`UPDATE public.products SET is_active = false WHERE id = '${inactive}'`);
  for (const quantity of [0, -1, 100, "NULL", "'1.5'"]) await rejected(add(owner, product, quantity));
  await rejected(add(owner, inactive));
  await rejected(add(owner, randomUUID()));
  await add(owner, product, 99);
  const first = await customer(owner, `SELECT revision FROM public.cart_items WHERE product_id = '${product}'`);
  await add(owner, product, 99);
  const next = await customer(owner, `SELECT revision FROM public.cart_items WHERE product_id = '${product}'`);
  assert.notEqual(first, next, "Even a same-quantity upsert rotates the revision");
  await rejected(customer(owner, `UPDATE public.cart_items SET user_id = '${other}' WHERE product_id = '${product}'`));
  await rejected(customer(owner, `UPDATE public.cart_items SET product_id = '${replacement}' WHERE product_id = '${product}'`));
  await rejected(customer(owner, `UPDATE public.cart_items SET revision = '${first}' WHERE product_id = '${product}'`));
  await rejected(customer(owner, `INSERT INTO public.cart_items (user_id,product_id,quantity,revision) VALUES ('${owner}','${replacement}',1,'${first}')`));
  await privileged(`UPDATE public.products SET is_active = false WHERE id = '${product}'`);
  await rejected(add(owner, product, 2));
  await customer(owner, `DELETE FROM public.cart_items WHERE product_id = '${product}'`);
});

test("cart cap is enforced across competing sessions and permits existing-item upserts at capacity", async () => {
  const owner = await user();
  const ids = await products(22);
  await customer(owner, `INSERT INTO public.cart_items (user_id,product_id,quantity) VALUES ${ids.slice(0, 19).map((id) => `('${owner}','${id}',1)`).join(",")}`);
  const outcomes = await Promise.allSettled([
    customer(owner, `INSERT INTO public.cart_items (user_id,product_id,quantity) VALUES ('${owner}','${ids[19]}',1); SELECT pg_sleep(0.4)`),
    add(owner, ids[20]),
  ]);
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((result) => result.status === "rejected").length, 1);
  assert.equal(await customer(owner, "SELECT count(*) FROM public.cart_items"), "20");
  await add(owner, ids[0], 5);
  assert.equal(await customer(owner, `SELECT quantity FROM public.cart_items WHERE product_id = '${ids[0]}'`), "5");
  await rejected(add(owner, ids[21]));

  const otherOwner = await user();
  await customer(otherOwner, `INSERT INTO public.cart_items (user_id,product_id,quantity) VALUES ${ids.slice(0, 19).map((id) => `('${otherOwner}','${id}',1)`).join(",")}`);
  await rejected(customer(otherOwner, `INSERT INTO public.cart_items (user_id,product_id,quantity) VALUES ('${otherOwner}','${ids[19]}',1),('${otherOwner}','${ids[20]}',1)`));
  assert.equal(await customer(otherOwner, "SELECT count(*) FROM public.cart_items"), "19", "A multirow overflow rolls back entirely");
});

test("checkout rejects empty/unavailable carts and derives immutable price snapshots from products", async () => {
  const owner = await user();
  await rejected(order(owner));
  const [product, second] = await products(2);
  await add(owner, product, 2);
  await add(owner, second, 3);
  await privileged(`UPDATE public.products SET is_active = false WHERE id = '${second}'`);
  await rejected(order(owner));
  await privileged(`UPDATE public.products SET is_active = true WHERE id = '${second}'`);
  const created = await order(owner);
  assert.equal(created.total_kobo, 1000 * 2 + 1001 * 3);
  assert.equal(created.currency, "NGN");
  assert.equal(created.payment_status, "pending");
  assert.equal(created.items.length, 2);
  assert.ok(created.payment_reference);
  for (const item of created.items) {
    assert.ok(item.cart_revision);
    assert.ok(item.name);
    assert.ok(item.unit_price_kobo > 0);
  }
  await privileged(`UPDATE public.products SET name = 'Changed', price_kobo = 99999 WHERE id = '${product}'`);
  const saved = await json(`SELECT row_to_json(o) FROM public.orders o WHERE id = '${created.id}'`);
  assert.deepEqual(saved.items, created.items);
  assert.equal(saved.total_kobo, created.total_kobo);
  await rejected(privileged(`INSERT INTO public.orders (user_id,customer_email,items,total_kobo,checkout_key,payment_reference) VALUES ('${owner}','${owner}@example.test',${quoted(JSON.stringify(created.items))},1,'${randomUUID()}','manual-${randomUUID()}')`));
  await rejected(privileged(`INSERT INTO public.orders (user_id,customer_email,items,total_kobo,checkout_key,payment_reference) VALUES ('${owner}','${owner}@example.test','[]',1,'${randomUUID()}','manual-${randomUUID()}')`));
  for (const assignment of [
    "total_kobo = 1",
    "items = '[]'::jsonb",
    `user_id = '${await user()}'`,
    "customer_email = 'changed@example.test'",
    `checkout_key = '${randomUUID()}'`,
    "payment_reference = 'replaced-reference'",
    "currency = 'USD'",
  ]) await rejected(privileged(`UPDATE public.orders SET ${assignment} WHERE id = '${created.id}'`));
});

test("simultaneous checkout retries return one order, including after the cart changes or empties", async () => {
  const owner = await user();
  const [product] = await products();
  const key = randomUUID();
  await add(owner, product, 2);
  const results = await Promise.all(Array.from({ length: 5 }, () => order(owner, key)));
  assert.equal(new Set(results.map((result) => result.id)).size, 1);
  assert.equal(new Set(results.map((result) => result.payment_reference)).size, 1);
  await add(owner, product, 9);
  assert.deepEqual((await order(owner, key)).items, results[0].items);
  await customer(owner, "DELETE FROM public.cart_items");
  assert.equal((await order(owner, key)).id, results[0].id);
  assert.equal(await db.sql(`SELECT count(*) FROM public.orders WHERE user_id = '${owner}' AND checkout_key = '${key}'`), "1");
});

test("payment finalization rejects tampering and concurrent duplicates clear unchanged cart rows once", async () => {
  const owner = await user();
  const [product] = await products();
  await add(owner, product, 2);
  const created = await order(owner);
  for (const overrides of [{ total_kobo: 1 }, { currency: "USD" }, { payment_reference: "forged-reference" }]) {
    await rejected(finalize(created, overrides));
    assert.equal(await db.sql(`SELECT payment_status FROM public.orders WHERE id = '${created.id}'`), "pending");
    assert.equal(await customer(owner, "SELECT count(*) FROM public.cart_items"), "1");
  }
  const results = await Promise.all(Array.from({ length: 4 }, () => finalize(created)));
  assert.ok(results.every((result) => result.payment_status === "paid" && result.paid_at));
  assert.equal(new Set(results.map((result) => result.paid_at)).size, 1);
  assert.equal(await customer(owner, "SELECT count(*) FROM public.cart_items"), "0");
  await add(owner, product, 7);
  await finalize(created);
  assert.equal(await customer(owner, "SELECT quantity FROM public.cart_items"), "7");
  await rejected(finalize(created, { total_kobo: 1 }));
  await rejected(privileged(`UPDATE public.orders SET payment_status = 'pending', paid_at = NULL WHERE id = '${created.id}'`));
});

test("confirmation preserves changed and deleted/re-added rows and newly added products", async () => {
  const owner = await user();
  const [unchanged, edited, readded, added] = await products(4);
  for (const product of [unchanged, edited, readded]) await add(owner, product);
  const created = await order(owner);
  await add(owner, edited, 2);
  await customer(owner, `DELETE FROM public.cart_items WHERE product_id = '${readded}'`);
  await add(owner, readded);
  await add(owner, added);
  await finalize(created);
  const remaining = await json("SELECT json_agg(product_id ORDER BY product_id) FROM public.cart_items", (sql) => customer(owner, sql));
  assert.deepEqual(remaining, [edited, readded, added].sort());
});

test("cart edits committing during confirmation retain their newer revision", async () => {
  const owner = await user();
  const [product] = await products();
  await add(owner, product);
  const created = await order(owner);
  // The updater holds its row lock until pg_sleep completes, forcing the
  // confirmation DELETE to recheck revision after the concurrent commit.
  const updating = customer(owner, `UPDATE public.cart_items SET quantity = 4 WHERE product_id = '${product}'; SELECT pg_sleep(2.5)`);
  // Observe an actual active sleeping session before starting confirmation.
  let updateHasLock = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    const active = await db.sql("SELECT count(*) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND state = 'active' AND wait_event = 'PgSleep'");
    if (Number(active) > 0) { updateHasLock = true; break; }
  }
  assert.ok(updateHasLock, "The competing cart update should be holding its row lock");
  await Promise.all([updating, finalize(created)]);
  assert.equal(await customer(owner, "SELECT quantity FROM public.cart_items"), "4");
});

test("email claim is paid-only, has one concurrent winner, and never retries uncertain/accepted sends", async () => {
  const owner = await user();
  const [product] = await products();
  await add(owner, product);
  const created = await order(owner);
  assert.equal(await claim(created.id), null);
  await finalize(created);
  const attempts = await Promise.all(Array.from({ length: 6 }, () => claim(created.id)));
  const winners = attempts.filter(Boolean);
  assert.equal(winners.length, 1);
  const attempt = winners[0];
  assert.equal(attempt.email_status, "sending");
  assert.ok(attempt.email_attempt_id);
  assert.ok(attempt.email_attempt_at);
  assert.equal(await claim(created.id), null, "Uncertain sends stay claimed");
  assert.equal(await complete(created.id, randomUUID(), "accepted", "wrong-attempt"), null);
  const accepted = await complete(created.id, attempt.email_attempt_id, "accepted", "<test@example.test>");
  assert.equal(accepted.email_status, "accepted");
  assert.equal(accepted.mailgun_message_id, "<test@example.test>");
  assert.equal(await claim(created.id), null);
  assert.equal(await complete(created.id, attempt.email_attempt_id, "failed"), null);
});

test("definite email failure permits a new attempt and a stale completion cannot override it", async () => {
  const owner = await user();
  const [product] = await products();
  await add(owner, product);
  const created = await order(owner);
  await finalize(created);
  const first = await claim(created.id);
  await rejected(complete(created.id, first.email_attempt_id, "pending"));
  await rejected(complete(created.id, first.email_attempt_id, "accepted"));
  const failed = await complete(created.id, first.email_attempt_id, "failed");
  assert.equal(failed.payment_status, "paid");
  assert.equal(failed.email_status, "failed");
  const second = await claim(created.id);
  assert.notEqual(second.email_attempt_id, first.email_attempt_id);
  assert.equal(await complete(created.id, first.email_attempt_id, "accepted", "stale-id"), null);
  const accepted = await complete(created.id, second.email_attempt_id, "accepted", "current-id");
  assert.equal(accepted.mailgun_message_id, "current-id");
});

test("delivery snapshots are validated, immutable, private and consistent across checkout retries", async () => {
  const owner = await user();
  const stranger = await user();
  const [product] = await products();
  await add(owner, product, 2);
  const key = randomUUID();
  const delivery = { recipientName: "Demo Customer", phone: "+2348012345678", address: "12 Demo Street", city: "Ikeja", state: "Lagos" };
  const create = (details, checkoutKey = key, run = privileged) => json(`SELECT row_to_json(created) FROM public.create_order_snapshot('${owner}','demo@example.test','${checkoutKey}',${quoted(JSON.stringify(details))}::jsonb) created`, run);
  for (const invalid of [null, {}, { ...delivery, phone: "123" }, { ...delivery, address: " " }, { ...delivery, city: "x".repeat(101) }, { ...delivery, extra: "field" }]) {
    await rejected(create(invalid));
  }
  const created = await create(delivery);
  assert.deepEqual(created.delivery_details, delivery);
  assert.equal((await create(delivery)).id, created.id);
  await rejected(create({ ...delivery, city: "Abuja" }));
  await rejected(privileged(`UPDATE public.orders SET delivery_details = NULL WHERE id = '${created.id}'`));
  await rejected(customer(owner, `UPDATE public.orders SET delivery_details = '{}' WHERE id = '${created.id}'`));
  assert.equal(await customer(stranger, `SELECT count(*) FROM public.orders WHERE id = '${created.id}'`), "0");
  await rejected(create(delivery, randomUUID(), sql => customer(owner, sql)));
  const paid = await finalize(created);
  assert.deepEqual(paid.delivery_details, delivery);
});

test("cart sync revisions signal inserts, edits, removals and payment cleanup privately", async () => {
  const owner = await user(), stranger = await user();
  const [product] = await products();
  const revision = () => customer(owner, `SELECT revision FROM public.cart_sync WHERE user_id = '${owner}'`);
  await add(owner, product, 1);
  const inserted = await revision();
  assert.match(inserted, /^[a-f0-9-]{36}$/);
  await add(owner, product, 2);
  const edited = await revision();
  assert.notEqual(edited, inserted);
  assert.equal(await customer(stranger, `SELECT count(*) FROM public.cart_sync WHERE user_id = '${owner}'`), "0");
  await rejected(customer(owner, `UPDATE public.cart_sync SET revision = gen_random_uuid() WHERE user_id = '${owner}'`));
  await rejected(db.as("anon", null, "SELECT * FROM public.cart_sync"));
  await customer(owner, `DELETE FROM public.cart_items WHERE user_id = '${owner}'`);
  const removed = await revision();
  assert.notEqual(removed, edited);
  await add(owner, product, 1);
  const created = await order(owner);
  const beforePayment = await revision();
  await finalize(created);
  assert.notEqual(await revision(), beforePayment);
});
