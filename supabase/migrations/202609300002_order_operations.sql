-- These RPCs are callable only by the server's service role. Application code
-- must verify the signed-in customer or Paystack signature before using them.
begin;

create function public.create_order_snapshot(
  p_user_id uuid,
  p_customer_email text,
  p_checkout_key uuid
)
returns public.orders language plpgsql security invoker set search_path = '' as $$
declare
  result public.orders;
  snapshot jsonb;
  item_count integer;
  all_active boolean;
  amount bigint;
begin
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
    checkout_key, payment_reference
  ) values (
    p_user_id, btrim(p_customer_email), snapshot, amount, 'NGN',
    p_checkout_key, 'cs-' || replace(gen_random_uuid()::text, '-', '')
  ) returning * into result;
  return result;
end;
$$;

create function public.finalize_paid_order(
  p_order_id uuid,
  p_reference text,
  p_amount_kobo bigint,
  p_currency text
)
returns public.orders language plpgsql security invoker set search_path = '' as $$
declare
  result public.orders;
begin
  select * into result from public.orders where id = p_order_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Order was not found.';
  end if;
  -- Provider verification and test/live domain matching happen in server code.
  -- This check also makes a mismatched/stale verified result harmless.
  if p_reference is distinct from result.payment_reference
    or p_amount_kobo is distinct from result.total_kobo
    or p_currency is distinct from result.currency then
    raise exception using errcode = '22023', message = 'Verified payment does not match order.';
  end if;
  if result.payment_status = 'paid' then
    return result;
  end if;

  update public.orders set payment_status = 'paid', paid_at = clock_timestamp()
    where id = p_order_id returning * into result;

  -- A changed or removed/re-added cart row has another revision and survives.
  delete from public.cart_items c
    where c.user_id = result.user_id
      and exists (
        select 1 from jsonb_array_elements(result.items) item
        where (item->>'product_id')::uuid = c.product_id
          and (item->>'cart_revision')::uuid = c.revision
      );
  return result;
end;
$$;

create function public.claim_order_email(p_order_id uuid)
returns setof public.orders language plpgsql security invoker set search_path = '' as $$
begin
  return query
    update public.orders
       set email_status = 'sending',
           email_attempt_at = clock_timestamp(),
           email_attempt_id = gen_random_uuid(),
           mailgun_message_id = null
     where id = p_order_id
       and payment_status = 'paid'
       and email_status in ('pending', 'failed')
     returning *;
end;
$$;

create function public.complete_order_email(
  p_order_id uuid,
  p_attempt_id uuid,
  p_status text,
  p_message_id text default null
)
returns setof public.orders language plpgsql security invoker set search_path = '' as $$
begin
  if p_status not in ('accepted', 'failed') or p_status is null then
    raise exception using errcode = '22023', message = 'Email result must be accepted or failed.';
  end if;
  if p_status = 'accepted' and (p_message_id is null or length(btrim(p_message_id)) = 0) then
    raise exception using errcode = '22023', message = 'Accepted email requires a message ID.';
  end if;
  return query
    update public.orders
       set email_status = p_status,
           mailgun_message_id = case when p_status = 'accepted' then btrim(p_message_id) else null end
     where id = p_order_id
       and email_status = 'sending'
       and email_attempt_id = p_attempt_id
     returning *;
end;
$$;

revoke all on function public.create_order_snapshot(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.finalize_paid_order(uuid, text, bigint, text) from public, anon, authenticated;
revoke all on function public.claim_order_email(uuid) from public, anon, authenticated;
revoke all on function public.complete_order_email(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_order_snapshot(uuid, text, uuid) to service_role;
grant execute on function public.finalize_paid_order(uuid, text, bigint, text) to service_role;
grant execute on function public.claim_order_email(uuid) to service_role;
grant execute on function public.complete_order_email(uuid, uuid, text, text) to service_role;

commit;
