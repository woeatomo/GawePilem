-- Kredit manual: hanya superadmin + aal2 + 2FA baru; idempotent; bisa aktifkan paket; tercatat di audit.
\set QUIET on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'GAGAL: %', msg; end if; end $$;

insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555555', 'boss@test.id'),
  ('66666666-6666-6666-6666-666666666666', 'customer@test.id');
update public.profiles set is_superadmin = true where id = '55555555-5555-5555-5555-555555555555';
create temp table ctx2 (k text, v text);
insert into ctx2 values
  ('ok', jsonb_build_object('sub', '55555555-5555-5555-5555-555555555555', 'aal', 'aal2', 'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)))::text),
  ('stale', jsonb_build_object('sub', '55555555-5555-5555-5555-555555555555', 'aal', 'aal2', 'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint - 3600)))::text),
  ('cust', jsonb_build_object('sub', '66666666-6666-6666-6666-666666666666', 'aal', 'aal2', 'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)))::text);
grant select on ctx2 to authenticated;

begin;
set local role authenticated;
select set_config('request.jwt.claims', (select v from ctx2 where k = 'ok'), true), set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select pg_temp.assert((select balance from public.admin_find_user('Customer@Test.id')) = 0, 'cari user (huruf besar/kecil)');
-- transfer biasa
select pg_temp.assert(public.admin_manual_credit('customer@test.id', 1500, 150000, 'Transfer BCA 20/11', 'ref-transfer-0001') ->> 'status' = 'paid', 'kredit masuk');
select pg_temp.assert(public.admin_manual_credit('customer@test.id', 1500, 150000, 'Transfer BCA 20/11', 'ref-transfer-0001') ->> 'status' = 'already_paid', 'klik ganda tidak menggandakan');
-- bonus tanpa bayar
select pg_temp.assert(public.admin_manual_credit('customer@test.id', 200, 0, 'Kompensasi render gagal', 'ref-bonus-00001') ->> 'status' = 'paid', 'bonus');
select pg_temp.assert(public.admin_manual_credit('customer@test.id', 200, 0, 'Kompensasi render gagal', 'ref-bonus-00001') ->> 'status' = 'already_paid', 'bonus idempotent');
-- aktivasi paket Pro 1 bulan
select pg_temp.assert(public.admin_manual_credit('customer@test.id', 4990, 499000, 'Transfer paket Pro', 'ref-plan-pro-001', 'pro-1m', 'pro', 1) ->> 'plan' = 'pro', 'paket aktif');
select pg_temp.assert((select balance from public.admin_find_user('customer@test.id')) = 1500 + 200 + 4990, 'saldo');
select pg_temp.assert((select count(*) from public.admin_manual_history()) = 3, 'riwayat 3 aksi (ulang tidak dicatat)');
do $$ begin
  perform public.admin_manual_credit('tidakada@test.id', 10, 1000, 'x transfer', 'ref-missing-001');
  raise exception 'GAGAL: user tidak ada diterima';
exception when sqlstate 'P0005' then null;
end $$;
do $$ begin
  perform public.admin_manual_credit('customer@test.id', 10, 1000, '', 'ref-nonote-0001');
  raise exception 'GAGAL: tanpa catatan diterima';
exception when sqlstate '22023' then null;
end $$;
commit;

-- 2FA lama: ditolak untuk menambah, tetap boleh mencari
begin;
set local role authenticated;
select set_config('request.jwt.claims', (select v from ctx2 where k = 'stale'), true), set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select pg_temp.assert((select count(*) from public.admin_find_user('customer@test.id')) = 1, 'cari tanpa step-up');
do $$ begin
  perform public.admin_manual_credit('customer@test.id', 10, 1000, 'transfer', 'ref-stale-00001');
  raise exception 'GAGAL: tanpa step-up diterima';
exception when sqlstate 'P0010' then null;
end $$;
rollback;

-- User biasa: ditolak
begin;
set local role authenticated;
select set_config('request.jwt.claims', (select v from ctx2 where k = 'cust'), true), set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
do $$ begin
  perform public.admin_manual_credit('customer@test.id', 99999, 1, 'curang', 'ref-cheat-00001');
  raise exception 'GAGAL: user biasa bisa menambah kredit';
exception when insufficient_privilege then null;
end $$;
rollback;
select 'kredit manual ok' as result;
