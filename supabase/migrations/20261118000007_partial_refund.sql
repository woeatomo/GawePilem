-- Job multi-item (mis. 12 frame kunci) bisa sukses sebagian. Item yang gagal di-refund
-- secara proporsional, dalam satu entri ledger refund (tetap satu refund per job).
create or replace function public.job_finish_partial(
  p_job_id uuid,
  p_output jsonb,
  p_refund integer,
  p_reason text default 'Sebagian item gagal di sisi provider'
)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  j public.jobs;
  charged integer;
  give integer;
  left_amount integer;
  alloc record;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job tidak ditemukan' using errcode = 'P0005';
  end if;
  if j.status in ('succeeded', 'refunded', 'canceled') then
    return 0; -- idempotent: sudah diproses
  end if;

  select coalesce(-sum(amount), 0) into charged from public.credit_ledger where job_id = p_job_id and type = 'usage';
  give := least(greatest(coalesce(p_refund, 0), 0), charged);

  if give > 0 then
    perform 1 from public.credit_balances where user_id = j.user_id for update;
    left_amount := give;
    for alloc in
      select a.* from public.credit_allocations a join public.credit_lots l on l.id = a.lot_id
      where a.job_id = p_job_id order by l.expires_at desc
    loop
      exit when left_amount = 0;
      update public.credit_lots set remaining = remaining + least(alloc.amount, left_amount) where id = alloc.lot_id;
      left_amount := left_amount - least(alloc.amount, left_amount);
    end loop;
    insert into public.credit_ledger (user_id, type, amount, job_id, description)
    values (j.user_id, 'refund', give, p_job_id, 'Refund sebagian: ' || p_reason);
  end if;

  update public.jobs
    set status = 'succeeded', output = p_output, progress = 100, finished_at = now(),
        error = case when give > 0 then p_reason else null end
    where id = p_job_id;
  return give;
end;
$$;

-- Progres job untuk UI realtime.
create or replace function public.job_progress(p_job_id uuid, p_progress integer)
returns void language sql security definer set search_path = public as $$
  update public.jobs set progress = greatest(0, least(100, p_progress)) where id = p_job_id and status = 'running';
$$;

-- Daftar user yang punya lot kedaluwarsa (untuk sapuan harian worker).
create or replace function public.users_with_due_credits(p_now timestamptz default now())
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct user_id from public.credit_lots where remaining > 0 and expires_at <= p_now;
$$;

revoke all on function public.job_finish_partial(uuid, jsonb, integer, text) from public, anon, authenticated;
revoke all on function public.job_progress(uuid, integer) from public, anon, authenticated;
revoke all on function public.users_with_due_credits(timestamptz) from public, anon, authenticated;
grant execute on function public.job_finish_partial(uuid, jsonb, integer, text) to service_role;
grant execute on function public.job_progress(uuid, integer) to service_role;
grant execute on function public.users_with_due_credits(timestamptz) to service_role;
