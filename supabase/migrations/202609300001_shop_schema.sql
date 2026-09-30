-- Keep schema, grants and RLS in the same transaction: no exposed unprotected tables.
begin;

create schema if not exists shop_private;
revoke all on schema shop_private from public, anon, authenticated;
grant usage on schema shop_private to service_role;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  description text not null check (length(btrim(description)) > 0),
  image_path text not null check (image_path like '/products/%'),
  price_kobo integer not null check (price_kobo > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.cart_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 99),
  revision uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index cart_items_product_id_idx on public.cart_items(product_id);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  customer_email text not null check (length(btrim(customer_email)) > 0),
  items jsonb not null,
  total_kobo bigint not null check (total_kobo between 1 and 9007199254740991),
  currency text not null default 'NGN' check (currency = 'NGN'),
  checkout_key uuid not null,
  payment_reference text not null unique check (payment_reference ~ '^[A-Za-z0-9.-]+$'),
  authorization_url text check (authorization_url is null or authorization_url like 'https://%'),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid')),
  paid_at timestamptz,
  email_status text not null default 'pending' check (email_status in ('pending', 'sending', 'accepted', 'failed')),
  email_attempt_at timestamptz,
  email_attempt_id uuid,
  mailgun_message_id text,
  created_at timestamptz not null default now(),
  unique (user_id, checkout_key),
  check ((payment_status = 'paid') = (paid_at is not null)),
  check (payment_status = 'paid' or email_status = 'pending'),
  check (
    (email_status = 'pending' and email_attempt_at is null and email_attempt_id is null)
    or (email_status <> 'pending' and email_attempt_at is not null and email_attempt_id is not null)
  ),
  check (
    (email_status = 'accepted' and mailgun_message_id is not null and length(btrim(mailgun_message_id)) > 0)
    or (email_status <> 'accepted' and mailgun_message_id is null)
  )
);
create index orders_user_created_idx on public.orders(user_id, created_at desc);

alter table public.products enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;

revoke all on public.products, public.cart_items, public.orders from public, anon, authenticated, service_role;
grant select on public.products to anon, authenticated;
grant select, delete on public.cart_items to authenticated;
-- Revisions/timestamps are database-owned. Key columns are allowed for UPSERT;
-- the trigger rejects reassignment of an existing row's identity.
grant insert (user_id, product_id, quantity), update (user_id, product_id, quantity)
  on public.cart_items to authenticated;
grant select on public.orders to authenticated;
grant select, insert, update, delete on public.products, public.cart_items, public.orders to service_role;

create policy products_active_read on public.products for select to anon, authenticated
  using (is_active);
create policy cart_owner_read on public.cart_items for select to authenticated
  using ((select auth.uid()) = user_id);
create policy cart_owner_insert on public.cart_items for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy cart_owner_update on public.cart_items for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy cart_owner_delete on public.cart_items for delete to authenticated
  using ((select auth.uid()) = user_id);
create policy orders_owner_read on public.orders for select to authenticated
  using ((select auth.uid()) = user_id);

create function shop_private.guard_cart_item()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and
      (new.user_id is distinct from old.user_id or new.product_id is distinct from old.product_id) then
    raise exception using errcode = '23514', message = 'Cart item owner and product are immutable.';
  end if;
  if not exists (select 1 from public.products where id = new.product_id and is_active) then
    raise exception using errcode = '23514', message = 'Product is unavailable.';
  end if;
  if tg_op = 'INSERT' then
    -- A lock followed by a fresh count requires READ COMMITTED. A stale repeatable
    -- read snapshot would permit overflow; fail explicitly in unsupported isolation.
    if current_setting('transaction_isolation') <> 'read committed' then
      raise exception using errcode = '0A000', message = 'Cart inserts require READ COMMITTED.';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('shop:cart:' || new.user_id::text, 0));
    if not exists (select 1 from public.cart_items where user_id = new.user_id and product_id = new.product_id)
       and (select count(*) from public.cart_items where user_id = new.user_id) >= 20 then
      raise exception using errcode = '23514', message = 'A cart may contain at most 20 products.';
    end if;
  end if;
  -- Do not acquire a user lock on UPDATE/DELETE: tuple locks are acquired first,
  -- which could invert the lock order against an INSERT ... ON CONFLICT.
  new.revision := gen_random_uuid();
  return new;
