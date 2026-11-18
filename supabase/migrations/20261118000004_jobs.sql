-- =====================================================================
-- Provider settings, jobs, dan RPC charge_and_enqueue / refund.
-- =====================================================================

create table public.provider_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  category public.ai_category not null,
  provider text not null,
  model text not null,
  mode public.billing_mode not null default 'saldo',
  tier public.ai_tier not null default 'standar',
  -- AES-256-GCM, dienkripsi di server. TIDAK PERNAH dikirim ke client (lihat GRANT di bawah).
  encrypted_key text,
  key_hint text,
  updated_at timestamptz not null default now(),
  unique (workspace_id, category),
  check (mode = 'saldo' or encrypted_key is not null)
);
create trigger provider_settings_touch before update on public.provider_settings
  for each row execute function public.touch_updated_at();

create type public.job_type as enum ('text', 'image', 'video', 'vo', 'stt', 'render', 'publish', 'moderation');
create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'refunded', 'canceled');

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  episode_id uuid references public.episodes (id) on delete set null,
  type public.job_type not null,
  -- Aksi produk, mis. 'research', 'characters', 'script.scene', 'shotlist', 'keyframe'.
  action text not null,
  category public.ai_category,
  billing_mode public.billing_mode not null default 'saldo',
  provider text,
  model text,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  -- {"naskah":5,"image":24,...}
  cost_breakdown jsonb not null default '{}'::jsonb,
  cost integer not null default 0 check (cost >= 0),
  status public.job_status not null default 'queued',
  progress integer not null default 0 check (progress between 0 and 100),
  error text,
  attempts integer not null default 0,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (user_id, idempotency_key)
);
create index jobs_ws_idx on public.jobs (workspace_id, created_at desc);
create index jobs_project_idx on public.jobs (project_id) where project_id is not null;
create index jobs_status_idx on public.jobs (status) where status in ('queued', 'running');

-- ---------------------------------------------------------------------
-- charge_and_enqueue: potong saldo + buat job dalam SATU transaksi.
-- - Biaya dihitung ulang dari tabel rates (client tidak dipercaya).
-- - p_expected_total = angka estimasi yang dilihat user. Kalau tarif berubah
--   di antara estimasi dan klik, tolak supaya user mengonfirmasi ulang.
-- - Budget cap per kategori per project dicek di sini.
-- - Idempotent: idempotency_key yang sama mengembalikan job yang sama.
-- ---------------------------------------------------------------------
create or replace function public.charge_and_enqueue(
  p_user_id uuid,
  p_workspace_id uuid,
  p_project_id uuid,
  p_episode_id uuid,
  p_type public.job_type,
  p_action text,
  p_items jsonb,
  p_billing jsonb,
  p_provider text,
  p_model text,
  p_input jsonb,
  p_idempotency_key text,
  p_expected_total integer default null,
  p_now timestamptz default now()
)
returns public.jobs
language plpgsql security definer set search_path = public as $$
declare
  existing public.jobs;
  new_job public.jobs;
  cost jsonb;
  total integer;
  caps jsonb;
  cat text;
  cap integer;
  spent integer;
  primary_cat public.ai_category;
  bal integer;
begin
  select * into existing from public.jobs where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    return existing;
  end if;

  if not exists (select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id) then
    raise exception 'Bukan anggota workspace' using errcode = '42501';
  end if;
  if p_project_id is not null and not exists (
    select 1 from public.projects where id = p_project_id and workspace_id = p_workspace_id
  ) then
    raise exception 'Project tidak ditemukan' using errcode = 'P0005';
  end if;

  cost := public.compute_cost(p_items, coalesce(p_billing, '{}'::jsonb));
  total := (cost ->> 'total')::integer;

  if p_expected_total is not null and p_expected_total <> total then
    raise exception 'Tarif berubah: estimasi % kredit, sekarang % kredit', p_expected_total, total
      using errcode = 'P0006', hint = 'rate_changed';
  end if;

  if p_project_id is not null then
    select budget_caps into caps from public.projects where id = p_project_id for update;
    for cat in select key from jsonb_each(coalesce(caps, '{}'::jsonb)) where jsonb_typeof(value) = 'number' loop
      cap := (caps ->> cat)::integer;
      if (cost -> 'byCategory' ->> cat)::integer > 0 then
        select coalesce(sum((j.cost_breakdown ->> cat)::integer), 0) into spent
        from public.jobs j
        where j.project_id = p_project_id and j.status not in ('refunded', 'canceled');
        if spent + (cost -> 'byCategory' ->> cat)::integer > cap then
          raise exception 'Budget cap % terlampaui: terpakai %, diminta %, batas %',
            cat, spent, (cost -> 'byCategory' ->> cat)::integer, cap
            using errcode = 'P0007', hint = 'budget_cap';
        end if;
      end if;
    end loop;
  end if;

  select (e ->> 'category')::public.ai_category into primary_cat
  from jsonb_array_elements(p_items) e limit 1;

  insert into public.jobs (
    workspace_id, user_id, project_id, episode_id, type, action, category, billing_mode,
    provider, model, input, cost_breakdown, cost, idempotency_key, created_at
  ) values (
    p_workspace_id, p_user_id, p_project_id, p_episode_id, p_type, p_action, primary_cat,
    case when total = 0 and exists (select 1 from jsonb_each_text(coalesce(p_billing, '{}'::jsonb)) where value = 'byok')
      then 'byok'::public.billing_mode else 'saldo'::public.billing_mode end,
    p_provider, p_model, coalesce(p_input, '{}'::jsonb), cost -> 'byCategory', total, p_idempotency_key, p_now
  ) returning * into new_job;

  if total > 0 then
    -- Kunci baris saldo user supaya charge paralel diserialisasi.
    insert into public.credit_balances (user_id, balance) values (p_user_id, 0) on conflict do nothing;
    select balance into bal from public.credit_balances where user_id = p_user_id for update;

    perform public.expire_due_credits(p_user_id, p_now);
    perform public._allocate_credits(p_user_id, new_job.id, total, p_now);

    insert into public.credit_ledger (user_id, type, amount, job_id, description, metadata, created_at)
    values (p_user_id, 'usage', -total, new_job.id, p_action, jsonb_build_object('byCategory', cost -> 'byCategory'), p_now);
  end if;

  return new_job;
