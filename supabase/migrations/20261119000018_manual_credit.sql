-- Tambah kredit / aktifkan paket secara manual oleh superadmin (pembayaran transfer di luar payment gateway).
-- Dipanggil DENGAN SESI USER: database sendiri memeriksa superadmin + 2FA (aal2) + verifikasi 2FA ≤ 15 menit.
-- Melewati jalur yang sama dengan webhook (topup_orders → topup_order_paid → ledger & lot FIFO), idempotent per p_ref.

create or replace function public._require_billing_admin(p_step_up boolean)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_superadmin_aal2() then
    raise exception 'Hanya superadmin dengan sesi 2FA' using errcode = '42501';
  end if;
  if p_step_up and not public.mfa_recent(900) then
    raise exception 'Verifikasi ulang kode 2FA sebelum menambah kredit' using errcode = 'P0010', hint = 'step_up';
  end if;
end;
$$;

-- Cari user untuk ditampilkan sebelum menambah kredit.
create or replace function public.admin_find_user(p_email text)
returns table (user_id uuid, email text, plan public.plan_tier, balance integer, period_end timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_billing_admin(false);
  return query
    select p.id, p.email, p.plan, coalesce(b.balance, 0), s.current_period_end
    from public.profiles p
    left join public.credit_balances b on b.user_id = p.id
    left join public.subscriptions s on s.user_id = p.id
    where lower(p.email) = lower(trim(p_email))
    limit 1;
end;
$$;

create or replace function public.admin_manual_credit(
  p_email text,
  p_credits integer,
  p_amount_idr integer,
  p_note text,
  p_ref text,
  p_offer_id text default null,
  p_plan_tier public.plan_tier default null,
  p_months integer default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u uuid;
  o uuid;
  existing uuid;
  result text;
begin
  perform public._require_billing_admin(true);
  if p_credits is null or p_credits < 1 or p_credits > 1000000 then
    raise exception 'Jumlah kredit 1–1.000.000' using errcode = '22023';
  end if;
  if p_amount_idr is null or p_amount_idr < 0 or p_amount_idr > 100000000 then
    raise exception 'Nominal pembayaran 0–Rp100.000.000' using errcode = '22023';
  end if;
  if char_length(coalesce(trim(p_note), '')) < 3 or char_length(p_note) > 300 then
    raise exception 'Catatan wajib diisi (3–300 karakter), mis. bukti transfer' using errcode = '22023';
  end if;
  if p_ref !~ '^[A-Za-z0-9_-]{8,64}$' then
    raise exception 'Referensi tidak valid' using errcode = '22023';
  end if;
  if p_plan_tier is not null and (p_plan_tier = 'free' or p_months is null or p_months not between 1 and 12 or p_amount_idr = 0) then
    raise exception 'Aktivasi paket butuh tier berbayar, 1–12 bulan, dan nominal pembayaran' using errcode = '22023';
  end if;

  select id into u from public.profiles where lower(email) = lower(trim(p_email));
  if u is null then
    raise exception 'Akun % tidak ditemukan', p_email using errcode = 'P0005';
  end if;

  if p_amount_idr = 0 then
    -- Bonus / kompensasi tanpa pembayaran: langsung ke ledger, idempotent lewat referensi.
    select id into existing from public.credit_ledger where reference = 'manual:' || p_ref;
    perform public.credit_topup(u, p_credits, 'manual:' || p_ref, 'Bonus manual: ' || left(trim(p_note), 120));
    result := case when existing is null then 'paid' else 'already_paid' end;
  else
    select id into o from public.topup_orders where gateway = 'manual' and gateway_ref = p_ref;
    if o is null then
      insert into public.topup_orders (user_id, pack_id, amount_idr, credits, gateway, gateway_ref, payment_method, kind, plan_tier, months)
      values (u, coalesce(nullif(trim(p_offer_id), ''), 'manual'), p_amount_idr, p_credits, 'manual', p_ref, 'transfer manual',
              case when p_plan_tier is null then 'topup' else 'plan' end, p_plan_tier, p_months)
      returning id into o;
    end if;
    result := public.topup_order_paid(o, p_amount_idr, 'transfer manual');
  end if;

  if result = 'paid' then
    insert into public.audit_log (actor_id, action, target_type, target_id, details)
    values (auth.uid(), 'billing.manual_credit', 'profile', u::text, jsonb_build_object(
      'credits', p_credits, 'amount_idr', p_amount_idr, 'note', left(trim(p_note), 300), 'order_id', o,
      'offer', p_offer_id, 'plan', p_plan_tier, 'months', p_months, 'ref', p_ref));
  end if;
  return jsonb_build_object('status', result, 'user_id', u, 'order_id', o,
    'balance', (select balance from public.credit_balances where user_id = u),
    'plan', (select plan from public.profiles where id = u));
end;
$$;

-- Riwayat tambah kredit manual (dari audit log) untuk halaman admin.
create or replace function public.admin_manual_history(p_limit integer default 30)
returns table (at timestamptz, actor_email text, user_email text, credits integer, amount_idr integer, note text, plan text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_billing_admin(false);
  return query
    select a.created_at, ap.email, tp.email, (a.details ->> 'credits')::int, (a.details ->> 'amount_idr')::int, a.details ->> 'note', a.details ->> 'plan'
    from public.audit_log a
    left join public.profiles ap on ap.id = a.actor_id
    left join public.profiles tp on tp.id::text = a.target_id
    where a.action = 'billing.manual_credit'
    order by a.created_at desc
    limit least(greatest(p_limit, 1), 100);
end;
$$;

revoke all on function public._require_billing_admin(boolean) from public, anon, authenticated;
revoke all on function public.admin_find_user(text) from public, anon, authenticated;
revoke all on function public.admin_manual_credit(text, integer, integer, text, text, text, public.plan_tier, integer) from public, anon, authenticated;
revoke all on function public.admin_manual_history(integer) from public, anon, authenticated;
grant execute on function public.admin_find_user(text) to authenticated;
grant execute on function public.admin_manual_credit(text, integer, integer, text, text, text, public.plan_tier, integer) to authenticated;
grant execute on function public.admin_manual_history(integer) to authenticated;
grant execute on function public._require_billing_admin(boolean), public.admin_find_user(text), public.admin_manual_history(integer),
  public.admin_manual_credit(text, integer, integer, text, text, text, public.plan_tier, integer) to service_role;