end;
$$;
revoke all on function shop_private.guard_cart_item() from public, anon, authenticated;
create trigger cart_item_guard before insert or update on public.cart_items
  for each row execute function shop_private.guard_cart_item();

create function shop_private.guard_order()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  item jsonb;
  product_ids uuid[] := '{}';
  item_product_id uuid;
  computed_total numeric := 0;
begin
  if tg_op = 'INSERT' then
    if new.payment_status <> 'pending' or new.email_status <> 'pending' then
      raise exception using errcode = '23514', message = 'Orders must start unpaid with a pending email.';
    end if;
    if jsonb_typeof(new.items) is distinct from 'array' then
      raise exception using errcode = '23514', message = 'Order items must be an array.';
    end if;
    if jsonb_array_length(new.items) not between 1 and 20 then
      raise exception using errcode = '23514', message = 'Order must contain 1 to 20 items.';
    end if;
    for item in select value from jsonb_array_elements(new.items) loop
      if jsonb_typeof(item) is distinct from 'object'
        or jsonb_typeof(item->'product_id') is distinct from 'string'
        or jsonb_typeof(item->'name') is distinct from 'string'
        or coalesce(length(btrim(item->>'name')), 0) = 0
        or jsonb_typeof(item->'cart_revision') is distinct from 'string'
        or jsonb_typeof(item->'unit_price_kobo') is distinct from 'number'
        or jsonb_typeof(item->'quantity') is distinct from 'number'
        or coalesce(item->>'unit_price_kobo', '') !~ '^[0-9]+$'
        or coalesce(item->>'quantity', '') !~ '^[0-9]+$' then
        raise exception using errcode = '23514', message = 'Invalid order item snapshot.';
      end if;
      item_product_id := (item->>'product_id')::uuid;
      perform (item->>'cart_revision')::uuid;
      if item_product_id = any(product_ids)
        or (item->>'unit_price_kobo')::numeric not between 1 and 2147483647
        or (item->>'quantity')::numeric not between 1 and 99 then
        raise exception using errcode = '23514', message = 'Invalid order item values.';
      end if;
      product_ids := array_append(product_ids, item_product_id);
      computed_total := computed_total + (item->>'unit_price_kobo')::numeric * (item->>'quantity')::numeric;
    end loop;
    if computed_total is distinct from new.total_kobo::numeric then
      raise exception using errcode = '23514', message = 'Order total does not match snapshot.';
    end if;
  else
    if row(new.id, new.user_id, new.customer_email, new.items, new.total_kobo,
           new.currency, new.checkout_key, new.payment_reference, new.created_at)
       is distinct from
       row(old.id, old.user_id, old.customer_email, old.items, old.total_kobo,
           old.currency, old.checkout_key, old.payment_reference, old.created_at) then
      raise exception using errcode = '23514', message = 'Order snapshot and identity are immutable.';
    end if;
    if old.payment_status = 'paid' and
        row(new.payment_status, new.paid_at) is distinct from row(old.payment_status, old.paid_at) then
      raise exception using errcode = '23514', message = 'A paid order cannot be reverted or redated.';
    end if;
    if new.email_status = old.email_status then
      if row(new.email_attempt_id, new.email_attempt_at, new.mailgun_message_id)
         is distinct from row(old.email_attempt_id, old.email_attempt_at, old.mailgun_message_id) then
        raise exception using errcode = '23514', message = 'Email metadata requires a state transition.';
      end if;
    elsif old.email_status in ('pending', 'failed') and new.email_status = 'sending' then
      if new.payment_status <> 'paid' or new.email_attempt_id is null
         or new.email_attempt_id is not distinct from old.email_attempt_id then
        raise exception using errcode = '23514', message = 'A paid order and a new email attempt are required.';
      end if;
    elsif old.email_status = 'sending' and new.email_status in ('accepted', 'failed') then
      if row(new.email_attempt_id, new.email_attempt_at)
         is distinct from row(old.email_attempt_id, old.email_attempt_at) then
        raise exception using errcode = '23514', message = 'Email completion must preserve its attempt.';
      end if;
    else
      raise exception using errcode = '23514', message = 'Invalid email state transition.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function shop_private.guard_order() from public, anon, authenticated;
create trigger order_guard before insert or update on public.orders
  for each row execute function shop_private.guard_order();

commit;