end;
$$;

-- Refund otomatis saat job gagal di sisi provider. Idempotent (unique index satu refund per job).
create or replace function public.refund_job(p_job_id uuid, p_reason text default 'Job gagal di sisi provider')
returns integer
language plpgsql security definer set search_path = public as $$
declare
  j public.jobs;
  charged integer;
  alloc record;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job tidak ditemukan' using errcode = 'P0005';
  end if;
  if j.status = 'refunded' then
    return 0;
  end if;
  if j.status = 'succeeded' then
    raise exception 'Job sukses tidak bisa di-refund otomatis' using errcode = 'P0008';
  end if;

  select coalesce(-sum(amount), 0) into charged from public.credit_ledger where job_id = p_job_id and type = 'usage';

  if charged > 0 then
    perform 1 from public.credit_balances where user_id = j.user_id for update;
    -- Kembalikan ke lot asal. Lot yang sudah hangus akan ditutup lagi oleh expire_due_credits.
    for alloc in select * from public.credit_allocations where job_id = p_job_id loop
      update public.credit_lots set remaining = remaining + alloc.amount where id = alloc.lot_id;
    end loop;
    insert into public.credit_ledger (user_id, type, amount, job_id, description)
    values (j.user_id, 'refund', charged, p_job_id, 'Refund: ' || p_reason);
  end if;

  update public.jobs
    set status = 'refunded', error = coalesce(error, p_reason), finished_at = coalesce(finished_at, now())
    where id = p_job_id;
  return charged;
end;
$$;

-- Transisi status job oleh worker.
create or replace function public.job_mark_running(p_job_id uuid)
returns public.jobs language plpgsql security definer set search_path = public as $$
declare j public.jobs;
begin
  update public.jobs set status = 'running', started_at = coalesce(started_at, now()), attempts = attempts + 1
  where id = p_job_id and status in ('queued', 'running')
  returning * into j;
  return j;
end;
$$;

create or replace function public.job_succeed(p_job_id uuid, p_output jsonb)
returns public.jobs language plpgsql security definer set search_path = public as $$
declare j public.jobs;
begin
  update public.jobs set status = 'succeeded', output = p_output, progress = 100, finished_at = now(), error = null
  where id = p_job_id and status in ('queued', 'running')
  returning * into j;
  return j;
end;
$$;

-- Gagal permanen → tandai failed lalu refund dalam transaksi yang sama.
create or replace function public.job_fail(p_job_id uuid, p_error text)
returns integer language plpgsql security definer set search_path = public as $$
begin
  update public.jobs set status = 'failed', error = p_error, finished_at = now()
  where id = p_job_id and status in ('queued', 'running');
  return public.refund_job(p_job_id, p_error);
end;
$$;

-- Ringkasan pemakaian per kategori (untuk halaman Saldo & tarif).
create or replace function public.usage_by_category(p_user_id uuid, p_since timestamptz default now() - interval '30 days')
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'naskah', coalesce(sum((cost_breakdown ->> 'naskah')::integer), 0),
    'vo', coalesce(sum((cost_breakdown ->> 'vo')::integer), 0),
    'image', coalesce(sum((cost_breakdown ->> 'image')::integer), 0),
    'video', coalesce(sum((cost_breakdown ->> 'video')::integer), 0)
  )
  from public.jobs
  where user_id = p_user_id and created_at >= p_since and status not in ('refunded', 'canceled');
$$;
