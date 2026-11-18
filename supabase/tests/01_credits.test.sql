-- Tes kredit: top-up, charge atomik, FIFO, refund, idempotensi, budget cap, BYOK, kedaluwarsa.
\set QUIET on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'GAGAL: %', msg; end if; end $$;

do $$
declare
  u uuid; ws uuid; p uuid; j public.jobs; j2 public.jobs; n integer; bal integer; err text;
begin
  insert into auth.users (email) values ('a@test.id') returning id into u;
  select id into ws from public.workspaces where owner_id = u;
  perform pg_temp.assert(ws is not null, 'workspace pribadi dibuat saat signup');
  perform pg_temp.assert(exists(select 1 from public.workspace_members where workspace_id = ws and user_id = u and role = 'owner'), 'owner jadi anggota');
  perform pg_temp.assert((select balance from public.credit_balances where user_id = u) = 0, 'saldo awal 0');

  -- Top-up idempotent
  perform public.credit_topup(u, 500, 'pay-1');
  perform public.credit_topup(u, 500, 'pay-1');
  perform pg_temp.assert((select balance from public.credit_balances where user_id = u) = 500, 'top-up ganda hanya dihitung sekali');

  insert into public.projects (workspace_id, title) values (ws, 'Kamar 7') returning id into p;

  -- Charge: 7 scene naskah standar (35) + 2 menit VO standar (52) = 87
  j := public.charge_and_enqueue(u, ws, p, null, 'text', 'script',
    '[{"category":"naskah","tier":"standar","quantity":7},{"category":"vo","tier":"standar","quantity":2}]',
    '{}', 'opencode', 'deepseek-v4-flash', '{}', 'k1', 87);
  perform pg_temp.assert(j.cost = 87, 'biaya 87');
  perform pg_temp.assert((j.cost_breakdown ->> 'vo')::int = 52, 'rincian VO 52');
  perform pg_temp.assert((select balance from public.credit_balances where user_id = u) = 413, 'saldo 413 setelah charge');

  -- Idempotensi
  j2 := public.charge_and_enqueue(u, ws, p, null, 'text', 'script',
    '[{"category":"naskah","tier":"standar","quantity":7},{"category":"vo","tier":"standar","quantity":2}]',
    '{}', 'opencode', 'deepseek-v4-flash', '{}', 'k1', 87);
  perform pg_temp.assert(j2.id = j.id, 'idempotency key mengembalikan job yang sama');
  perform pg_temp.assert((select balance from public.credit_balances where user_id = u) = 413, 'tidak dipotong dua kali');

  -- Tarif berubah di antara estimasi dan klik
  begin
    perform public.charge_and_enqueue(u, ws, p, null, 'image', 'keyframe',
      '[{"category":"image","tier":"standar","quantity":2}]', '{}', 'fal', 'flux', '{}', 'k2', 10);
    raise exception 'harusnya gagal';
  exception when sqlstate 'P0006' then null;
  end;

  -- Saldo tidak cukup: tidak ada job tersisa (atomik)
  begin
    perform public.charge_and_enqueue(u, ws, p, null, 'video', 'clip',
      '[{"category":"video","tier":"premium","quantity":60}]', '{}', 'fal', 'i2v', '{}', 'k3', null);
    raise exception 'harusnya gagal';
  exception when sqlstate 'P0002' then null;
  end;
  perform pg_temp.assert(not exists(select 1 from public.jobs where idempotency_key = 'k3'), 'job gagal charge tidak tersimpan');
  perform pg_temp.assert((select balance from public.credit_balances where user_id = u) = 413, 'saldo utuh setelah charge gagal');

  -- BYOK: dicatat, cost 0, tanpa ledger
  j := public.charge_and_enqueue(u, ws, p, null, 'text', 'research',
    '[{"category":"naskah","tier":"premium","quantity":1}]', '{"naskah":"byok"}', 'opencode', 'glm-5.2', '{}', 'k4', 0);
  perform pg_temp.assert(j.cost = 0 and j.billing_mode = 'byok', 'BYOK cost 0 & billing_mode byok');
  perform pg_temp.assert(not exists(select 1 from public.credit_ledger where job_id = j.id), 'BYOK tanpa entri ledger');

  -- Budget cap video 100 per project
  update public.projects set budget_caps = '{"video":100}' where id = p;
  j := public.charge_and_enqueue(u, ws, p, null, 'video', 'clip',
    '[{"category":"video","tier":"hemat","quantity":10}]', '{}', 'fal', 'i2v', '{}', 'k5', 80);
  begin
    perform public.charge_and_enqueue(u, ws, p, null, 'video', 'clip',
      '[{"category":"video","tier":"hemat","quantity":3}]', '{}', 'fal', 'i2v', '{}', 'k6', 24);
    raise exception 'harusnya gagal';
  exception when sqlstate 'P0007' then null;
  end;

  -- Gagal di provider → refund otomatis, idempotent
  n := public.job_fail(j.id, 'provider timeout');
  perform pg_temp.assert(n = 80, 'refund 80');
  perform pg_temp.assert(public.refund_job(j.id) = 0, 'refund kedua = 0');
  perform pg_temp.assert((select status from public.jobs where id = j.id) = 'refunded', 'status refunded');
  perform pg_temp.assert((select balance from public.credit_balances where user_id = u) = 413, 'saldo kembali 413');
  -- Setelah refund, budget terpakai turun lagi sehingga charge boleh
  perform public.charge_and_enqueue(u, ws, p, null, 'video', 'clip',
    '[{"category":"video","tier":"hemat","quantity":3}]', '{}', 'fal', 'i2v', '{}', 'k6', 24);

  -- Job sukses tidak bisa di-refund
  j := public.charge_and_enqueue(u, ws, p, null, 'image', 'keyframe',
    '[{"category":"image","tier":"hemat","quantity":1}]', '{}', 'fal', 'flux', '{}', 'k7', 3);
  perform public.job_succeed(j.id, '{"url":"x"}');
  begin
    perform public.refund_job(j.id);
    raise exception 'harusnya gagal';
  exception when sqlstate 'P0008' then null;
  end;

  -- Saldo = SUM ledger = SUM lot
  select balance into bal from public.credit_balances where user_id = u;
  perform pg_temp.assert(bal = (select sum(amount) from public.credit_ledger where user_id = u), 'saldo = SUM ledger');
  perform pg_temp.assert(bal = public.spendable_credits(u), 'saldo = SUM lot aktif');

  -- Ledger append-only
  begin
    update public.credit_ledger set amount = 1 where user_id = u;
    raise exception 'harusnya gagal';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    delete from public.credit_ledger where user_id = u;
    raise exception 'harusnya gagal';
  exception when sqlstate 'P0001' then null;
  end;

  -- Constraint, bukan cuma cek aplikasi: insert usage langsung yang bikin minus ditolak
  begin
    insert into public.credit_ledger (user_id, type, amount, job_id) values (u, 'usage', -100000, gen_random_uuid());
    raise exception 'harusnya gagal';
  exception when check_violation then null;
  end;
