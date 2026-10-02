begin;
alter table public.orders add column delivery_details jsonb;
create function shop_private.valid_delivery(details jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    jsonb_typeof(details) = 'object'
    and (select count(*) from jsonb_object_keys(case when jsonb_typeof(details) = 'object' then details else '{}'::jsonb end)) = 5
    and not exists (
      select 1 from (values ('recipientName',100),('address',250),('city',100),('state',100)) fields(key, maximum)
      where jsonb_typeof(details->key) is distinct from 'string'
        or length(btrim(details->>key)) not between 2 and maximum
        or details->>key ~ '[[:cntrl:]]'
    )
    and jsonb_typeof(details->'phone') = 'string'
    and details->>'phone' ~ '^\+?[0-9 ()-]{7,25}$'
    and length(regexp_replace(details->>'phone', '[^0-9]', '', 'g')) between 10 and 15
  , false);
$$;
revoke all on function shop_private.valid_delivery(jsonb) from public, anon, authenticated;
grant execute on function shop_private.valid_delivery(jsonb) to service_role;
alter table public.orders add constraint orders_valid_delivery check (delivery_details is null or shop_private.valid_delivery(delivery_details));
create function shop_private.guard_delivery_snapshot()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.delivery_details is distinct from old.delivery_details then
    raise exception using errcode = '23514', message = 'Delivery snapshot is immutable.';
  end if;
  return new;
end;
$$;
revoke all on function shop_private.guard_delivery_snapshot() from public, anon, authenticated;
create trigger delivery_snapshot_guard before update on public.orders
for each row execute function shop_private.guard_delivery_snapshot();
create function public.create_order_snapshot(
  p_user_id uuid,
  p_customer_email text,
  p_checkout_key uuid,
  p_delivery_details jsonb
)
returns public.orders language plpgsql security invoker set search_path = '' as $$
declare
  result public.orders;
  snapshot jsonb;
  item_count integer;
  all_active boolean;
  amount bigint;
begin
  if not shop_private.valid_delivery(p_delivery_details) then
    raise exception using errcode = '22023', message = 'Valid delivery details are required.';
  end if;
  if p_user_id is null or p_checkout_key is null then
    raise exception using errcode = '22023', message = 'User and checkout key are required.';
  end if;

  -- One checkout key is one logical attempt. A retry returns the original
  -- order even when the cart has since changed or become empty.
  perform pg_advisory_xact_lock(
    hashtextextended('shop:checkout:' || p_user_id::text || ':' || p_checkout_key::text, 0)
  );
  select * into result from public.orders
    where user_id = p_user_id and checkout_key = p_checkout_key;
  if found then
    if result.delivery_details is distinct from p_delivery_details then
      raise exception using errcode = '22023', message = 'Delivery details differ from the original checkout.';
    end if;
    return result;
  end if;

  if p_customer_email is null or length(btrim(p_customer_email)) = 0 then
    raise exception using errcode = '22023', message = 'Customer email is required.';
  end if;

  -- One statement gives the item values and amount the same database snapshot.
  -- Include inactive products in the join so they reject checkout explicitly.
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'product_id', c.product_id,
      'name', p.name,
      'unit_price_kobo', p.price_kobo,
      'quantity', c.quantity,
      'cart_revision', c.revision
    ) order by c.product_id), '[]'::jsonb),
    count(*)::integer,
    coalesce(bool_and(p.is_active), false),
    sum(c.quantity::bigint * p.price_kobo::bigint)
  into snapshot, item_count, all_active, amount
  from public.cart_items c
  join public.products p on p.id = c.product_id
  where c.user_id = p_user_id;

  if item_count = 0 then
    raise exception using errcode = '22023', message = 'Cart is empty.';
  end if;
  if item_count > 20 or not all_active then
    raise exception using errcode = '22023', message = 'Cart contains unavailable products.';
  end if;
  if amount is null or amount < 1 or amount > 9007199254740991 then
    raise exception using errcode = '22023', message = 'Cart total is out of range.';
  end if;

  insert into public.orders (
    user_id, customer_email, items, total_kobo, currency,
    checkout_key, payment_reference, delivery_details
  ) values (
    p_user_id, btrim(p_customer_email), snapshot, amount, 'NGN',
    p_checkout_key, 'cs-' || replace(gen_random_uuid()::text, '-', ''), p_delivery_details
  ) returning * into result;
  return result;
end;
$$;


revoke all on function public.create_order_snapshot(uuid,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.create_order_snapshot(uuid,text,uuid,jsonb) to service_role;
commit;
