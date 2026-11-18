-- Pembayaran top-up: tandai pesanan lunas + tambah kredit dalam SATU transaksi, idempotent.
create or replace function public.topup_order_paid(p_order_id uuid, p_amount_idr integer, p_payment_method text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  o public.topup_orders;
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
  perform public.credit_topup(o.user_id, o.credits, 'order:' || o.id::text, 'Top-up paket ' || o.pack_id);
  update public.topup_orders set status = 'paid', paid_at = now(), payment_method = coalesce(p_payment_method, payment_method) where id = o.id;
  return 'paid';
end;
$$;

-- Status akhir non-lunas. Pesanan yang sudah lunas tidak pernah diturunkan statusnya.
create or replace function public.topup_order_closed(p_order_id uuid, p_status public.order_status)
returns text
language plpgsql security definer set search_path = public as $$
declare
  o public.topup_orders;
begin
  if p_status not in ('expired', 'failed') then
    raise exception 'Status tidak valid' using errcode = '22023';
  end if;
  select * into o from public.topup_orders where id = p_order_id for update;
  if not found then
    raise exception 'Pesanan tidak ditemukan' using errcode = 'P0005';
  end if;
  if o.status <> 'pending' then
    return o.status::text;
  end if;
  update public.topup_orders set status = p_status where id = o.id;
  return p_status::text;
end;
$$;

revoke all on function public.topup_order_paid(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.topup_order_closed(uuid, public.order_status) from public, anon, authenticated;
grant execute on function public.topup_order_paid(uuid, integer, text) to service_role;
grant execute on function public.topup_order_closed(uuid, public.order_status) to service_role;
