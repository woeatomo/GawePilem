-- Paket: aktivasi lewat pesanan lunas, perpanjangan paket sama, ganti paket, kedaluwarsa, akses baca sendiri.
\set QUIET on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'GAGAL: %', msg; end if; end $$;

do $$
declare u uuid; o1 uuid; o2 uuid; o3 uuid; e1 timestamptz;
begin
  insert into auth.users (email) values ('plan@test.id') returning id into u;
  -- pesanan paket wajib membawa tier & bulan
  begin
    insert into public.topup_orders (user_id, pack_id, amount_idr, credits, gateway, kind) values (u, 'pro-1m', 499000, 4990, 'midtrans', 'plan');
    raise exception 'harusnya gagal';
  exception when check_violation then null;
  end;
  insert into public.topup_orders (user_id, pack_id, amount_idr, credits, gateway, kind, plan_tier, months) values (u, 'pro-1m', 499000, 4990, 'midtrans', 'plan', 'pro', 1) returning id into o1;
  perform pg_temp.assert(public.topup_order_paid(o1, 499000) = 'paid', 'lunas');
  perform pg_temp.assert((select plan from public.profiles where id = u) = 'pro', 'paket aktif');
  perform pg_temp.assert((select balance from public.credit_balances where user_id = u) = 4990, 'kredit paket masuk');
  select current_period_end into e1 from public.subscriptions where user_id = u;
  perform pg_temp.assert(e1 > now() + interval '27 days', 'periode 1 bulan');
  perform pg_temp.assert(public.topup_order_paid(o1, 499000) = 'already_paid', 'idempotent');

  -- paket sama → diperpanjang dari akhir periode
  insert into public.topup_orders (user_id, pack_id, amount_idr, credits, gateway, kind, plan_tier, months) values (u, 'pro-3m', 1347000, 14970, 'midtrans', 'plan', 'pro', 3) returning id into o2;
  perform public.topup_order_paid(o2, 1347000);
  perform pg_temp.assert((select current_period_end from public.subscriptions where user_id = u) = e1 + interval '3 months', 'perpanjangan menumpuk');

  -- ganti ke studio → mulai sekarang
  insert into public.topup_orders (user_id, pack_id, amount_idr, credits, gateway, kind, plan_tier, months) values (u, 'studio-1m', 1490000, 14900, 'midtrans', 'plan', 'studio', 1) returning id into o3;
  perform public.topup_order_paid(o3, 1490000);
  perform pg_temp.assert((select tier from public.subscriptions where user_id = u) = 'studio', 'tier diganti');
  perform pg_temp.assert((select plan from public.profiles where id = u) = 'studio', 'profil ikut');

  -- kedaluwarsa
  update public.subscriptions set current_period_end = now() - interval '1 minute' where user_id = u;
  perform pg_temp.assert(public.expire_subscriptions() = 1, 'satu user turun');
  perform pg_temp.assert((select plan from public.profiles where id = u) = 'free', 'kembali gratis');
  perform pg_temp.assert(public.expire_subscriptions() = 0, 'idempotent');
  perform pg_temp.assert((select balance from public.credit_balances where user_id = u) = 4990 + 14970 + 14900, 'kredit tetap milik user');
end $$;

begin;
set local role authenticated;
do $$ begin
  perform public.expire_subscriptions();
  raise exception 'GAGAL: client bisa menjalankan expire';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.subscriptions (user_id, tier, offer_id, current_period_end) values (gen_random_uuid(), 'pro', 'x', now());
  raise exception 'GAGAL: client bisa menulis langganan';
exception when insufficient_privilege then null;
end $$;
rollback;
select 'langganan ok' as result;
