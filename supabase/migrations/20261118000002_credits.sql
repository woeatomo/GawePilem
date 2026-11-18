-- =====================================================================
-- Kredit: tarif, ledger append-only, saldo ber-CHECK, lot FIFO 12 bulan.
-- Aturan bisnis yang sama dites di packages/credits (TypeScript).
-- =====================================================================

create type public.ai_category as enum ('naskah', 'vo', 'image', 'video');
create type public.ai_tier as enum ('hemat', 'standar', 'premium');
create type public.billing_mode as enum ('saldo', 'byok');
create type public.ledger_type as enum ('topup', 'usage', 'refund', 'expire', 'adjustment');

-- Tarif bisa diubah admin. Seed di supabase/seed.sql.
create table public.rates (
  category public.ai_category not null,
  tier public.ai_tier not null,
  credits_per_unit numeric(10, 3) not null check (credits_per_unit >= 0),
  unit_label text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  primary key (category, tier)
);

-- Ledger append-only. Saldo = SUM(amount). user_id/job_id sengaja tanpa FK cascade:
-- catatan keuangan wajib bertahan walau akun dihapus (UU PDP mengizinkan retensi untuk kewajiban hukum).
create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type public.ledger_type not null,
  amount integer not null check (amount <> 0),
  job_id uuid,
  lot_id uuid,
  expires_at timestamptz,
  -- Referensi eksternal unik (id pembayaran gateway) agar webhook top-up idempotent.
  reference text unique,
  description text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ledger_sign check (
    (type = 'topup' and amount > 0 and expires_at is not null)
    or (type = 'usage' and amount < 0 and job_id is not null)
    or (type = 'refund' and amount > 0 and job_id is not null)
    or (type = 'expire' and amount < 0 and lot_id is not null)
    or (type = 'adjustment')
  )
);
create index credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);
create index credit_ledger_job_idx on public.credit_ledger (job_id) where job_id is not null;
-- Satu job paling banyak satu refund.
create unique index credit_ledger_one_refund_per_job on public.credit_ledger (job_id) where type = 'refund';
create unique index credit_ledger_one_expire_per_lot on public.credit_ledger (lot_id) where type = 'expire';

create trigger credit_ledger_append_only before update or delete on public.credit_ledger
  for each row execute function public.forbid_mutation();
create trigger credit_ledger_no_truncate before truncate on public.credit_ledger
  for each statement execute function public.forbid_mutation();

