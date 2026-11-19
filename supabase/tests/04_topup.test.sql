-- Pesanan top-up: lunas idempotent, nominal harus cocok, status lunas tidak diturunkan.
\set QUIET on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'GAGAL: %', msg; end if; end $$;

do $$
declare u uuid; o uuid;
begin
  insert into auth.users (email) values ('pay@test.id') returning id into u;
  insert into public.topup_orders (user_id, pack_id, amount_idr, credits, gateway) values (u, 'creator', 150000, 1600, 'midtrans') returning id into o;
  begin
    perform public.topup_order_paid(o, 1000);
    raise exception 'harusnya gagal';
  exception when sqlstate 'P0009' then null;
  end;
  perform pg_temp.assert(public.topup_order_paid(o, 150000, 'qris') = 'paid', 'lunas');
  perform pg_temp.assert(public.topup_order_paid(o, 150000) = 'already_paid', 'webhook ulang diabaikan');
  perform pg_temp.assert((select balance from public.credit_balances where user_id = u) = 1600, 'kredit masuk sekali');
  perform pg_temp.assert(public.topup_order_closed(o, 'expired') = 'paid', 'lunas tidak diturunkan');
  perform pg_temp.assert((select payment_method from public.topup_orders where id = o) = 'qris', 'metode tercatat');
end $$;

begin;
set local role authenticated;
do $$ begin
  perform public.topup_order_paid(gen_random_uuid(), 1);
  raise exception 'GAGAL: client bisa menandai lunas';
exception when insufficient_privilege then null;
end $$;
rollback;
select 'topup ok' as result;
