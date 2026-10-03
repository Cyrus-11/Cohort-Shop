begin;

-- Only INSERT/UPDATE signals are published. Cart DELETE payloads never need to
-- be exposed: an owner-only revision update tells clients to reload the API.
create table public.cart_sync (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision uuid not null default gen_random_uuid()
);
alter table public.cart_sync enable row level security;
revoke all on public.cart_sync from public, anon, authenticated, service_role;
grant select on public.cart_sync to authenticated;
grant select, insert, update, delete on public.cart_sync to service_role;
create policy cart_sync_owner_read on public.cart_sync for select to authenticated
  using ((select auth.uid()) = user_id);

create function shop_private.signal_cart_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.cart_sync(user_id, revision)
  values (case when tg_op = 'DELETE' then old.user_id else new.user_id end, gen_random_uuid())
  on conflict (user_id) do update set revision = excluded.revision;
  return null;
end;
$$;
revoke all on function shop_private.signal_cart_change() from public, anon, authenticated, service_role;
create trigger cart_sync_signal after insert or update or delete on public.cart_items
  for each row execute function shop_private.signal_cart_change();

do $$
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.cart_sync;
  end if;
end;
$$;
commit;