end $$;

-- FIFO + kedaluwarsa 12 bulan
do $$
declare u uuid; ws uuid; j public.jobs;
begin
  insert into auth.users (email) values ('fifo@test.id') returning id into u;
  select id into ws from public.workspaces where owner_id = u;
  perform public.credit_topup(u, 100, 'old', 'lama', now() - interval '13 months');
  perform public.credit_topup(u, 50, 'mid', 'tengah', now() - interval '11 months');
  perform public.credit_topup(u, 200, 'new', 'baru', now() - interval '1 month');
  -- Pemakaian 60: lot 'old' hangus dulu, lalu 50 dari 'mid' dan 10 dari 'new'
  j := public.charge_and_enqueue(u, ws, null, null, 'image', 'keyframe',
    '[{"category":"image","tier":"standar","quantity":10}]', '{}', 'fal', 'flux', '{}', 'f1', 60);
  perform pg_temp.assert((select count(*) from public.credit_ledger where user_id = u and type = 'expire') = 1, 'lot lama hangus');
  perform pg_temp.assert((select remaining from public.credit_lots l join public.credit_ledger c on c.id = l.id where c.reference = 'mid') = 0, 'lot tengah habis dulu');
  perform pg_temp.assert((select remaining from public.credit_lots l join public.credit_ledger c on c.id = l.id where c.reference = 'new') = 190, 'lot baru sisa 190');
  perform pg_temp.assert((select balance from public.credit_balances where user_id = u) = 190, 'saldo 190');
  -- Refund kembali ke lot asal
  perform public.job_fail(j.id, 'gagal');
  perform pg_temp.assert((select remaining from public.credit_lots l join public.credit_ledger c on c.id = l.id where c.reference = 'mid') = 50, 'refund ke lot tengah');
  perform pg_temp.assert((select balance from public.credit_balances where user_id = u) = 250, 'saldo 250');
end $$;

-- Charge paralel: lihat blok konkurensi di tests/run.sh.
select 'credits ok' as result;
