-- Paket & langganan prabayar. Pembayaran memakai jalur pesanan yang sama dengan top-up
-- (Midtrans Snap + webhook terverifikasi); pesanan jenis 'plan' juga mengaktifkan paket.
alter table public.topup_orders
  add column kind text not null default 'topup' check (kind in ('topup', 'plan')),
  add column plan_tier public.plan_tier,
  add column months integer check (months between 1 and 12),
  add constraint topup_orders_plan_fields check (kind = 'topup' or (plan_tier is not null and plan_tier <> 'free' and months is not null));

create table public.subscriptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  tier public.plan_tier not null check (tier <> 'free'),
  offer_id text not null,
  current_period_end timestamptz not null,
  reminded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscriptions_touch before update on public.subscriptions for each row execute function public.touch_updated_at();
alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
create policy subscriptions_own on public.subscriptions for select to authenticated using (user_id = auth.uid());

-- Pesanan lunas: kredit masuk + (untuk paket) langganan aktif/diperpanjang, dalam SATU transaksi, idempotent.
create or replace function public.topup_order_paid(p_order_id uuid, p_amount_idr integer, p_payment_method text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  o public.topup_orders;
  s public.subscriptions;
  period_end timestamptz;
begin
  select * into o from public.topup_orders where id = p_order_id for update;
  if not found then
    raise exception 'Pesanan tidak ditemukan' using errcode = 'P0005';
  end if;
  if o.status = 'paid' then
    return 'already_paid'; -- webhook dikirim ulang
  end if;
  if o.amount_idr <> p_amount_idr then
    raise exception 'Nominal pembayaran % tidak cocok dengan pesanan %', p_amount_idr, o.amount_idr using errcode = 'P0009';
  end if;
  perform public.credit_topup(o.user_id, o.credits, 'order:' || o.id::text,
    case when o.kind = 'plan' then 'Paket ' || o.pack_id else 'Top-up paket ' || o.pack_id end);
  if o.kind = 'plan' then
    select * into s from public.subscriptions where user_id = o.user_id for update;
    -- Paket sama yang masih aktif diperpanjang dari akhir periode; selain itu mulai sekarang.
    if found and s.tier = o.plan_tier and s.current_period_end > now() then
      period_end := s.current_period_end + make_interval(months => o.months);
    else
      period_end := now() + make_interval(months => o.months);
    end if;
    insert into public.subscriptions (user_id, tier, offer_id, current_period_end)
      values (o.user_id, o.plan_tier, o.pack_id, period_end)
      on conflict (user_id) do update set tier = excluded.tier, offer_id = excluded.offer_id, current_period_end = excluded.current_period_end, reminded_at = null;
    update public.profiles set plan = o.plan_tier where id = o.user_id;
  end if;
  update public.topup_orders set status = 'paid', paid_at = now(), payment_method = coalesce(p_payment_method, payment_method) where id = o.id;
  return 'paid';
end;
$$;
revoke all on function public.topup_order_paid(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.topup_order_paid(uuid, integer, text) to service_role;

-- Turunkan paket yang periodenya habis ke 'free' (dipanggil cron Worker job). Mengembalikan jumlah user.
create or replace function public.expire_subscriptions()
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with due as (
    select user_id from public.subscriptions where current_period_end <= now()
  )
  update public.profiles p set plan = 'free'
    from due where p.id = due.user_id and p.plan <> 'free';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.expire_subscriptions() from public, anon, authenticated;
grant execute on function public.expire_subscriptions() to service_role;