-- Cache saldo yang dijaga trigger. CHECK di sini = pengaman terakhir saldo negatif,
-- tidak bergantung pada pengecekan aplikasi.
create table public.credit_balances (
  user_id uuid primary key,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create or replace function public.apply_ledger_to_balance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- UPDATE dulu (bukan INSERT ... ON CONFLICT) karena CHECK dievaluasi pada baris usulan insert.
  update public.credit_balances set balance = balance + new.amount, updated_at = now()
  where user_id = new.user_id;
  if not found then
    insert into public.credit_balances (user_id, balance) values (new.user_id, new.amount);
  end if;
  return new;
end;
$$;

create trigger credit_ledger_apply after insert on public.credit_ledger
  for each row execute function public.apply_ledger_to_balance();

-- Lot FIFO (state turunan, boleh berubah). Satu lot per top-up/adjustment positif.
create table public.credit_lots (
  id uuid primary key, -- = credit_ledger.id dari entri pembentuknya
  user_id uuid not null,
  original integer not null check (original > 0),
  remaining integer not null check (remaining >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (remaining <= original)
);
create index credit_lots_user_fifo_idx on public.credit_lots (user_id, expires_at) where remaining > 0;

-- Jejak lot mana yang dipakai tiap job, untuk refund ke lot asal.
create table public.credit_allocations (
  job_id uuid not null,
  lot_id uuid not null references public.credit_lots (id),
  amount integer not null check (amount >= 0),
  primary key (job_id, lot_id)
);

-- Pesanan top-up (payment gateway lokal: QRIS, VA, e-wallet).
create type public.order_status as enum ('pending', 'paid', 'expired', 'failed');
create table public.topup_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  pack_id text not null,
  amount_idr integer not null check (amount_idr > 0),
  credits integer not null check (credits > 0),
  status public.order_status not null default 'pending',
  gateway text not null,
  gateway_ref text unique,
  payment_method text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Fungsi kredit. Semua SECURITY DEFINER dan hanya bisa dipanggil service_role.
-- ---------------------------------------------------------------------

-- Tutup lot yang sudah lewat masa berlaku. Dipanggil sebelum charge dan oleh cron worker.
create or replace function public.expire_due_credits(p_user_id uuid, p_now timestamptz default now())
returns integer
language plpgsql security definer set search_path = public as $$
declare
  lot record;
  total integer := 0;
begin
  for lot in
    select * from public.credit_lots
    where user_id = p_user_id and remaining > 0 and expires_at <= p_now
    order by expires_at
    for update
  loop
    insert into public.credit_ledger (user_id, type, amount, lot_id, description)
    values (p_user_id, 'expire', -lot.remaining, lot.id, 'Kredit hangus (12 bulan sejak top-up)');
    update public.credit_lots set remaining = 0 where id = lot.id;
    total := total + lot.remaining;
  end loop;
  return total;
end;
$$;

-- Top-up idempotent berdasarkan reference (mis. id transaksi gateway).
create or replace function public.credit_topup(
  p_user_id uuid,
  p_amount integer,
  p_reference text,
  p_description text default 'Top-up saldo',
  p_now timestamptz default now()
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  entry_id uuid;
  exp timestamptz := p_now + interval '12 months';
begin
  if p_amount <= 0 then
    raise exception 'Jumlah top-up harus positif' using errcode = '22023';
  end if;

  select id into entry_id from public.credit_ledger where reference = p_reference;
  if found then
    return entry_id; -- webhook dikirim ulang: abaikan.
  end if;

  insert into public.credit_ledger (user_id, type, amount, expires_at, reference, description, created_at)
  values (p_user_id, 'topup', p_amount, exp, p_reference, p_description, p_now)
  returning id into entry_id;

  insert into public.credit_lots (id, user_id, original, remaining, expires_at, created_at)
  values (entry_id, p_user_id, p_amount, p_amount, exp, p_now);

  return entry_id;
end;
$$;

-- Ambil kredit FIFO dari lot (lot paling cepat hangus dulu). Wajib dipanggil di dalam transaksi
-- yang sudah mengunci baris credit_balances user.
create or replace function public._allocate_credits(p_user_id uuid, p_job_id uuid, p_amount integer, p_now timestamptz)
returns void
language plpgsql security definer set search_path = public as $$
declare
  lot record;
  left_amount integer := p_amount;
  take integer;
begin
  for lot in
    select * from public.credit_lots
    where user_id = p_user_id and remaining > 0 and expires_at > p_now
    order by expires_at, created_at
    for update
  loop
    exit when left_amount = 0;
    take := least(lot.remaining, left_amount);
    update public.credit_lots set remaining = remaining - take where id = lot.id;
    insert into public.credit_allocations (job_id, lot_id, amount) values (p_job_id, lot.id, take)
      on conflict (job_id, lot_id) do update set amount = credit_allocations.amount + excluded.amount;
    left_amount := left_amount - take;
  end loop;

  if left_amount > 0 then
    raise exception 'Saldo tidak cukup' using errcode = 'P0002', hint = 'insufficient_credits';
  end if;
end;
$$;

-- Saldo yang bisa dipakai sekarang (tanpa lot hangus).
create or replace function public.spendable_credits(p_user_id uuid, p_now timestamptz default now())
returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(remaining), 0)::integer from public.credit_lots
  where user_id = p_user_id and remaining > 0 and expires_at > p_now;
$$;

-- Hitung biaya dari tabel rates (sumber kebenaran server, bukan dari client).
-- p_items: [{"category":"video","tier":"standar","quantity":12.5}, ...]
-- Pembulatan ke atas per item, sama dengan packages/credits/estimateLine.
create or replace function public.compute_cost(p_items jsonb, p_billing jsonb default '{}'::jsonb)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  item jsonb;
  cat public.ai_category;
  tr public.ai_tier;
  qty numeric;
  rate numeric;
  line integer;
  by_cat jsonb := '{"naskah":0,"vo":0,"image":0,"video":0}'::jsonb;
  total integer := 0;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'items harus array' using errcode = '22023';
  end if;
  for item in select * from jsonb_array_elements(p_items) loop
    cat := (item ->> 'category')::public.ai_category;
    tr := (item ->> 'tier')::public.ai_tier;
    qty := (item ->> 'quantity')::numeric;
    if qty is null or qty < 0 then
      raise exception 'quantity tidak valid' using errcode = '22023';
    end if;
    if coalesce(p_billing ->> cat::text, 'saldo') = 'byok' then
      line := 0;
    else
      select credits_per_unit into rate from public.rates where category = cat and tier = tr;
      if rate is null then
        raise exception 'Tarif %/% tidak ditemukan', cat, tr using errcode = 'P0003';
      end if;
      line := ceil(round(rate * qty, 6))::integer;
    end if;
    by_cat := jsonb_set(by_cat, array[cat::text], to_jsonb((by_cat ->> cat::text)::integer + line));
    total := total + line;
  end loop;
  return jsonb_build_object('byCategory', by_cat, 'total', total);
end;
$$;
